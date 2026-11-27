import { HttpException, HttpStatus } from '@nestjs/common';

// Business error with a stable `code` the POS client can switch on.
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

// Also used when the record exists but belongs to another tenant, so IDs can't be probed.
export class ResourceNotFoundException extends AppException {
  constructor(resource: string, details?: Record<string, unknown>) {
    super(HttpStatus.NOT_FOUND, `${resource.toUpperCase()}_NOT_FOUND`, `${resource} not found`, details);
  }
}
