import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Permission } from './permissions';
import { TenantContext } from './tenant-context';

export const PERMISSION_KEY = 'requiredPermission';

// checked by TenantGuard against the :merchantId / :storeId of the route
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

export const Tenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext => ctx.switchToHttp().getRequest().tenant,
);
