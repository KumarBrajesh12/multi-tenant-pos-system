import request from 'supertest';
import {
  closeTestApp,
  countRows,
  createTestApp,
  IDS,
  login,
  postSale,
  resetData,
  stockOf,
  TestContext,
  USERS,
} from './helpers';

const ACME = IDS.merchants.acme;
const BLUEBIRD = IDS.merchants.bluebird;
const ACME_STORE = IDS.stores.acmeDowntown;
const BLUEBIRD_STORE = IDS.stores.bluebirdCentral;
const NOTEBOOK = IDS.products.bluebirdNotebook; // Bluebird product, 899c, 50 in stock

// Every scenario uses the Acme *owner* (strongest role in Acme) against Bluebird data.
describe('Tenant isolation (e2e)', () => {
  let ctx: TestContext;
  let acmeOwner: string;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetData(ctx);
    acmeOwner = await login(ctx, USERS.acmeOwner);
  });

  const expectNoLeak = (body: unknown) => {
    const text = JSON.stringify(body);
    expect(text).not.toContain('A5 Dotted Notebook');
    expect(text).not.toContain('NOTEBOOK-A5');
  };

  describe('products', () => {
    it('cannot read another merchant product through its own merchant', async () => {
      const res = await http()
        .get(`/merchants/${ACME}/products/${NOTEBOOK}`)
        .set('Authorization', `Bearer ${acmeOwner}`)
        .expect(404);
      expectNoLeak(res.body);
    });

    it('cannot read the other merchant catalogue by changing the merchant id', async () => {
      const res = await http()
        .get(`/merchants/${BLUEBIRD}/products`)
        .set('Authorization', `Bearer ${acmeOwner}`)
        .expect(404);
      expectNoLeak(res.body);
    });

    it('cannot update another merchant product', async () => {
      for (const merchantId of [ACME, BLUEBIRD]) {
        await http()
          .patch(`/merchants/${merchantId}/products/${NOTEBOOK}`)
          .set('Authorization', `Bearer ${acmeOwner}`)
          .send({ priceCents: 1, name: 'hacked' })
          .expect(404);
      }
      const [product] = await ctx.db.query(`SELECT name, price_cents FROM products WHERE id = $1`, [NOTEBOOK]);
      expect(product).toEqual({ name: 'A5 Dotted Notebook', price_cents: 899 });
    });

    it('returns the same 404 for a foreign id and an id that does not exist', async () => {
      const foreign = await http()
        .get(`/merchants/${ACME}/products/${NOTEBOOK}`)
        .set('Authorization', `Bearer ${acmeOwner}`);
      const missing = await http()
        .get(`/merchants/${ACME}/products/40000000-0000-4000-8000-0000000009ff`)
        .set('Authorization', `Bearer ${acmeOwner}`);

      expect(foreign.status).toBe(missing.status);
      expect(foreign.body.code).toBe(missing.body.code);
      expect(foreign.body.message).toBe(missing.body.message);
    });
  });

  describe('inventory', () => {
    it('cannot read the other merchant store inventory', async () => {
      const res = await http()
        .get(`/stores/${BLUEBIRD_STORE}/inventory/${NOTEBOOK}`)
        .set('Authorization', `Bearer ${acmeOwner}`)
        .expect(404);
      expectNoLeak(res.body);
    });

    it('cannot adjust the other merchant stock', async () => {
      await http()
        .post(`/stores/${BLUEBIRD_STORE}/inventory/adjustments`)
        .set('Authorization', `Bearer ${acmeOwner}`)
        .send({ productId: NOTEBOOK, quantityDelta: -50, reason: 'DAMAGE' })
        .expect(404);
      expect(await stockOf(ctx, BLUEBIRD_STORE, NOTEBOOK)).toBe(50);
    });

    it('cannot stock a foreign product in its own store', async () => {
      await http()
        .post(`/stores/${ACME_STORE}/inventory/adjustments`)
        .set('Authorization', `Bearer ${acmeOwner}`)
        .send({ productId: NOTEBOOK, quantityDelta: 10, reason: 'RESTOCK' })
        .expect(404);
      expect(await stockOf(ctx, ACME_STORE, NOTEBOOK)).toBeNull();
    });
  });

  describe('sales', () => {
    let bluebirdSaleId: string;

    beforeEach(async () => {
      const bluebirdCashier = await login(ctx, USERS.bluebirdCashier);
      const res = await postSale(ctx, bluebirdCashier, BLUEBIRD_STORE, [{ productId: NOTEBOOK, quantity: 1 }]).expect(
        201,
      );
      bluebirdSaleId = res.body.id;
    });

    it.each([
      ['through the other store', () => `/stores/${BLUEBIRD_STORE}/sales/${bluebirdSaleId}`],
      ['through its own store', () => `/stores/${ACME_STORE}/sales/${bluebirdSaleId}`],
      ['payment through its own store', () => `/stores/${ACME_STORE}/sales/${bluebirdSaleId}/payment`],
    ])('cannot read another merchant sale %s', async (_, path) => {
      const res = await http().get(path()).set('Authorization', `Bearer ${acmeOwner}`).expect(404);
      expectNoLeak(res.body);
      expect(JSON.stringify(res.body)).not.toContain('"totalCents"');
    });

    it('does not list other merchant sales', async () => {
      const res = await http()
        .get(`/stores/${ACME_STORE}/sales`)
        .set('Authorization', `Bearer ${acmeOwner}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('cannot sell another merchant product', async () => {
      const res = await postSale(ctx, acmeOwner, ACME_STORE, [{ productId: NOTEBOOK, quantity: 1 }]).expect(404);
      expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
      expect(await countRows(ctx, 'sales', 'store_id = $1', [ACME_STORE])).toBe(0);
      expect(await stockOf(ctx, BLUEBIRD_STORE, NOTEBOOK)).toBe(49); // only the bluebird sale above
    });
  });

  describe('stores inside the same merchant', () => {
    it('a cashier only sees the store they are assigned to', async () => {
      const airportCashier = await login(ctx, USERS.acmeAirportCashier);
      await http()
        .get(`/stores/${ACME_STORE}/sales`)
        .set('Authorization', `Bearer ${airportCashier}`)
        .expect(404);
    });

    it('a cashier is a member but cannot adjust stock (403, not 404)', async () => {
      const cashier = await login(ctx, USERS.acmeCashier);
      const res = await http()
        .post(`/stores/${ACME_STORE}/inventory/adjustments`)
        .set('Authorization', `Bearer ${cashier}`)
        .send({ productId: IDS.products.acmeEspresso, quantityDelta: 10, reason: 'RESTOCK' })
        .expect(403);
      expect(res.body.code).toBe('INSUFFICIENT_PERMISSION');
    });
  });

  it('rejects requests without a valid token', async () => {
    await http().get(`/stores/${ACME_STORE}/sales`).expect(401);
    await http().get(`/stores/${ACME_STORE}/sales`).set('Authorization', 'Bearer not-a-jwt').expect(401);
  });
});
