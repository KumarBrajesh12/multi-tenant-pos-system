import { TenantDb } from '../src/database/tenant-db';
import { closeTestApp, createTestApp, IDS, resetData, TestContext } from './helpers';

const ACME = IDS.merchants.acme;
const BLUEBIRD = IDS.merchants.bluebird;
const NOTEBOOK = IDS.products.bluebirdNotebook;

/**
 * These queries deliberately have NO merchant_id filter - the kind of bug the
 * application layer could have. Postgres RLS must still keep tenants apart.
 */
describe('Row-level security (e2e)', () => {
  let ctx: TestContext;
  let tenantDb: TenantDb;

  beforeAll(async () => {
    ctx = await createTestApp();
    tenantDb = ctx.app.get(TenantDb);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetData(ctx);
  });

  it('a query without a tenant filter only returns the current merchant rows', async () => {
    const counts = await tenantDb.run(ACME, async (em) => ({
      products: (await em.query(`SELECT merchant_id FROM products`)) as Array<{ merchant_id: string }>,
      stores: (await em.query(`SELECT count(*)::int AS n FROM stores`))[0].n,
      inventory: (await em.query(`SELECT count(*)::int AS n FROM inventory`))[0].n,
      merchants: (await em.query(`SELECT count(*)::int AS n FROM merchants`))[0].n,
      memberships: (await em.query(`SELECT DISTINCT merchant_id FROM memberships`)) as unknown[],
    }));

    expect(counts.products.length).toBe(6);
    expect(new Set(counts.products.map((p) => p.merchant_id))).toEqual(new Set([ACME]));
    expect(counts.stores).toBe(2);
    expect(counts.inventory).toBe(8);
    expect(counts.merchants).toBe(1);
    expect(counts.memberships).toEqual([{ merchant_id: ACME }]);

    // sanity check: the owner (no RLS) sees everything
    const [{ n }] = await ctx.db.query(`SELECT count(*)::int AS n FROM products`);
    expect(n).toBe(10);
  });

  it("another merchant's row is invisible even when selected by id", async () => {
    const rows = await tenantDb.run(ACME, (em) => em.query(`SELECT * FROM products WHERE id = $1`, [NOTEBOOK]));
    expect(rows).toEqual([]);
  });

  it("can't update or delete another merchant's rows", async () => {
    await tenantDb.run(ACME, async (em) => {
      await em.query(`UPDATE products SET price_cents = 1 WHERE id = $1`, [NOTEBOOK]);
      await em.query(`DELETE FROM inventory WHERE product_id = $1`, [NOTEBOOK]);
    });

    const [product] = await ctx.db.query(`SELECT price_cents FROM products WHERE id = $1`, [NOTEBOOK]);
    expect(product.price_cents).toBe(899);
    const [{ n }] = await ctx.db.query(`SELECT count(*)::int AS n FROM inventory WHERE product_id = $1`, [NOTEBOOK]);
    expect(n).toBe(1);
  });

  it("can't insert or move rows into another merchant", async () => {
    await expect(
      tenantDb.run(ACME, (em) =>
        em.query(`INSERT INTO products (merchant_id, sku, name, price_cents) VALUES ($1, 'X', 'x', 1)`, [BLUEBIRD]),
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      tenantDb.run(ACME, (em) =>
        em.query(`UPDATE products SET merchant_id = $1 WHERE id = $2`, [BLUEBIRD, IDS.products.acmeEspresso]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('sees nothing when no merchant is set (fails closed)', async () => {
    const n = await ctx.db.transaction(async (em) => {
      await em.query(`SET LOCAL ROLE pos_tenant`);
      return (await em.query(`SELECT count(*)::int AS n FROM products`))[0].n;
    });
    expect(n).toBe(0);
  });

  it('cannot read password hashes', async () => {
    await expect(tenantDb.run(ACME, (em) => em.query(`SELECT password_hash FROM users LIMIT 1`))).rejects.toThrow(
      /permission denied/,
    );
    // the non-secret columns are readable (member lists, invitations)
    const rows = await tenantDb.run(ACME, (em) => em.query(`SELECT email FROM users LIMIT 1`));
    expect(rows).toHaveLength(1);
  });

  it('does not leak the setting or role to later uses of pooled connections', async () => {
    // more parallel runs than the pool has connections (20), so every connection gets used
    await Promise.all(Array.from({ length: 30 }, () => tenantDb.run(ACME, (em) => em.query('SELECT pg_sleep(0.01)'))));

    const rows = await Promise.all(
      Array.from({ length: 30 }, () =>
        ctx.db.query(
          `SELECT current_user AS "user", NULLIF(current_setting('app.current_merchant_id', true), '') AS merchant`,
        ),
      ),
    );
    for (const [row] of rows) {
      expect(row.user).not.toBe('pos_tenant');
      expect(row.merchant).toBeNull();
    }
  });
});
