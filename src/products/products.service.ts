import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDb } from '../database/tenant-db';
import { TenantContext } from '../access/tenant-context';
import { paginate } from '../common/dto/pagination.dto';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { isUniqueViolation } from '../common/utils/db';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { ProductCache } from './product-cache';
import { ProductsRepository } from './products.repository';

export const toProductResponse = (p: Product) => ({
  id: p.id,
  merchantId: p.merchantId,
  sku: p.sku,
  name: p.name,
  description: p.description,
  priceCents: p.priceCents,
  isActive: p.isActive,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export type ProductResponse = ReturnType<typeof toProductResponse>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly products: ProductsRepository,
    private readonly cache: ProductCache,
  ) {}

  list(tenant: TenantContext, query: ListProductsQuery) {
    return this.cache.getOrLoadList(tenant.merchantId, query, () =>
      this.tenantDb.run(tenant.merchantId, async (em) => {
        const [rows, total] = await this.products.list(em, tenant.merchantId, query);
        return paginate(rows.map(toProductResponse), total, query);
      }),
    );
  }

  get(tenant: TenantContext, productId: string): Promise<ProductResponse> {
    // a 404 throws inside the loader, so missing products are never cached
    return this.cache.getOrLoadItem(tenant.merchantId, productId, () =>
      this.tenantDb.run(tenant.merchantId, async (em) =>
        toProductResponse(await this.getOrFail(em, tenant.merchantId, productId)),
      ),
    );
  }

  async create(tenant: TenantContext, dto: CreateProductDto): Promise<ProductResponse> {
    let product: Product;
    try {
      product = await this.tenantDb.run(tenant.merchantId, (em) =>
        this.products.create(em, tenant.merchantId, {
          sku: dto.sku,
          name: dto.name,
          description: dto.description ?? null,
          priceCents: dto.priceCents,
          isActive: dto.isActive ?? true,
        }),
      );
    } catch (err) {
      throw this.mapSkuConflict(err, dto.sku);
    }
    // only after the transaction committed
    await this.cache.invalidate(tenant.merchantId);
    return toProductResponse(product);
  }

  async update(tenant: TenantContext, productId: string, dto: UpdateProductDto): Promise<ProductResponse> {
    let saved: Product;
    try {
      saved = await this.tenantDb.run(tenant.merchantId, async (em) => {
        const product = await this.getOrFail(em, tenant.merchantId, productId);
        Object.assign(product, dto);
        return this.products.save(em, product);
      });
    } catch (err) {
      throw this.mapSkuConflict(err, dto.sku);
    }
    await this.cache.invalidate(tenant.merchantId);
    return toProductResponse(saved);
  }

  // soft delete: products are referenced by sales history, so we never remove rows
  async deactivate(tenant: TenantContext, productId: string): Promise<ProductResponse> {
    const { product, changed } = await this.tenantDb.run(tenant.merchantId, async (em) => {
      const p = await this.getOrFail(em, tenant.merchantId, productId);
      if (!p.isActive) return { product: p, changed: false };
      p.isActive = false;
      return { product: await this.products.save(em, p), changed: true };
    });
    if (changed) await this.cache.invalidate(tenant.merchantId);
    return toProductResponse(product);
  }

  private async getOrFail(em: EntityManager, merchantId: string, productId: string): Promise<Product> {
    const product = await this.products.findOne(em, merchantId, productId);
    if (!product) throw new ResourceNotFoundException('Product');
    return product;
  }

  private mapSkuConflict(err: unknown, sku?: string): unknown {
    if (isUniqueViolation(err, 'uq_products_merchant_sku')) {
      return new AppException(HttpStatus.CONFLICT, 'PRODUCT_SKU_EXISTS', `A product with SKU ${sku} already exists`);
    }
    return err;
  }
}
