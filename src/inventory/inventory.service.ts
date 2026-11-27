import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from '../access/tenant-context';
import { paginate, PaginationQueryDto } from '../common/dto/pagination.dto';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { ProductsRepository } from '../products/products.repository';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryQuery } from './dto/list-inventory.query';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly inventory: InventoryRepository,
    private readonly products: ProductsRepository,
  ) {}

  async list(tenant: TenantContext, query: ListInventoryQuery) {
    const [rows, total] = await this.inventory.listForStore(tenant.merchantId, tenant.storeId!, query);
    return paginate(
      rows.map((r) => ({ storeId: tenant.storeId, ...r })),
      total,
      query,
    );
  }

  async get(tenant: TenantContext, productId: string) {
    const row = await this.inventory.findForStore(tenant.merchantId, tenant.storeId!, productId);
    if (!row) throw new ResourceNotFoundException('Product');
    return { storeId: tenant.storeId, ...row };
  }

  async adjust(tenant: TenantContext, dto: AdjustInventoryDto) {
    const storeId = tenant.storeId!;
    // product has to be in this merchant's catalogue (the composite FK would also reject it)
    const product = await this.products.findOne(tenant.merchantId, dto.productId);
    if (!product) throw new ResourceNotFoundException('Product');

    return this.db.transaction(async (em) => {
      const quantity = await this.inventory.applyDelta(
        em,
        tenant.merchantId,
        storeId,
        product.id,
        dto.quantityDelta,
      );
      if (quantity === null) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'INSUFFICIENT_STOCK',
          'Not enough stock to remove that quantity',
          { productId: product.id, requested: -dto.quantityDelta },
        );
      }

      const movement = await this.inventory.addMovement(em, {
        merchantId: tenant.merchantId,
        storeId,
        productId: product.id,
        quantityDelta: dto.quantityDelta,
        quantityAfter: quantity,
        reason: dto.reason,
        note: dto.note ?? null,
        actorUserId: tenant.userId,
      });

      return {
        storeId,
        productId: product.id,
        sku: product.sku,
        quantity,
        movement: {
          id: movement.id,
          quantityDelta: movement.quantityDelta,
          reason: movement.reason,
          note: movement.note,
          createdAt: movement.createdAt,
        },
      };
    });
  }

  async movements(tenant: TenantContext, productId: string, query: PaginationQueryDto) {
    const product = await this.products.findOne(tenant.merchantId, productId);
    if (!product) throw new ResourceNotFoundException('Product');

    const [rows, total] = await this.inventory.listMovements(tenant.merchantId, tenant.storeId!, productId, query);
    return paginate(
      rows.map((m) => ({
        id: m.id,
        quantityDelta: m.quantityDelta,
        quantityAfter: m.quantityAfter,
        reason: m.reason,
        note: m.note,
        saleId: m.saleId,
        actorUserId: m.actorUserId,
        createdAt: m.createdAt,
      })),
      total,
      query,
    );
  }
}
