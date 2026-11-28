import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { escapeLike } from '../common/utils/db';
import { ListInventoryQuery } from './dto/list-inventory.query';
import { InventoryMovement } from './entities/inventory-movement.entity';

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  quantity: number;
  updatedAt: Date | null;
}

const STOCK_COLUMNS = `
  p.id AS "productId", p.sku, p.name, p.price_cents AS "priceCents", p.is_active AS "isActive",
  COALESCE(i.quantity, 0)::int AS quantity, i.updated_at AS "updatedAt"`;

// Stock is read from the merchant's catalogue LEFT JOIN this store's inventory,
// so a product that was never stocked here shows up with quantity 0.
@Injectable()
export class InventoryRepository {
  async listForStore(
    em: EntityManager,
    merchantId: string,
    storeId: string,
    q: ListInventoryQuery,
  ): Promise<[StockRow[], number]> {
    const params: unknown[] = [merchantId, storeId];
    const filters: string[] = [];

    if (q.search) {
      params.push(`%${escapeLike(q.search)}%`);
      filters.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }
    if (q.maxQuantity !== undefined) {
      params.push(q.maxQuantity);
      filters.push(`COALESCE(i.quantity, 0) <= $${params.length}`);
    }

    const from = `
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id AND i.store_id = $2
      WHERE p.merchant_id = $1 ${filters.map((f) => `AND ${f}`).join(' ')}`;

    // same transaction/connection, so run one after the other
    const rows = await em.query(
      `SELECT ${STOCK_COLUMNS} ${from} ORDER BY p.name, p.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.limit, q.offset],
    );
    const [{ count }] = await em.query(`SELECT count(*)::int AS count ${from}`, params);
    return [rows, count];
  }

  async findForStore(
    em: EntityManager,
    merchantId: string,
    storeId: string,
    productId: string,
  ): Promise<StockRow | null> {
    const rows: StockRow[] = await em.query(
      `SELECT ${STOCK_COLUMNS}
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id AND i.store_id = $2
        WHERE p.merchant_id = $1 AND p.id = $3`,
      [merchantId, storeId, productId],
    );
    return rows[0] ?? null;
  }

  /**
   * Applies a delta in one statement so concurrent adjustments/sales can't race.
   * Adding stock upserts the row; removing stock only updates when enough is left.
   * Returns the new quantity, or null if there wasn't enough stock.
   */
  async applyDelta(
    em: EntityManager,
    merchantId: string,
    storeId: string,
    productId: string,
    delta: number,
  ): Promise<number | null> {
    if (delta > 0) {
      const rows: Array<{ quantity: number }> = await em.query(
        `INSERT INTO inventory (merchant_id, store_id, product_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (store_id, product_id)
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
         RETURNING quantity`,
        [merchantId, storeId, productId, delta],
      );
      return rows[0].quantity;
    }

    // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING
    const [rows] = await em.query(
      `UPDATE inventory
          SET quantity = quantity + $4
        WHERE merchant_id = $1 AND store_id = $2 AND product_id = $3
          AND quantity + $4 >= 0
       RETURNING quantity`,
      [merchantId, storeId, productId, delta],
    );
    return rows[0]?.quantity ?? null;
  }

  addMovement(em: EntityManager, movement: Partial<InventoryMovement>): Promise<InventoryMovement> {
    const repo = em.getRepository(InventoryMovement);
    return repo.save(repo.create(movement));
  }

  listMovements(
    em: EntityManager,
    merchantId: string,
    storeId: string,
    productId: string,
    q: PaginationQueryDto,
  ): Promise<[InventoryMovement[], number]> {
    return em.getRepository(InventoryMovement).findAndCount({
      where: { merchantId, storeId, productId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: q.offset,
      take: q.limit,
    });
  }
}
