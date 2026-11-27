import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [AccessService, TenantGuard],
  exports: [AccessService, TenantGuard],
})
export class AccessModule {}
