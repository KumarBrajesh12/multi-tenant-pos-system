import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppException } from '../exceptions/app.exception';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
  requestId?: string;
}

/** Postgres SQLSTATE codes we translate into client errors. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_INVALID_TEXT_REPRESENTATION = '22P02';

/**
 * Renders every error in one consistent shape and makes sure SQL, stack
 * traces and other internals never reach the client. Unexpected errors are
 * logged with the request id so they can be correlated with the response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const res = ctx.getResponse<Response>();

    const { status, code, message, details } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `[${req.requestId ?? '-'}] ${req.method} ${req.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'ERROR',
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    };
    res.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      // ValidationPipe puts an array of messages in `message`
      if (typeof response === 'object' && response !== null) {
        const r = response as { message?: string | string[] };
        if (Array.isArray(r.message)) {
          return { status, code: 'VALIDATION_FAILED', message: 'Request validation failed', details: r.message };
        }
        return { status, code: this.defaultCode(status), message: r.message ?? exception.message };
      }
      return { status, code: this.defaultCode(status), message: String(response) };
    }

    if (exception instanceof QueryFailedError) {
      const pgCode = (exception as QueryFailedError & { driverError?: { code?: string } }).driverError
        ?.code;
      switch (pgCode) {
        case PG_UNIQUE_VIOLATION:
          return { status: HttpStatus.CONFLICT, code: 'CONFLICT', message: 'Resource already exists' };
        case PG_FOREIGN_KEY_VIOLATION:
          return { status: HttpStatus.BAD_REQUEST, code: 'INVALID_REFERENCE', message: 'Referenced resource is invalid' };
        case PG_CHECK_VIOLATION:
          return { status: HttpStatus.CONFLICT, code: 'CONSTRAINT_VIOLATION', message: 'Operation violates a data constraint' };
        case PG_INVALID_TEXT_REPRESENTATION:
          return { status: HttpStatus.BAD_REQUEST, code: 'INVALID_INPUT', message: 'Invalid input value' };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  private defaultCode(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'UNPROCESSABLE_ENTITY';
      case 429: return 'TOO_MANY_REQUESTS';
      default: return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
  }
}
