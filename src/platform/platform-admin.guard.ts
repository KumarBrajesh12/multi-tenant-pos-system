import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { AppException } from '../common/exceptions/app.exception';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user?.isPlatformAdmin) {
      throw new AppException(HttpStatus.FORBIDDEN, 'PLATFORM_ADMIN_ONLY', 'Only platform admins can do this');
    }
    return true;
  }
}
