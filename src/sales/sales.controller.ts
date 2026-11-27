import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { RequirePermission, Tenant } from '../access/decorators';
import { Permission } from '../access/permissions';
import { TenantContext } from '../access/tenant-context';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { IdempotencyKey } from '../idempotency/idempotency-key.decorator';
import { CheckoutService } from './checkout.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQuery } from './dto/list-sales.query';
import { SalesService } from './sales.service';

const saleIdPipe = new ParseUUIDPipe({ exceptionFactory: () => new ResourceNotFoundException('Sale') });

@ApiTags('Sales')
@ApiBearerAuth('jwt')
@ApiParam({ name: 'storeId', format: 'uuid' })
@Controller('stores/:storeId/sales')
export class SalesController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly sales: SalesService,
  ) {}

  @Post()
  @RequirePermission(Permission.SALE_CREATE)
  @ApiOperation({ summary: 'Create a sale and take the payment' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique per checkout attempt, reuse it on retries' })
  @ApiResponse({ status: 201, description: 'Paid, sale COMPLETED' })
  @ApiResponse({ status: 202, description: 'Payment outcome unknown yet, sale PENDING_PAYMENT' })
  @ApiResponse({ status: 402, description: 'Payment failed, sale PAYMENT_FAILED, stock released' })
  @ApiResponse({ status: 409, description: 'Insufficient stock / idempotency key conflict' })
  async create(
    @Tenant() tenant: TenantContext,
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateSaleDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.checkout.checkout(tenant, idempotencyKey, dto);
    res.status(result.statusCode);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.body;
  }

  @Get()
  @RequirePermission(Permission.SALE_READ)
  @ApiOperation({ summary: 'List sales of the store (newest first)' })
  list(@Tenant() tenant: TenantContext, @Query() query: ListSalesQuery) {
    return this.sales.list(tenant, query);
  }

  @Get(':saleId')
  @RequirePermission(Permission.SALE_READ)
  @ApiParam({ name: 'saleId', format: 'uuid' })
  get(@Tenant() tenant: TenantContext, @Param('saleId', saleIdPipe) saleId: string) {
    return this.sales.get(tenant, saleId);
  }

  @Get(':saleId/payment')
  @RequirePermission(Permission.SALE_READ)
  @ApiParam({ name: 'saleId', format: 'uuid' })
  getPayment(@Tenant() tenant: TenantContext, @Param('saleId', saleIdPipe) saleId: string) {
    return this.sales.getPayment(tenant, saleId);
  }
}
