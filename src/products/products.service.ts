import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantContext } from '../access/tenant-context';
import { paginate } from '../common/dto/pagination.dto';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { isUniqueViolation } from '../common/utils/db';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
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
  constructor(private readonly products: ProductsRepository) {}

  async list(tenant: TenantContext, query: ListProductsQuery) {
    const [rows, total] = await this.products.list(tenant.merchantId, query);
    return paginate(rows.map(toProductResponse), total, query);
  }

  async get(tenant: TenantContext, productId: string): Promise<ProductResponse> {
    return toProductResponse(await this.getOrFail(tenant.merchantId, productId));
  }

  async create(tenant: TenantContext, dto: CreateProductDto): Promise<ProductResponse> {
    try {
      const product = await this.products.create(tenant.merchantId, {
        sku: dto.sku,
        name: dto.name,
        description: dto.description ?? null,
        priceCents: dto.priceCents,
        isActive: dto.isActive ?? true,
      });
      return toProductResponse(product);
    } catch (err) {
      throw this.mapSkuConflict(err, dto.sku);
    }
  }

  async update(tenant: TenantContext, productId: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const product = await this.getOrFail(tenant.merchantId, productId);
    Object.assign(product, dto);
    try {
      return toProductResponse(await this.products.save(product));
    } catch (err) {
      throw this.mapSkuConflict(err, dto.sku);
    }
  }

  // soft delete: products are referenced by sales history, so we never remove rows
  async deactivate(tenant: TenantContext, productId: string): Promise<ProductResponse> {
    const product = await this.getOrFail(tenant.merchantId, productId);
    if (product.isActive) {
      product.isActive = false;
      await this.products.save(product);
    }
    return toProductResponse(product);
  }

  private async getOrFail(merchantId: string, productId: string): Promise<Product> {
    const product = await this.products.findOne(merchantId, productId);
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
