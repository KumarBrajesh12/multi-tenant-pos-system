import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ListSalesQuery } from './dto/list-sales.query';
import { SaleItem } from './entities/sale-item.entity';
import { Sale, SaleStatus } from './entities/sale.entity';

@Injectable()
export class SalesRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  createSale(em: EntityManager, data: Partial<Sale>): Promise<Sale> {
    const repo = em.getRepository(Sale);
    return repo.save(repo.create(data));
  }

  async createItems(em: EntityManager, items: Array<Partial<SaleItem>>): Promise<void> {
    await em.getRepository(SaleItem).insert(items);
  }

  // row lock so the request and the reconciler can't finalize the same sale twice
  lockPending(em: EntityManager, saleId: string): Promise<Sale | null> {
    return em.getRepository(Sale).findOne({
      where: { id: saleId, status: SaleStatus.PENDING_PAYMENT },
      lock: { mode: 'pessimistic_write' },
    });
  }

  findItems(em: EntityManager, saleId: string): Promise<SaleItem[]> {
    return em.getRepository(SaleItem).find({ where: { saleId }, order: { productId: 'ASC' } });
  }

  async markCompleted(em: EntityManager, saleId: string): Promise<void> {
    await em.update(Sale, { id: saleId }, { status: SaleStatus.COMPLETED, completedAt: new Date() });
  }

  async markPaymentFailed(em: EntityManager, saleId: string, reason: string): Promise<void> {
    await em.update(Sale, { id: saleId }, { status: SaleStatus.PAYMENT_FAILED, failureReason: reason });
  }

  // tenant-facing read: always filtered by merchant and store
  findForStore(merchantId: string, storeId: string, saleId: string): Promise<Sale | null> {
    return this.db.getRepository(Sale).findOne({
      where: { id: saleId, merchantId, storeId },
      relations: { items: true, payment: true },
      order: { items: { productName: 'ASC' } },
    });
  }

  // internal use only (checkout / reconciler), the caller already owns the sale id
  findWithDetails(em: EntityManager, saleId: string): Promise<Sale> {
    return em.getRepository(Sale).findOneOrFail({
      where: { id: saleId },
      relations: { items: true, payment: true },
      order: { items: { productName: 'ASC' } },
    });
  }

  list(merchantId: string, storeId: string, q: ListSalesQuery): Promise<[Sale[], number]> {
    const qb = this.db
      .getRepository(Sale)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.payment', 'p')
      .where('s.merchantId = :merchantId AND s.storeId = :storeId', { merchantId, storeId });

    if (q.status) qb.andWhere('s.status = :status', { status: q.status });
    if (q.from) qb.andWhere('s.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('s.createdAt <= :to', { to: q.to });

    return qb
      .orderBy('s.createdAt', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .skip(q.offset)
      .take(q.limit)
      .getManyAndCount();
  }

  async findStalePending(olderThanSeconds: number, limit: number): Promise<string[]> {
    const rows: Array<{ id: string }> = await this.db.query(
      `SELECT id FROM sales
        WHERE status = 'PENDING_PAYMENT'
          AND updated_at < now() - make_interval(secs => $1)
        ORDER BY updated_at
        LIMIT $2`,
      [olderThanSeconds, limit],
    );
    return rows.map((r) => r.id);
  }
}
