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
const LATTE = IDS.products.acmeLatte; // 80 in stock

describe('Idempotent sale creation (e2e)', () => {
  let ctx: TestContext;
  let cashier: string;
  let charge: jest.SpyInstance;

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
    charge = jest.spyOn(ctx.paymentProvider, 'charge');
  });

  const salesWithKey = (key: string) => countRows(ctx, 'sales', 'idempotency_key = $1', [key]);

  it('returns the original result for a retried request and does not charge twice', async () => {
    const key = 'pos-1-checkout-0001';
    const items = [{ productId: LATTE, quantity: 2 }];

    const first = await postSale(ctx, cashier, STORE, items, { idempotencyKey: key }).expect(201);
    const retry = await postSale(ctx, cashier, STORE, items, { idempotencyKey: key }).expect(201);

    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await salesWithKey(key)).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(await stockOf(ctx, STORE, LATTE)).toBe(78);
  });

  it('replays a failed payment instead of charging again', async () => {
    const key = 'pos-1-checkout-0002';
    const items = [{ productId: LATTE, quantity: 1 }];

    const first = await postSale(ctx, cashier, STORE, items, { idempotencyKey: key, token: 'tok_declined' }).expect(402);
    const retry = await postSale(ctx, cashier, STORE, items, { idempotencyKey: key, token: 'tok_declined' }).expect(402);

    expect(retry.body).toEqual(first.body);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(await stockOf(ctx, STORE, LATTE)).toBe(80);
  });

  it('rejects the same key with a different payload', async () => {
    const key = 'pos-1-checkout-0003';
    await postSale(ctx, cashier, STORE, [{ productId: LATTE, quantity: 1 }], { idempotencyKey: key }).expect(201);

    const res = await postSale(ctx, cashier, STORE, [{ productId: LATTE, quantity: 5 }], {
      idempotencyKey: key,
    }).expect(409);

    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await salesWithKey(key)).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(await stockOf(ctx, STORE, LATTE)).toBe(79);
  });

  it('creates exactly one sale when the same request arrives several times at once', async () => {
    const key = 'pos-1-checkout-0004';
    const items = [{ productId: LATTE, quantity: 1 }];

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => postSale(ctx, cashier, STORE, items, { idempotencyKey: key })),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
    // the rest either got the replay (201) or "still in progress" (409), never a second sale
    for (const r of responses) {
      expect([201, 409]).toContain(r.status);
      if (r.status === 409) expect(r.body.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
    }
    expect(await salesWithKey(key)).toBe(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(await stockOf(ctx, STORE, LATTE)).toBe(79);
  });

  it('scopes keys per store', async () => {
    const key = 'pos-shared-key-0005';
    await postSale(ctx, cashier, STORE, [{ productId: LATTE, quantity: 1 }], { idempotencyKey: key }).expect(201);

    const airportCashier = await login(ctx, USERS.acmeAirportCashier);
    await postSale(ctx, airportCashier, IDS.stores.acmeAirport, [{ productId: LATTE, quantity: 1 }], {
      idempotencyKey: key,
    }).expect(201);

    expect(await salesWithKey(key)).toBe(2);
  });

  it('does not burn the key when the sale is rejected before payment', async () => {
    const key = 'pos-1-checkout-0006';
    await postSale(ctx, cashier, STORE, [{ productId: LATTE, quantity: 500 }], { idempotencyKey: key }).expect(409);
    expect(await countRows(ctx, 'idempotency_records', 'idempotency_key = $1', [key])).toBe(0);

    // after a restock the same checkout can go through with the same key
    const manager = await login(ctx, USERS.acmeManager);
    await request(ctx.app.getHttpServer())
      .post(`/stores/${STORE}/inventory/adjustments`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ productId: LATTE, quantityDelta: 500, reason: 'RESTOCK' })
      .expect(201);

    await postSale(ctx, cashier, STORE, [{ productId: LATTE, quantity: 500 }], { idempotencyKey: key }).expect(201);
    expect(charge).toHaveBeenCalledTimes(1);
  });
});
