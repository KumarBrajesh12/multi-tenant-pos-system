import { MigrationInterface, QueryRunner } from 'typeorm';

// tables whose rows belong to exactly one merchant (merchant_id column)
const TENANT_TABLES = [
  'stores',
  'memberships',
  'invitations',
  'products',
  'inventory',
  'inventory_movements',
  'sales',
  'sale_items',
  'payments',
  'idempotency_records',
];

/**
 * Row-level security as a second line of defence behind the application's own
 * merchant_id filters.
 *
 * Tenant requests run inside a transaction that does
 *   SELECT set_config('app.current_merchant_id', <id>, true);
 *   SET LOCAL ROLE pos_tenant;
 * (see TenantDb). pos_tenant is a NOLOGIN role that is not the table owner, so the
 * policies below apply to it - even when the app itself connects as a superuser.
 * If the setting is missing the policies match nothing (fail closed).
 *
 * Migrations, the seed, login/membership resolution and the platform admin API run
 * as the owner and are not affected.
 */
export class RowLevelSecurity1764400000000 implements MigrationInterface {
  name = 'RowLevelSecurity1764400000000';

  public async up(q: QueryRunner): Promise<void> {
    // roles are per cluster, so the dev and test databases share it
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_tenant') THEN
          CREATE ROLE pos_tenant NOLOGIN;
        END IF;
      END $$;
    `);
    // lets a non-superuser app account switch to the role with SET ROLE
    await q.query(`GRANT pos_tenant TO CURRENT_USER`);

    await q.query(`
      CREATE OR REPLACE FUNCTION app_current_merchant_id() RETURNS uuid
        LANGUAGE sql STABLE
        AS $$ SELECT NULLIF(current_setting('app.current_merchant_id', true), '')::uuid $$;
    `);

    await q.query(`GRANT USAGE ON SCHEMA public TO pos_tenant`);
    await q.query(`GRANT EXECUTE ON FUNCTION app_current_merchant_id() TO pos_tenant`);
    await q.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${TENANT_TABLES.join(', ')} TO pos_tenant`);
    await q.query(`GRANT SELECT ON merchants TO pos_tenant`);
    // users are global; tenants may look them up (members list, invitations) but never read password hashes
    await q.query(
      `GRANT SELECT (id, email, full_name, is_active, is_platform_admin, created_at, updated_at) ON users TO pos_tenant`,
    );

    for (const table of TENANT_TABLES) {
      await q.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await q.query(`
        CREATE POLICY tenant_isolation ON ${table}
          USING (merchant_id = app_current_merchant_id())
          WITH CHECK (merchant_id = app_current_merchant_id())
      `);
    }

    // a tenant can only see its own merchant row (e.g. for the currency)
    await q.query(`ALTER TABLE merchants ENABLE ROW LEVEL SECURITY`);
    await q.query(`CREATE POLICY tenant_isolation ON merchants USING (id = app_current_merchant_id())`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const table of [...TENANT_TABLES, 'merchants']) {
      await q.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
      await q.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }
    await q.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM pos_tenant`);
    await q.query(`REVOKE ALL ON SCHEMA public FROM pos_tenant`);
    await q.query(`DROP FUNCTION IF EXISTS app_current_merchant_id()`);
    // the role may still have grants in another database of the same cluster
    await q.query(`
      DO $$
      BEGIN
        DROP ROLE IF EXISTS pos_tenant;
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'pos_tenant still used elsewhere, not dropped';
      END $$;
    `);
  }
}
