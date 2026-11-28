import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { Role } from './role.enum';

// Same rule as the DB check constraint, but with a readable 400 instead of a constraint error.
export function assertRoleScope(role: Role, storeId: string | null | undefined): void {
  if (role === Role.MERCHANT_ADMIN && storeId) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_ROLE_SCOPE', 'MERCHANT_ADMIN applies to the whole merchant, do not pass storeId');
  }
  if (role !== Role.MERCHANT_ADMIN && !storeId) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_ROLE_SCOPE', `${role} needs a storeId`);
  }
}
