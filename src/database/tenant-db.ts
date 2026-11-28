import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

export const TENANT_DB_ROLE = 'pos_tenant';

// Runs the callback in a transaction as pos_tenant with RLS limited to one merchant.
// Both settings are transaction-local, so pooled connections come back clean.
// Keep callbacks short (no payment provider calls in here).
@Injectable()
export class TenantDb {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  run<T>(merchantId: string, work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.db.transaction(async (em) => {
      await em.query(`SELECT set_config('app.current_merchant_id', $1, true)`, [merchantId]);
      await em.query(`SET LOCAL ROLE ${TENANT_DB_ROLE}`);
      return work(em);
    });
  }
}
