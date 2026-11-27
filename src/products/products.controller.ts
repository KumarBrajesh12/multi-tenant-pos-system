import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../access/decorators';
import { Permission } from '../access/permissions';
import { TenantContext } from '../access/tenant-context';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

// invalid ids get the same 404 as unknown ones
const productIdPipe = new ParseUUIDPipe({ exceptionFactory: () => new ResourceNotFoundException('Product') });

@ApiTags('Products')
@ApiBearerAuth('jwt')
@ApiParam({ name: 'merchantId', format: 'uuid' })
@Controller('merchants/:merchantId/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @RequirePermission(Permission.PRODUCT_WRITE)
  @ApiOperation({ summary: 'Create a product in the merchant catalogue (merchant admin)' })
  create(@Tenant() tenant: TenantContext, @Body() dto: CreateProductDto) {
    return this.products.create(tenant, dto);
  }

  @Get()
  @RequirePermission(Permission.PRODUCT_READ)
  @ApiOperation({ summary: 'List products (paginated, searchable)' })
  list(@Tenant() tenant: TenantContext, @Query() query: ListProductsQuery) {
    return this.products.list(tenant, query);
  }

  @Get(':productId')
  @RequirePermission(Permission.PRODUCT_READ)
  @ApiParam({ name: 'productId', format: 'uuid' })
  get(@Tenant() tenant: TenantContext, @Param('productId', productIdPipe) productId: string) {
    return this.products.get(tenant, productId);
  }

  @Patch(':productId')
  @RequirePermission(Permission.PRODUCT_WRITE)
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOperation({ summary: 'Update product fields, including price and active flag (merchant admin)' })
  update(
    @Tenant() tenant: TenantContext,
    @Param('productId', productIdPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(tenant, productId, dto);
  }

  @Delete(':productId')
  @RequirePermission(Permission.PRODUCT_WRITE)
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOperation({ summary: 'Deactivate a product (soft delete, keeps sales history intact)' })
  deactivate(@Tenant() tenant: TenantContext, @Param('productId', productIdPipe) productId: string) {
    return this.products.deactivate(tenant, productId);
  }
}
