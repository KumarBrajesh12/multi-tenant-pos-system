import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContext } from '../access/tenant-context';
import { AppException } from '../common/exceptions/app.exception';
import { IdempotencyScope, IdempotencyService, StoredResponse } from '../idempotency/idempotency.service';
import { hashRequest } from '../common/utils/hash';
import { MovementReason } from '../inventory/entities/inventory-movement.entity';
import { InventoryRepository } from '../inventory/inventory.repository';
import { PaymentsRepository } from '../payments/payments.repository';
import { ChargeOutcome, PaymentsService } from '../payments/payments.service';
import { ProductsRepository } from '../products/products.repository';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleStatus } from './entities/sale.entity';
import { toSaleView } from './sale.view';
import { SalesRepository } from './sales.repository';

export interface CheckoutResult extends StoredResponse {
  replayed: boolean;
}

interface ReservedSale {
  saleId: string;
  totalCents: number;
  currency: string;
}

/**
 * Sale creation in three steps, so no DB transaction is open while we wait on the
 * payment provider:
 *
 *  1. TX1  claim the idempotency key, price the items from the DB, take the stock
 *          (conditional UPDATE per product, in product id order), insert the sale as
 *          PENDING_PAYMENT with its items and a PENDING payment.
 *  2.      charge the provider (no locks held).
 *  3. TX2  success -> COMPLETED. failure -> PAYMENT_FAILED and the stock is put back.
 *          The final response is stored on the idempotency record for replays.
 *
 * If the provider doesn't answer, the sale stays PENDING_PAYMENT (stock still held)
 * and SaleReconciler finishes it later.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly sales: SalesRepository,
    private readonly products: ProductsRepository,
    private readonly inventory: InventoryRepository,
    private readonly payments: PaymentsService,
    private readonly paymentsRepo: PaymentsRepository,
    private readonly idempotency: IdempotencyService,
  ) {}

  async checkout(tenant: TenantContext, idempotencyKey: string, dto: CreateSaleDto): Promise<CheckoutResult> {
    const scope: IdempotencyScope = {
      merchantId: tenant.merchantId,
      storeId: tenant.storeId!,
      userId: tenant.userId,
      key: idempotencyKey,
      requestHash: hashRequest(dto),
    };

    const reserved = await this.db.transaction((em) => this.reserve(em, tenant, scope, dto));
    if (!reserved) {
      // key already used - replay, or 409 if it's a different body / still running
      const stored = await this.idempotency.resolveExisting(scope);
      return { ...stored, replayed: true };
    }

    const outcome = await this.payments.charge({
      reference: reserved.saleId,
      idempotencyKey: `${scope.storeId}:${idempotencyKey}`,
      amountCents: reserved.totalCents,
      currency: reserved.currency,
      method: dto.payment.method,
      token: dto.payment.token,
    });

    if (outcome.status === 'UNKNOWN') {
      this.logger.warn(`sale ${reserved.saleId} left pending: ${outcome.reason}`);
    }
    return { ...(await this.finalize(reserved.saleId, outcome)), replayed: false };
  }

  /**
   * Moves a PENDING_PAYMENT sale to its final state. Also used by the reconciler.
   * Safe to call twice: only the call that still finds the sale pending changes it.
   */
  async finalize(saleId: string, outcome: ChargeOutcome): Promise<StoredResponse> {
    if (outcome.status === 'UNKNOWN') {
      const sale = await this.sales.findWithDetails(this.db.manager, saleId);
      return { statusCode: HttpStatus.ACCEPTED, body: toSaleView(sale) };
    }

    return this.db.transaction(async (em) => {
      const sale = await this.sales.lockPending(em, saleId);
      if (sale) {
        await this.paymentsRepo.recordResult(em, saleId, outcome);
        if (outcome.status === 'SUCCEEDED') {
          await this.sales.markCompleted(em, saleId);
        } else {
          await this.sales.markPaymentFailed(em, saleId, outcome.failureCode);
          await this.releaseStock(em, sale.merchantId, sale.storeId, saleId);
        }
      }

      const finished = await this.sales.findWithDetails(em, saleId);
      const response: StoredResponse = {
        statusCode: finished.status === SaleStatus.COMPLETED ? HttpStatus.CREATED : HttpStatus.PAYMENT_REQUIRED,
        body: toSaleView(finished),
      };
      if (sale) {
        await this.idempotency.completeForSale(em, saleId, response);
      }
      return response;
    });
  }

  private async reserve(
    em: EntityManager,
    tenant: TenantContext,
    scope: IdempotencyScope,
    dto: CreateSaleDto,
  ): Promise<ReservedSale | null> {
    const recordId = await this.idempotency.claim(em, scope);
    if (!recordId) return null;

    const storeId = tenant.storeId!;
    const merchantId = tenant.merchantId;

    // prices, names and SKUs come from our catalogue, never from the client
    const products = await this.products.findMany(
      merchantId,
      dto.items.map((i) => i.productId),
      em,
    );
    const byId = new Map(products.map((p) => [p.id, p]));

    const missing = dto.items.filter((i) => !byId.has(i.productId)).map((i) => i.productId);
    if (missing.length) {
      throw new AppException(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'Some products were not found', {
        productIds: missing,
      });
    }
    const inactive = products.filter((p) => !p.isActive).map((p) => p.id);
    if (inactive.length) {
      throw new AppException(HttpStatus.CONFLICT, 'PRODUCT_INACTIVE', 'Some products are not available for sale', {
        productIds: inactive,
      });
    }

    // always lock inventory rows in the same order to avoid deadlocks between sales
    const lines = [...dto.items]
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((item) => {
        const product = byId.get(item.productId)!;
        return {
          product,
          quantity: item.quantity,
          lineTotalCents: product.priceCents * item.quantity,
        };
      });

    const totalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
    const [{ currency }] = await em.query(`SELECT currency FROM merchants WHERE id = $1`, [merchantId]);

    const sale = await this.sales.createSale(em, {
      merchantId,
      storeId,
      cashierUserId: tenant.userId,
      status: SaleStatus.PENDING_PAYMENT,
      currency,
      totalCents,
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      idempotencyKey: scope.key,
    });

    for (const line of lines) {
      // check and decrement in one statement - no read-then-write race
      const left = await this.inventory.applyDelta(em, merchantId, storeId, line.product.id, -line.quantity);
      if (left === null) {
        throw new AppException(HttpStatus.CONFLICT, 'INSUFFICIENT_STOCK', `Not enough stock for ${line.product.sku}`, {
          productId: line.product.id,
          sku: line.product.sku,
          requested: line.quantity,
        });
      }
      await this.inventory.addMovement(em, {
        merchantId,
        storeId,
        productId: line.product.id,
        quantityDelta: -line.quantity,
        quantityAfter: left,
        reason: MovementReason.SALE,
        saleId: sale.id,
        actorUserId: tenant.userId,
      });
    }

    await this.sales.createItems(
      em,
      lines.map((l) => ({
        merchantId,
        saleId: sale.id,
        productId: l.product.id,
        productSku: l.product.sku,
        productName: l.product.name,
        unitPriceCents: l.product.priceCents,
        quantity: l.quantity,
        lineTotalCents: l.lineTotalCents,
      })),
    );

    await this.paymentsRepo.createPending(em, {
      merchantId,
      saleId: sale.id,
      provider: this.payments.providerName,
      method: dto.payment.method,
      amountCents: totalCents,
      currency,
    });

    await this.idempotency.attachSale(em, recordId, sale.id);
    return { saleId: sale.id, totalCents, currency };
  }

  // compensation for a failed payment: give the reserved units back
  private async releaseStock(em: EntityManager, merchantId: string, storeId: string, saleId: string) {
    const items = await this.sales.findItems(em, saleId);
    for (const item of items) {
      const quantity = await this.inventory.applyDelta(em, merchantId, storeId, item.productId, item.quantity);
      await this.inventory.addMovement(em, {
        merchantId,
        storeId,
        productId: item.productId,
        quantityDelta: item.quantity,
        quantityAfter: quantity!,
        reason: MovementReason.SALE_REVERSAL,
        saleId,
      });
    }
  }
}
