import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../access/decorators';
import { Permission } from '../access/permissions';
import { TenantContext } from '../access/tenant-context';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryQuery } from './dto/list-inventory.query';
import { InventoryService } from './inventory.service';

const productIdPipe = new ParseUUIDPipe({ exceptionFactory: () => new ResourceNotFoundException('Product') });

@ApiTags('Inventory')
@ApiBearerAuth('jwt')
@ApiParam({ name: 'storeId', format: 'uuid' })
@Controller('stores/:storeId/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermission(Permission.INVENTORY_READ)
  @ApiOperation({ summary: 'Stock levels for every catalogue product in this store' })
  list(@Tenant() tenant: TenantContext, @Query() query: ListInventoryQuery) {
    return this.inventory.list(tenant, query);
  }

  @Post('adjustments')
  @RequirePermission(Permission.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Add or remove stock (store manager / merchant admin)' })
  adjust(@Tenant() tenant: TenantContext, @Body() dto: AdjustInventoryDto) {
    return this.inventory.adjust(tenant, dto);
  }

  @Get(':productId')
  @RequirePermission(Permission.INVENTORY_READ)
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOperation({ summary: 'Stock of one product in this store' })
  get(@Tenant() tenant: TenantContext, @Param('productId', productIdPipe) productId: string) {
    return this.inventory.get(tenant, productId);
  }

  @Get(':productId/movements')
  @RequirePermission(Permission.INVENTORY_READ)
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOperation({ summary: 'Stock history of one product in this store' })
  movements(
    @Tenant() tenant: TenantContext,
    @Param('productId', productIdPipe) productId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.inventory.movements(tenant, productId, query);
  }
}
