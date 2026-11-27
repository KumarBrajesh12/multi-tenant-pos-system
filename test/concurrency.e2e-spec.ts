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

const STORE = IDS.stores.acmeDowntown;
const MUFFIN = IDS.products.acmeMuffin; // 5 in stock
const ESPRESSO = IDS.products.acmeEspresso;
const LATTE = IDS.products.acmeLatte;

describe('Concurrent sales (e2e)', () => {
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
  });

  it('two terminals selling 3 of 5 at the same time: only one succeeds', async () => {
    const [a, b] = await Promise.all([
      postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 3 }]),
      postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 3 }]),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(ctx, STORE, MUFFIN)).toBe(2);
    expect(await countRows(ctx, 'sales')).toBe(1);
  });

  it('many parallel single-unit sales sell exactly the available stock', async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 1 }])),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(5);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await stockOf(ctx, STORE, MUFFIN)).toBe(0);
  });

  it('sales racing with a manual stock removal never go below zero', async () => {
    const manager = await login(ctx, USERS.acmeManager);
    const adjust = request(ctx.app.getHttpServer())
      .post(`/stores/${STORE}/inventory/adjustments`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ productId: MUFFIN, quantityDelta: -4, reason: 'DAMAGE' });

    const [adjustRes, ...sales] = await Promise.all([
      adjust,
      postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 2 }]),
      postSale(ctx, cashier, STORE, [{ productId: MUFFIN, quantity: 2 }]),
    ]);

    const sold = sales.filter((r) => r.status === 201).length * 2;
    const removed = adjustRes.status === 201 ? 4 : 0;
    expect(sold + removed).toBeLessThanOrEqual(5);
    expect(await stockOf(ctx, STORE, MUFFIN)).toBe(5 - sold - removed);
  });

  it('multi-item sales with items in opposite order do not deadlock', async () => {
    const forward = [
      { productId: ESPRESSO, quantity: 1 },
      { productId: LATTE, quantity: 1 },
    ];
    const backward = [...forward].reverse();

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => postSale(ctx, cashier, STORE, i % 2 ? forward : backward)),
    );

    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(await stockOf(ctx, STORE, ESPRESSO)).toBe(110);
    expect(await stockOf(ctx, STORE, LATTE)).toBe(70);
  });
});
