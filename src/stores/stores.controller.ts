import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../access/decorators';
import { Permission } from '../access/permissions';
import { TenantContext } from '../access/tenant-context';
import { StoresService } from './stores.service';

@ApiTags('Stores')
@ApiBearerAuth('jwt')
@Controller()
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get('merchants/:merchantId/stores')
  @RequirePermission(Permission.STORE_READ)
  @ApiParam({ name: 'merchantId', format: 'uuid' })
  @ApiOperation({ summary: 'Stores of the merchant the caller can access' })
  list(@Tenant() tenant: TenantContext) {
    return this.stores.list(tenant);
  }

  @Get('stores/:storeId')
  @RequirePermission(Permission.STORE_READ)
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiOperation({ summary: 'Store details (only if the caller is assigned to it)' })
  get(@Tenant() tenant: TenantContext) {
    return this.stores.get(tenant);
  }
}
