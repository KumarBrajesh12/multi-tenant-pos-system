import request from 'supertest';
import { closeTestApp, createTestApp, TestContext } from './helpers';

describe('App basics (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('GET / returns API info without a token', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/').expect(200);
    expect(res.body).toMatchObject({ name: 'Multi-Tenant POS API', docs: '/docs', health: '/health' });
  });

  it.each(['/', '/health', '/does-not-exist'])('adds a request id to %s', async (path) => {
    const res = await request(ctx.app.getHttpServer()).get(path);
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('unknown routes use the standard error shape with the request id', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', path: '/does-not-exist' });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});
