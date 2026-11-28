import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { AccessService } from './access.service';
import { PERMISSION_KEY } from './decorators';
import { hasPermission, Permission } from './permissions';
import { TenantContext } from './tenant-context';

type TenantRequest = Request & { user?: AuthUser; tenant?: TenantContext };

// Runs after JwtAuthGuard on routes with @RequirePermission().
// Not a member (or doesn't exist) -> 404, member without the permission -> 403.
// Platform admins get nothing extra here.
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const req = context.switchToHttp().getRequest<TenantRequest>();
    const user = req.user;
    if (!user) {
      // JwtAuthGuard should have stopped this already
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Authentication required');
    }

    const { storeId, merchantId } = req.params as { storeId?: string; merchantId?: string };
    let tenant: TenantContext | null;

    // /merchants/:merchantId/... wins over :storeId (store admin routes have both)
    if (merchantId !== undefined) {
      tenant = isUUID(merchantId) ? await this.access.resolveMerchantAccess(user.id, merchantId) : null;
      if (!tenant) throw new ResourceNotFoundException('Merchant');
    } else if (storeId !== undefined) {
      tenant = isUUID(storeId) ? await this.access.resolveStoreAccess(user.id, storeId) : null;
      if (!tenant) throw new ResourceNotFoundException('Store');
    } else {
      throw new Error(`@RequirePermission(${permission}) used on a route without :storeId or :merchantId`);
    }

    if (!hasPermission(tenant.role, permission)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'INSUFFICIENT_PERMISSION',
        `Your role (${tenant.role}) is not allowed to perform this action`,
      );
    }

    req.tenant = tenant;
    return true;
  }
}
