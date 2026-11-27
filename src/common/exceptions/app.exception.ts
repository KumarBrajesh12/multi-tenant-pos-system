import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Business error with a stable, machine-readable `code` that clients can
 * branch on (the human `message` may change). Rendered by AllExceptionsFilter.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

/**
 * 404 used for both "does not exist" and "exists but belongs to another
 * tenant/store", so callers cannot probe for other tenants' IDs.
 */
export class ResourceNotFoundException extends AppException {
  constructor(resource: string, details?: Record<string, unknown>) {
    super(HttpStatus.NOT_FOUND, `${resource.toUpperCase()}_NOT_FOUND`, `${resource} not found`, details);
  }
}
