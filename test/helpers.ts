import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppConfig } from '../src/config/configuration';
import { IDS, SEED_PASSWORD } from '../src/database/seeds/seed-data';
import { seedDatabase } from '../src/database/seeds/seed';
import { PAYMENT_PROVIDER, PaymentProvider } from '../src/payments/providers/payment-provider';

export { IDS };

export const USERS = {
  acmeOwner: 'owner@acme.test',
  acmeManager: 'manager.downtown@acme.test',
  acmeCashier: 'cashier.downtown@acme.test',
  acmeAirportCashier: 'cashier.airport@acme.test',
  bluebirdOwner: 'owner@bluebird.test',
  bluebirdCashier: 'cashier.central@bluebird.test',
};

export interface TestContext {
  app: INestApplication;
  db: DataSource;
  paymentProvider: PaymentProvider;
  redis: Redis;
}

// Boots the real AppModule against the test database (migrations run on start).
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();

  const redisConfig = app.get<ConfigService<AppConfig, true>>(ConfigService).get('redis', { infer: true });
  return {
    app,
    db: app.get(DataSource),
    paymentProvider: app.get<PaymentProvider>(PAYMENT_PROVIDER),
    redis: new Redis({ ...redisConfig, lazyConnect: true }),
  };
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  ctx.redis.disconnect();
  await ctx.app.close();
}

// fresh seed data + empty cache before every test, so tests don't depend on each other
export async function resetData(ctx: TestContext): Promise<void> {
  await seedDatabase(ctx.db);
  await ctx.redis.flushdb();
}

export async function login(ctx: TestContext, email: string): Promise<string> {
  const res = await request(ctx.app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: SEED_PASSWORD })
    .expect(200);
  return res.body.accessToken;
}

export interface SaleLine {
  productId: string;
  quantity: number;
}

export function postSale(
  ctx: TestContext,
  token: string,
  storeId: string,
  items: SaleLine[],
  options: { token?: string; idempotencyKey?: string } = {},
) {
  return request(ctx.app.getHttpServer())
    .post(`/stores/${storeId}/sales`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', options.idempotencyKey ?? randomUUID())
    .send({ items, payment: { method: 'CARD', ...(options.token ? { token: options.token } : {}) } });
}

export async function stockOf(ctx: TestContext, storeId: string, productId: string): Promise<number | null> {
  const rows = await ctx.db.query(`SELECT quantity FROM inventory WHERE store_id = $1 AND product_id = $2`, [
    storeId,
    productId,
  ]);
  return rows[0]?.quantity ?? null;
}

export async function countRows(ctx: TestContext, table: string, where = 'true', params: unknown[] = []) {
  const [{ count }] = await ctx.db.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${where}`, params);
  return count as number;
}
