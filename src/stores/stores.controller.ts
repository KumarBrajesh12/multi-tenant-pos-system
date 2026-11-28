import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../access/decorators';
import { Permission } from '../access/permissions';
import { TenantContext } from '../access/tenant-context';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { StoresService } from './stores.service';

const storeIdPipe = new ParseUUIDPipe({ exceptionFactory: () => new ResourceNotFoundException('Store') });

@ApiTags('Stores')
@ApiBearerAuth('jwt')
@Controller()
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get('merchants/:merchantId/stores')
  @RequirePermission(Permission.STORE_READ)
  @ApiParam({ name: 'merchantId', format: 'uuid' })
  @ApiOperation({ summary: 'Stores of the merchant the caller can access (admins also see closed ones)' })
  list(@Tenant() tenant: TenantContext) {
    return this.stores.list(tenant);
  }

  @Post('merchants/:merchantId/stores')
  @RequirePermission(Permission.STORE_MANAGE)
  @ApiParam({ name: 'merchantId', format: 'uuid' })
  @ApiOperation({ summary: 'Open a new store (merchant admin)' })
  create(@Tenant() tenant: TenantContext, @Body() dto: CreateStoreDto) {
    return this.stores.create(tenant, dto);
  }

  @Patch('merchants/:merchantId/stores/:storeId')
  @RequirePermission(Permission.STORE_MANAGE)
  @ApiParam({ name: 'merchantId', format: 'uuid' })
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiOperation({ summary: 'Rename, close or reopen a store (merchant admin)' })
  update(
    @Tenant() tenant: TenantContext,
    @Param('storeId', storeIdPipe) storeId: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(tenant, storeId, dto);
  }

  @Get('stores/:storeId')
  @RequirePermission(Permission.STORE_READ)
  @ApiParam({ name: 'storeId', format: 'uuid' })
  @ApiOperation({ summary: 'Store details (only if the caller is assigned to it)' })
  get(@Tenant() tenant: TenantContext) {
    return this.stores.get(tenant);
  }
}
