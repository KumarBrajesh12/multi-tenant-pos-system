import request from 'supertest';
import { SaleReconciler } from '../src/sales/sale-reconciler';
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

const STORE = IDS.stores.acmeDowntown;
const ESPRESSO = IDS.products.acmeEspresso; // 300c, 120 in stock
const CROISSANT = IDS.products.acmeCroissant; // 325c, 24 in stock
const MUFFIN = IDS.products.acmeMuffin; // 295c, 5 in stock

describe('Sales (e2e)', () => {
  let ctx: TestContext;
  let cashier: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetData(ctx);
    cashier = await login(ctx, USERS.acmeCashier);
    jest.restoreAllMocks();
  });

  describe('successful sale', () => {
    it('creates the sale, items and payment, and decrements stock', async () => {
      const res = await postSale(ctx, cashier, STORE, [
        { productId: ESPRESSO, quantity: 2 },
        { productId: CROISSANT, quantity: 1 },
      ]).expect(201);

      const sale = res.body;
      expect(sale).toMatchObject({
        status: 'COMPLETED',
        storeId: STORE,
        merchantId: IDS.merchants.acme,
        currency: 'USD',
        totalCents: 2 * 300 + 325,
        itemCount: 3,
        payment: { status: 'SUCCEEDED', amountCents: 925, provider: 'mock' },
      });
      expect(sale.payment.providerReference).toEqual(expect.any(String));
      expect(sale.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productId: ESPRESSO, unitPriceCents: 300, quantity: 2, lineTotalCents: 600 }),
          expect.objectContaining({ productId: CROISSANT, unitPriceCents: 325, quantity: 1, lineTotalCents: 325 }),
        ]),
      );

      expect(await stockOf(ctx, STORE, ESPRESSO)).toBe(118);
      expect(await stockOf(ctx, STORE, CROISSANT)).toBe(23);
      expect(await countRows(ctx, 'sale_items', 'sale_id = $1', [sale.id])).toBe(2);
      expect(await countRows(ctx, 'payments', `sale_id = $1 AND status = 'SUCCEEDED'`, [sale.id])).toBe(1);
      // other stores keep their own stock
      expect(await stockOf(ctx, IDS.stores.acmeAirport, ESPRESSO)).toBe(40);
    });

    it('keeps the price of the sale when the product price changes later', async () => {
      const { body: sale } = await postSale(ctx, cashier, STORE, [{ productId: ESPRESSO, quantity: 1 }]).expect(201);

      const owner = await login(ctx, USERS.acmeOwner);
      await request(ctx.app.getHttpServer())
        .patch(`/merchants/${IDS.merchants.acme}/products/${ESPRESSO}`)
        .set('Authorization', `Bearer ${owner}`)
        .send({ priceCents: 999 })
        .expect(200);

      const { body } = await request(ctx.app.getHttpServer())
        .get(`/stores/${STORE}/sales/${sale.id}`)
        .set('Authorization', `Bearer ${cashier}`)
        .expect(200);
      expect(body.items[0].unitPriceCents).toBe(300);
      expect(body.totalCents).toBe(300);
    });
  });

  describe('failed payment', () => {
    it('marks the sale PAYMENT_FAILED and puts the stock back', async () => {
      const res = await postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 2 }], {
        token: 'tok_declined',
      }).expect(402);

      expect(res.body).toMatchObject({
        status: 'PAYMENT_FAILED',
        failureReason: 'card_declined',
        completedAt: null,
        payment: { status: 'FAILED', failureCode: 'card_declined' },
      });

      expect(await stockOf(ctx, STORE, MUFFIN)).toBe(5);
      expect(await countRows(ctx, 'sales', `status = 'COMPLETED'`)).toBe(0);
      // the reservation and its reversal are both in the stock history
      const movements = await ctx.db.query(
        `SELECT reason, quantity_delta FROM inventory_movements WHERE sale_id = $1 ORDER BY created_at`,
        [res.body.id],
      );
      expect(movements).toEqual([
        { reason: 'SALE', quantity_delta: -2 },
        { reason: 'SALE_REVERSAL', quantity_delta: 2 },
      ]);
    });

    it('leaves the sale pending on provider timeout and the reconciler settles it', async () => {
      const res = await postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 1 }], {
        token: 'tok_timeout',
        idempotencyKey: 'timeout-test-key',
      }).expect(202);

      expect(res.body).toMatchObject({ status: 'PENDING_PAYMENT', payment: { status: 'PENDING' } });
      expect(await stockOf(ctx, STORE, MUFFIN)).toBe(4); // still reserved

      await ctx.app.get(SaleReconciler).reconcile(0);

      const after = await postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 1 }], {
        token: 'tok_timeout',
        idempotencyKey: 'timeout-test-key',
      }).expect(402);
      expect(after.body).toMatchObject({ id: res.body.id, status: 'PAYMENT_FAILED', failureReason: 'payment_timeout' });
      expect(await stockOf(ctx, STORE, MUFFIN)).toBe(5);
    }, 15_000);
  });

  describe('insufficient inventory', () => {
    it('rejects the sale and persists nothing', async () => {
      const charge = jest.spyOn(ctx.paymentProvider, 'charge');

      const res = await postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 6 }]).expect(409);

      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { productId: MUFFIN, requested: 6 } });
      expect(await stockOf(ctx, STORE, MUFFIN)).toBe(5);
      expect(await countRows(ctx, 'sales')).toBe(0);
      expect(await countRows(ctx, 'payments')).toBe(0);
      expect(await countRows(ctx, 'idempotency_records')).toBe(0);
      expect(charge).not.toHaveBeenCalled();
    });

    it('rolls back earlier lines when a later line is short', async () => {
      await postSale(ctx, cashier, STORE, [
        { productId: ESPRESSO, quantity: 3 },
        { productId: MUFFIN, quantity: 50 },
      ]).expect(409);

      expect(await stockOf(ctx, STORE, ESPRESSO)).toBe(120);
      expect(await stockOf(ctx, STORE, MUFFIN)).toBe(5);
      expect(await countRows(ctx, 'inventory_movements', `reason = 'SALE'`)).toBe(0);
    });

    it('rejects a product that has no stock row in this store', async () => {
      // croissant exists at the airport with 0, muffin was never stocked there
      await postSale(ctx, await login(ctx, USERS.acmeAirportCashier), IDS.stores.acmeAirport, [
        { productId: MUFFIN, quantity: 1 },
      ]).expect(409);
    });
  });

  describe('validation', () => {
    it('does not accept prices or totals from the client', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`/stores/${STORE}/sales`)
        .set('Authorization', `Bearer ${cashier}`)
        .set('Idempotency-Key', 'validation-key-1')
        .send({ items: [{ productId: ESPRESSO, quantity: 1, unitPriceCents: 1 }], totalCents: 1, payment: { method: 'CARD' } })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('requires an Idempotency-Key header', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/stores/${STORE}/sales`)
        .set('Authorization', `Bearer ${cashier}`)
        .send({ items: [{ productId: ESPRESSO, quantity: 1 }], payment: { method: 'CARD' } })
        .expect(400);
    });

    it('rejects inactive products', async () => {
      const res = await postSale(ctx, cashier, STORE, [{ productId: IDS.products.acmeMug, quantity: 1 }]).expect(409);
      expect(res.body.code).toBe('PRODUCT_INACTIVE');
    });
  });
});
