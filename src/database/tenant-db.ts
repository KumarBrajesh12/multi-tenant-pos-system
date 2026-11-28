import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

export const TENANT_DB_ROLE = 'pos_tenant';

/**
 * Runs database work for one merchant with Postgres row-level security switched on.
 *
 * Inside the callback the connection acts as `pos_tenant` and only sees rows of
 * `merchantId`, so a query that forgets its `merchant_id` filter still can't read or
 * write another tenant's data. Both settings are transaction-local (`is_local = true`,
 * `SET LOCAL`), so nothing leaks to the next request using the pooled connection.
 *
 * Keep the callbacks short - this is a real transaction. In particular, never call the
 * payment provider inside one.
 */
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
