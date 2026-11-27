import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Permission } from './permissions';
import { TenantContext } from './tenant-context';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Marks a route as tenant-scoped. TenantGuard resolves the merchant/store from
 * the :storeId or :merchantId route param and checks the permission.
 */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

export const Tenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext => ctx.switchToHttp().getRequest().tenant,
);
