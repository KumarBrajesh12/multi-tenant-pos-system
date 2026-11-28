import request from 'supertest';
import { closeTestApp, countRows, createTestApp, IDS, login, resetData, TestContext, USERS } from './helpers';

const ACME = IDS.merchants.acme;
const BLUEBIRD = IDS.merchants.bluebird;
const DOWNTOWN = IDS.stores.acmeDowntown;
const AIRPORT = IDS.stores.acmeAirport;
const PLATFORM_ADMIN = 'admin@platform.test';

describe('Tenant administration (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());
  const as = (token: string) => ({
    get: (path: string) => http().get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body?: object) => http().post(path).set('Authorization', `Bearer ${token}`).send(body),
    patch: (path: string, body?: object) => http().patch(path).set('Authorization', `Bearer ${token}`).send(body),
    delete: (path: string) => http().delete(path).set('Authorization', `Bearer ${token}`),
  });
  const accept = (body: object) => http().post('/invitations/accept').send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetData(ctx);
  });

  describe('onboarding a new merchant end to end', () => {
    it('platform admin creates merchant -> owner accepts -> opens store -> invites staff', async () => {
      const platform = as(await login(ctx, PLATFORM_ADMIN));

      // 1. platform admin onboards the merchant, owner gets an invitation
      const created = await platform
        .post('/platform/merchants', { name: 'Corner Bakery', slug: 'corner-bakery', ownerEmail: 'Owner@CornerBakery.test' })
        .expect(201);
      const merchantId = created.body.id;
      expect(created.body.ownerInvitation).toMatchObject({ email: 'owner@cornerbakery.test', role: 'MERCHANT_ADMIN' });

      // 2. owner accepts (new account) and is logged in straight away
      const ownerLogin = await accept({
        token: created.body.ownerInvitation.inviteToken,
        fullName: 'Olga Owner',
        password: 'S3cure-pass',
      }).expect(200);
      expect(ownerLogin.body.membership).toEqual({ merchantId, storeId: null, role: 'MERCHANT_ADMIN' });
      const owner = as(ownerLogin.body.accessToken);

      // 3. owner opens a store and invites a manager for it
      const store = await owner.post(`/merchants/${merchantId}/stores`, { code: 'cb-main', name: 'Main Street' }).expect(201);
      expect(store.body.code).toBe('CB-MAIN');

      const managerInvite = await owner
        .post(`/merchants/${merchantId}/invitations`, { email: 'manager@cornerbakery.test', role: 'STORE_MANAGER', storeId: store.body.id })
        .expect(201);
      const manager = as(
        (await accept({ token: managerInvite.body.inviteToken, fullName: 'Max Manager', password: 'S3cure-pass' }).expect(200))
          .body.accessToken,
      );

      // 4. manager can invite a cashier to their own store
      const cashierInvite = await manager
        .post(`/merchants/${merchantId}/invitations`, { email: 'cashier@cornerbakery.test', role: 'CASHIER', storeId: store.body.id })
        .expect(201);
      const cashier = as(
        (await accept({ token: cashierInvite.body.inviteToken, fullName: 'Cleo Cashier', password: 'S3cure-pass' }).expect(200))
          .body.accessToken,
      );

      await cashier.get(`/stores/${store.body.id}`).expect(200);
      const members = await owner.get(`/merchants/${merchantId}/members`).expect(200);
      expect(members.body.map((m: { role: string }) => m.role).sort()).toEqual(['CASHIER', 'MERCHANT_ADMIN', 'STORE_MANAGER']);

      // the new merchant is invisible to existing tenants and vice versa
      await as(await login(ctx, USERS.acmeOwner)).get(`/merchants/${merchantId}/stores`).expect(404);
      await owner.get(`/merchants/${ACME}/stores`).expect(404);
    });
  });

  describe('platform admin', () => {
    it('only platform admins can manage merchants', async () => {
      const owner = as(await login(ctx, USERS.acmeOwner));
      const res = await owner
        .post('/platform/merchants', { name: 'X', slug: 'x-shop', ownerEmail: 'x@x.test' })
        .expect(403);
      expect(res.body.code).toBe('PLATFORM_ADMIN_ONLY');
      await owner.get('/platform/merchants').expect(403);
    });

    it('rejects a duplicate slug', async () => {
      const platform = as(await login(ctx, PLATFORM_ADMIN));
      const res = await platform
        .post('/platform/merchants', { name: 'Acme 2', slug: 'acme-coffee', ownerEmail: 'a@b.test' })
        .expect(409);
      expect(res.body.code).toBe('MERCHANT_SLUG_EXISTS');
    });

    it('has no access to merchant data', async () => {
      const platform = as(await login(ctx, PLATFORM_ADMIN));
      await platform.get(`/merchants/${ACME}/products`).expect(404);
      await platform.get(`/stores/${DOWNTOWN}/sales`).expect(404);
    });

    it('suspending a merchant cuts off its users immediately', async () => {
      const cashier = as(await login(ctx, USERS.acmeCashier));
      await cashier.get(`/stores/${DOWNTOWN}`).expect(200);

      const platform = as(await login(ctx, PLATFORM_ADMIN));
      await platform.patch(`/platform/merchants/${ACME}`, { isActive: false }).expect(200);

      await cashier.get(`/stores/${DOWNTOWN}`).expect(404);
      expect((await cashier.get('/merchants').expect(200)).body).toEqual([]);

      await platform.patch(`/platform/merchants/${ACME}`, { isActive: true }).expect(200);
      await cashier.get(`/stores/${DOWNTOWN}`).expect(200);
    });
  });

  describe('invitations', () => {
    let owner: ReturnType<typeof as>;

    beforeEach(async () => {
      owner = as(await login(ctx, USERS.acmeOwner));
    });

    it('a token can be used only once', async () => {
      const invite = await owner
        .post(`/merchants/${ACME}/invitations`, { email: 'once@acme.test', role: 'CASHIER', storeId: AIRPORT })
        .expect(201);
      const body = { token: invite.body.inviteToken, fullName: 'Once', password: 'S3cure-pass' };

      await accept(body).expect(200);
      const second = await accept(body).expect(400);
      expect(second.body.code).toBe('INVITATION_INVALID');
    });

    it('expired and revoked invitations are rejected', async () => {
      const a = await owner
        .post(`/merchants/${ACME}/invitations`, { email: 'late@acme.test', role: 'CASHIER', storeId: AIRPORT })
        .expect(201);
      await ctx.db.query(`UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, [a.body.id]);
      await accept({ token: a.body.inviteToken, fullName: 'Late', password: 'S3cure-pass' }).expect(400);

      const b = await owner
        .post(`/merchants/${ACME}/invitations`, { email: 'nope@acme.test', role: 'CASHIER', storeId: AIRPORT })
        .expect(201);
      await owner.delete(`/merchants/${ACME}/invitations/${b.body.id}`).expect(204);
      await accept({ token: b.body.inviteToken, fullName: 'Nope', password: 'S3cure-pass' }).expect(400);
    });

    it('inviting again replaces the previous token', async () => {
      const body = { email: 'twice@acme.test', role: 'CASHIER', storeId: AIRPORT };
      const first = await owner.post(`/merchants/${ACME}/invitations`, body).expect(201);
      const second = await owner.post(`/merchants/${ACME}/invitations`, body).expect(201);

      await accept({ token: first.body.inviteToken, fullName: 'T', password: 'S3cure-pass' }).expect(400);
      await accept({ token: second.body.inviteToken, fullName: 'T', password: 'S3cure-pass' }).expect(200);
    });

    it('an existing account must prove its password to accept', async () => {
      // Bluebird's cashier gets invited to Acme
      const invite = await owner
        .post(`/merchants/${ACME}/invitations`, { email: USERS.bluebirdCashier, role: 'CASHIER', storeId: AIRPORT })
        .expect(201);

      await accept({ token: invite.body.inviteToken, password: 'wrong-password' }).expect(401);
      const ok = await accept({ token: invite.body.inviteToken, password: 'Password123!' }).expect(200);

      const merchants = await as(ok.body.accessToken).get('/merchants').expect(200);
      expect(merchants.body.map((m: { id: string }) => m.id).sort()).toEqual([ACME, BLUEBIRD].sort());
    });

    it('rejects inviting someone who already has that access', async () => {
      const res = await owner
        .post(`/merchants/${ACME}/invitations`, { email: USERS.acmeCashier, role: 'CASHIER', storeId: DOWNTOWN })
        .expect(409);
      expect(res.body.code).toBe('ALREADY_MEMBER');
    });

    it('validates role and store scope', async () => {
      await owner.post(`/merchants/${ACME}/invitations`, { email: 'a@acme.test', role: 'CASHIER' }).expect(400);
      await owner
        .post(`/merchants/${ACME}/invitations`, { email: 'a@acme.test', role: 'MERCHANT_ADMIN', storeId: DOWNTOWN })
        .expect(400);
      // store of another merchant
      await owner
        .post(`/merchants/${ACME}/invitations`, { email: 'a@acme.test', role: 'CASHIER', storeId: IDS.stores.bluebirdCentral })
        .expect(404);
    });

    it('store managers can only invite cashiers into their own store', async () => {
      const manager = as(await login(ctx, USERS.acmeManager));
      await manager
        .post(`/merchants/${ACME}/invitations`, { email: 'm1@acme.test', role: 'CASHIER', storeId: AIRPORT })
        .expect(403);
      await manager
        .post(`/merchants/${ACME}/invitations`, { email: 'm2@acme.test', role: 'STORE_MANAGER', storeId: DOWNTOWN })
        .expect(403);
      await manager.post(`/merchants/${ACME}/invitations`, { email: 'm3@acme.test', role: 'MERCHANT_ADMIN' }).expect(403);
      await manager.get(`/merchants/${ACME}/invitations`).expect(403);
    });

    it('cashiers cannot invite anyone', async () => {
      const cashier = as(await login(ctx, USERS.acmeCashier));
      await cashier
        .post(`/merchants/${ACME}/invitations`, { email: 'c@acme.test', role: 'CASHIER', storeId: DOWNTOWN })
        .expect(403);
    });

    it('cannot invite into another merchant', async () => {
      await owner
        .post(`/merchants/${BLUEBIRD}/invitations`, { email: 'spy@acme.test', role: 'MERCHANT_ADMIN' })
        .expect(404);
      expect(await countRows(ctx, 'invitations')).toBe(0);
    });
  });

  describe('members', () => {
    let owner: ReturnType<typeof as>;
    const membershipOf = async (email: string, merchantId: string = ACME) => {
      const [row] = await ctx.db.query(
        `SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email = $1 AND m.merchant_id = $2`,
        [email, merchantId],
      );
      return row.id as string;
    };

    beforeEach(async () => {
      owner = as(await login(ctx, USERS.acmeOwner));
    });

    it('promoting a cashier gives the new permissions on the next request', async () => {
      const cashierToken = await login(ctx, USERS.acmeCashier);
      const adjust = () =>
        as(cashierToken).post(`/stores/${DOWNTOWN}/inventory/adjustments`, {
          productId: IDS.products.acmeEspresso,
          quantityDelta: 1,
          reason: 'RESTOCK',
        });
      await adjust().expect(403);

      const res = await owner
        .patch(`/merchants/${ACME}/members/${await membershipOf(USERS.acmeCashier)}`, { role: 'STORE_MANAGER', storeId: DOWNTOWN })
        .expect(200);
      expect(res.body).toMatchObject({ role: 'STORE_MANAGER', storeId: DOWNTOWN });

      await adjust().expect(201); // same token, new role
    });

    it('removing a member revokes access immediately', async () => {
      const cashier = as(await login(ctx, USERS.acmeCashier));
      await cashier.get(`/stores/${DOWNTOWN}`).expect(200);

      await owner.delete(`/merchants/${ACME}/members/${await membershipOf(USERS.acmeCashier)}`).expect(204);

      await cashier.get(`/stores/${DOWNTOWN}`).expect(404);
    });

    it('the last merchant admin cannot be removed or demoted', async () => {
      const id = await membershipOf(USERS.acmeOwner);
      expect((await owner.delete(`/merchants/${ACME}/members/${id}`).expect(409)).body.code).toBe('LAST_MERCHANT_ADMIN');
      await owner.patch(`/merchants/${ACME}/members/${id}`, { role: 'CASHIER', storeId: DOWNTOWN }).expect(409);
    });

    it('cannot see or change memberships of another merchant', async () => {
      const bluebirdCashier = await membershipOf(USERS.bluebirdCashier, BLUEBIRD);
      await owner.get(`/merchants/${BLUEBIRD}/members`).expect(404);
      await owner.delete(`/merchants/${ACME}/members/${bluebirdCashier}`).expect(404);
      await owner.patch(`/merchants/${ACME}/members/${bluebirdCashier}`, { role: 'MERCHANT_ADMIN' }).expect(404);
      expect(await countRows(ctx, 'memberships', 'id = $1', [bluebirdCashier])).toBe(1);
    });

    it('only admins can manage members', async () => {
      const manager = as(await login(ctx, USERS.acmeManager));
      await manager.get(`/merchants/${ACME}/members`).expect(403);
    });
  });

  describe('stores', () => {
    it('admin can close and reopen a store; closed stores are not accessible', async () => {
      const owner = as(await login(ctx, USERS.acmeOwner));
      const cashier = as(await login(ctx, USERS.acmeCashier));

      await owner.patch(`/merchants/${ACME}/stores/${DOWNTOWN}`, { isActive: false }).expect(200);
      await cashier.get(`/stores/${DOWNTOWN}`).expect(404);

      const list = await owner.get(`/merchants/${ACME}/stores`).expect(200);
      expect(list.body.find((s: { id: string }) => s.id === DOWNTOWN).isActive).toBe(false);

      await owner.patch(`/merchants/${ACME}/stores/${DOWNTOWN}`, { isActive: true }).expect(200);
      await cashier.get(`/stores/${DOWNTOWN}`).expect(200);
    });

    it('store codes are unique per merchant', async () => {
      const owner = as(await login(ctx, USERS.acmeOwner));
      const res = await owner.post(`/merchants/${ACME}/stores`, { code: 'acme-dt', name: 'Dup' }).expect(409);
      expect(res.body.code).toBe('STORE_CODE_EXISTS');
      // Bluebird may use the same code
      const bluebird = as(await login(ctx, USERS.bluebirdOwner));
      await bluebird.post(`/merchants/${BLUEBIRD}/stores`, { code: 'ACME-DT', name: 'Fine' }).expect(201);
    });

    it('cannot manage stores of another merchant or as non-admin', async () => {
      const owner = as(await login(ctx, USERS.acmeOwner));
      await owner.patch(`/merchants/${ACME}/stores/${IDS.stores.bluebirdCentral}`, { name: 'hacked' }).expect(404);
      await owner.patch(`/merchants/${BLUEBIRD}/stores/${IDS.stores.bluebirdCentral}`, { name: 'hacked' }).expect(404);

      const manager = as(await login(ctx, USERS.acmeManager));
      await manager.post(`/merchants/${ACME}/stores`, { code: 'NEW', name: 'New' }).expect(403);
    });
  });
});
