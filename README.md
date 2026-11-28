# Multi-Tenant POS – Sales & Inventory API

Backend for a simplified point-of-sale platform used by several merchants, each with several stores.
Store staff log in, see only the stores they are assigned to, manage the merchant's product catalogue and
the store's stock, and ring up sales that are paid through a (mock) payment provider.

The focus is on the parts that are easy to get wrong in a real POS: tenant isolation, not overselling stock
when two terminals sell at the same time, safe retries, and what happens when a payment fails or times out.

- [1. Overview](#1-overview)
- [2. Setup](#2-setup)
- [3. Database and schema](#3-database-and-schema)
- [4. Tenant isolation](#4-tenant-isolation)
- [5. Transactions and concurrency](#5-transactions-and-concurrency)
- [6. Idempotency](#6-idempotency)
- [7. Redis cache](#7-redis-cache)
- [8. API](#8-api)
- [9. Assumptions and limitations](#9-assumptions-and-limitations)

---

## 1. Overview

**Features**

- JWT login, role based access (merchant admin / store manager / cashier)
- Tenant administration: platform admins onboard merchants, merchant admins open stores and invite staff
- One database shared by all merchants; every tenant row carries `merchant_id`, enforced by the app,
  composite foreign keys and Postgres row-level security
- Merchant-wide product catalogue, stock tracked per store
- Sales with several products, prices and totals calculated on the server
- Stock taken atomically, so concurrent sales can't oversell
- Mock payment provider behind an interface (success, decline, timeout)
- `Idempotency-Key` on sale creation, enforced by a unique index
- Background job that settles sales stuck waiting for the payment provider
- Redis cache for the product catalogue, invalidated on change
- Swagger UI, Postman collection, Docker setup

**Stack**: NestJS 11, TypeScript, PostgreSQL (TypeORM 0.3, raw SQL migrations), Redis (ioredis), Jest + Supertest.

```
src/
  access/        memberships, roles/permissions, TenantGuard
  auth/          login, JWT strategy, global auth guard
  cache/         Redis wrapper (fails open)
  common/        error filter, pagination, helpers
  config/        env loading + validation
  database/      data source, migrations, seed
  health/
  idempotency/   idempotency records + header decorator
  inventory/     store stock, adjustments, stock history
  members/       invitations, membership management
  merchants/  stores/
  payments/      provider interface, mock provider, payment records
  platform/      platform admin API (onboard / suspend merchants)
  products/      catalogue + product cache
  sales/         checkout flow, sale reads, reconciler
test/            e2e specs (real Postgres + Redis)
postman/         Postman collection
```

Each module follows controller → service → repository. Controllers only deal with HTTP,
services hold the business rules, repositories hold the SQL. Every repository method that
reads tenant data takes the `merchantId` as an argument, plus the `EntityManager` of a
`TenantDb.run()` transaction so row-level security applies.

---

## 2. Setup

### Prerequisites

- Node.js 20+ (developed on 22)
- PostgreSQL 13+ (uses `gen_random_uuid()`)
- Redis 6+ (optional: the app works without it, just without caching)
- Docker, if you want to run everything in containers

### Run locally

```bash
npm install
cp .env.example .env          # then set DB_USERNAME / DB_PASSWORD / JWT_SECRET
createdb pos_dev
npm run migration:run
npm run seed
npm run start:dev
```

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- Health: http://localhost:3000/health

`npm run db:setup` runs migrations and the seed in one go. The seed **wipes all data** before inserting,
and refuses to run with `NODE_ENV=production`.

### Environment

All variables are documented in [.env.example](.env.example) and validated at startup (the app won't
boot with a missing or invalid value). Files are loaded as `.env.<NODE_ENV>` first, then `.env`, so
development and test settings stay separate. Real `.env*` files are git-ignored; only the
`*.example` templates are committed.

| Variable | Purpose |
|---|---|
| `DB_*` | PostgreSQL connection. `DB_RUN_MIGRATIONS=true` runs pending migrations on boot |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing (secret must be ≥ 32 chars) |
| `INVITATION_TTL_HOURS` | How long an invitation token is valid (default 168) |
| `REDIS_*`, `CACHE_ENABLED`, `CACHE_TTL_SECONDS` | Product cache |
| `PAYMENT_TIMEOUT_MS` | How long we wait for the payment provider |
| `MOCK_PAYMENT_LATENCY_MS` | Artificial delay in the mock provider |
| `SALE_RECONCILE_*` | Background job for sales stuck in `PENDING_PAYMENT` |

### Docker

```bash
export JWT_SECRET=$(openssl rand -base64 48)
docker compose up --build -d          # api + postgres + redis, migrations run on start
docker compose exec api npm run seed:prod -- --force   # --force: the container runs with NODE_ENV=production
```

The API is on port 3000. The bundled Postgres and Redis are exposed on 5433 / 6380 so they don't clash
with local installs. To use your local Postgres instead of the container, see the comment at the top
of [docker-compose.yml](docker-compose.yml).

### Migrations and seed

| Command | |
|---|---|
| `npm run migration:run` | apply migrations |
| `npm run migration:revert` | roll back the last migration |
| `npm run migration:show` | list applied / pending |
| `npm run seed` | load demo data |

The schema lives in [src/database/migrations](src/database/migrations) as plain SQL, so it can be
reviewed without knowing TypeORM. `synchronize` is always off.

**Seed data** (password for every user: `Password123!`)

| User | Merchant | Store | Role |
|---|---|---|---|
| owner@acme.test | Acme Coffee Co. | all | MERCHANT_ADMIN |
| manager.downtown@acme.test | Acme Coffee Co. | Acme Downtown | STORE_MANAGER |
| cashier.downtown@acme.test | Acme Coffee Co. | Acme Downtown | CASHIER |
| cashier.airport@acme.test | Acme Coffee Co. | Acme Airport Kiosk | CASHIER |
| owner@bluebird.test | Bluebird Books | all | MERCHANT_ADMIN |
| cashier.central@bluebird.test | Bluebird Books | Bluebird Central | CASHIER |
| consultant@example.test | both | Bluebird: all / Acme: Airport | admin in one, cashier in the other |
| admin@platform.test | – | – | platform admin (onboards / suspends merchants, no access to their data) |

IDs are fixed (see [seed-data.ts](src/database/seeds/seed-data.ts)) so the Postman collection works
right after seeding. Both merchants have a product with SKU `ESPRESSO` on purpose: SKUs are unique per
merchant, not globally. The same product has different stock in each store.

### Tests

```bash
createdb pos_test
npm test              # unit + e2e
npm run test:unit
npm run test:e2e
```

The e2e tests boot the real app against the `pos_test` database (migrations run automatically) and
Redis DB 15, and re-seed before every test. They read `.env.test`; if that file doesn't exist they fall
back to [.env.test.example](.env.test.example). Adjust the DB credentials there if yours differ.

| Spec | Covers |
|---|---|
| `test/sales.e2e-spec.ts` | **Test 1** successful sale / failed payment (+ timeout and reconciliation), **Test 2** insufficient stock |
| `test/tenant-isolation.e2e-spec.ts` | **Test 3** cross-tenant access to products, inventory, sales, payments |
| `test/idempotency.e2e-spec.ts` | **Test 4** retries, single charge, different payload, parallel duplicates |
| `test/concurrency.e2e-spec.ts` | **Bonus** parallel sales vs. limited stock, no deadlocks |
| `test/app.e2e-spec.ts` | root endpoint, request id and error shape on every route |
| `test/tenant-admin.e2e-spec.ts` | merchant onboarding, invitations, role changes, last-admin rule, store admin |
| `test/row-level-security.e2e-spec.ts` | Postgres RLS: unfiltered queries still only see/change the current merchant |
| `src/**/*.spec.ts` | permissions, request hashing, payment timeout handling, mock provider |

The tests check outcomes in the database (stock levels, rows created, number of provider calls),
not just HTTP status codes.

---

## 3. Database and schema

```
merchants ──< stores ──< inventory >── products >── merchants
    │            │                         │
    │            ├──< sales ──< sale_items ┘
    │            │      ├── payments (1:1)
    │            │      └──< inventory_movements
    │            └──< idempotency_records
    └──< memberships >── users
```

| Table | Notes |
|---|---|
| `merchants` | The tenant. |
| `stores` | Belongs to one merchant. |
| `users` | Global identities (one person can work for several merchants). No `merchant_id`. `is_platform_admin` flag. |
| `memberships` | user + merchant + optional store + role. The only source of access rights. |
| `invitations` | Pending access grants: email, role, store, sha256 of a one-time token, expiry. |
| `products` | Merchant catalogue: SKU, name, price in cents, active flag. |
| `inventory` | One row per (store, product) with the current quantity. |
| `inventory_movements` | Every stock change with reason, delta, resulting quantity, user, sale. |
| `sales` | Status, total, currency, cashier, idempotency key. |
| `sale_items` | Snapshot of SKU, name and unit price at the time of sale. |
| `payments` | One per sale: provider, method, status, provider reference, failure info. |
| `idempotency_records` | Key, request hash, status, stored response. |

### Product ownership

Products belong to the **merchant** and are shared by all of its stores (one catalogue, one price).
Stock is per **store**: `inventory` has `UNIQUE (store_id, product_id)`, so Downtown and Airport always
have separate rows for the same product. A product that was never stocked in a store simply shows 0.

### Constraints that enforce the model

- **Composite foreign keys for tenant ownership.** Parent tables expose `UNIQUE (id, merchant_id)`, and
  children reference them with both columns, e.g. `inventory (store_id, merchant_id) → stores (id, merchant_id)`
  and `inventory (product_id, merchant_id) → products (id, merchant_id)`. The database itself refuses a
  row that links Merchant A's store with Merchant B's product. The same applies to sales, sale items,
  payments, stock movements, idempotency records and memberships.
- **Row-level security** on every tenant table (see [section 4](#second-layer-postgres-row-level-security)).
- `CHECK (quantity >= 0)` on inventory: stock can never go negative, whatever the application does.
- `CHECK (price_cents >= 0)`, `CHECK (quantity > 0)` on sale items, and
  `CHECK (line_total_cents = unit_price_cents * quantity)`.
- `UNIQUE (merchant_id, sku)` on products. SKUs are stored upper-case.
- Membership scope: `MERCHANT_ADMIN` must have `store_id IS NULL`, the other roles must have a store.
- `UNIQUE (store_id, idempotency_key)` on `idempotency_records`, and again on `sales`.
- `UNIQUE (sale_id)` on payments: one payment attempt per sale.
- Statuses are `varchar` + `CHECK` instead of Postgres enums, which are awkward to change later.
- Money is stored as integer cents (`integer` for prices, `bigint` for totals).

### Indexes

Besides the unique indexes above: `products (merchant_id, is_active, name)` for catalogue listing,
`sales (store_id, created_at DESC)` for the sales list, `inventory_movements (store_id, product_id, created_at DESC)`
for stock history, a partial index on `sales (updated_at) WHERE status = 'PENDING_PAYMENT'` for the
reconciler, and indexes on foreign key columns used in joins.

---

## 4. Tenant isolation

**Identity.** `POST /auth/login` returns a JWT signed with HS256. It only contains the user id and email.
On every request `JwtAuthGuard` verifies the signature and expiry and loads the user; an inactive or
deleted user is rejected even with a valid token.

**Tenant context.** The merchant/store comes from the URL (`/merchants/:merchantId/...` or
`/stores/:storeId/...`) and is checked by `TenantGuard` against the `memberships` table:

- `/stores/:storeId`: the store must exist and be active, its merchant must be active, and the user
  needs either a merchant-wide membership (admin) or a membership for that exact store.
- `/merchants/:merchantId`: the user needs any active membership in that merchant.

The guard then attaches a `TenantContext { userId, merchantId, storeId, role }` to the request, where
`merchantId` is the value **read from the database**, not from the request. Roles are not stored in the
token, so removing someone's membership takes effect on their next request.

**Scoped queries.** Services receive only that `TenantContext`, and every repository method takes the
`merchantId` (and `storeId` where relevant): `WHERE id = $1 AND merchant_id = $2 [AND store_id = $3]`.
There is no "find by id" for tenant data. Request bodies can't carry `merchantId`, `storeId`, `userId`,
prices or totals: the validation pipe rejects unknown fields.

**Not found vs forbidden.**

| Situation | Response |
|---|---|
| store/merchant/product/sale doesn't exist | 404 |
| exists but belongs to another tenant or store you're not assigned to | 404 (same body) |
| you're a member, but your role can't do this | 403 |
| missing / invalid / expired token | 401 |

Returning the same 404 for "doesn't exist" and "not yours" means IDs can't be used to probe other
tenants. Malformed UUIDs in the URL also return 404 instead of a validation error, for the same reason.

### Second layer: Postgres row-level security

The application filters every query by `merchant_id`, but a single forgotten `WHERE` would be a data
leak. So the database enforces the same rule on its own:

- Every tenant table (stores, memberships, invitations, products, inventory, inventory_movements,
  sales, sale_items, payments, idempotency_records) has RLS enabled with the policy
  `merchant_id = app_current_merchant_id()`, for reads (`USING`) and writes (`WITH CHECK`).
  `merchants` only shows the current merchant's own row.
- Tenant work goes through [`TenantDb.run(merchantId, em => ...)`](src/database/tenant-db.ts), which opens a
  transaction and runs
  ```sql
  SELECT set_config('app.current_merchant_id', '<merchant id>', true);  -- transaction-local
  SET LOCAL ROLE pos_tenant;
  ```
  `pos_tenant` is a `NOLOGIN` role created by the migration. It isn't the table owner, so the policies
  apply to it, **even if the app connects as a superuser** (superusers and table owners skip RLS, which
  is why we can't just rely on the login user). Both settings end with the transaction, so nothing leaks
  to the next request on the same pooled connection.
- No merchant set → the policies match nothing. It fails closed.
- `pos_tenant` can read users' names and emails (for member lists) but has no grant on `password_hash`.
- Everything that legitimately spans tenants runs as the owner without the role: migrations, the seed,
  login and membership resolution (`TenantGuard` needs to find the merchant first), the platform admin
  API, accepting an invitation (the token is the only key), and the reconciler's lookup of stuck sales.
  The reconciler then finishes each sale inside `TenantDb.run` for that sale's merchant.
- Repositories now receive the transaction's `EntityManager` instead of injecting their own, so tenant
  queries can't accidentally run outside `TenantDb`.

`test/row-level-security.e2e-spec.ts` runs queries **without** any `merchant_id` filter as `pos_tenant`
and checks that only the current merchant's rows come back, that updates and deletes on other tenants
affect nothing, that inserts or moves into another tenant are rejected, that no merchant means no rows,
and that the role and setting don't stick to pooled connections. The whole suite also runs with RLS on,
which shows the app works within these limits.

The cost is one short transaction per request with two extra statements, which is negligible next to
the queries themselves. The migration needs a database user that may create roles (`CREATEROLE`), which
the default Postgres and Docker users have.

**Roles**

| Permission | Cashier | Store manager | Merchant admin |
|---|:-:|:-:|:-:|
| read stores, products, inventory | ✔ | ✔ | ✔ |
| create / read sales | ✔ | ✔ | ✔ |
| adjust inventory | | ✔ | ✔ |
| invite users | | cashiers, own store only | any role |
| create / update / deactivate products | | | ✔ |
| open / close stores | | | ✔ |
| list members, change roles, remove access, revoke invitations | | | ✔ |

Admins cover every store of their merchant; managers and cashiers only their assigned store(s).

**Platform admins** (`users.is_platform_admin`) sit outside the tenants: they can onboard, rename and
suspend merchants (`/platform/merchants`), but get no access to any merchant's products, stock or sales.
Running the platform and reading a merchant's data are deliberately separate rights.

### Tenant administration

How a new merchant gets going, all through the API:

```
platform admin   POST /platform/merchants {name, slug, ownerEmail}   → merchant + owner invitation token
owner            POST /invitations/accept {token, fullName, password} → account created, logged in
owner            POST /merchants/:id/stores                           → opens a store
owner            POST /merchants/:id/invitations {email, role, storeId}
manager          POST /merchants/:id/invitations {role: CASHIER, storeId: own store}
admin            PATCH / DELETE /merchants/:id/members/:membershipId  → change role / remove access
```

- **Invitations** carry the role and store, so nobody picks their own access. The token is 32 random bytes,
  only its SHA-256 is stored, it is single use (row locked while accepting) and expires after
  `INVITATION_TTL_HOURS` (default 7 days). Inviting the same person to the same scope again revokes the
  old token. There is no mail service here, so the token is returned in the API response; in production
  it would only be sent by email.
- **Accepting with an existing account** (e.g. a cashier who also works for another merchant) requires that
  account's current password, so a leaked token can't attach someone else's account.
- **Changes apply on the next request.** Roles live in `memberships`, not in the JWT, so promoting,
  demoting or removing someone works immediately without new tokens. Suspending a merchant or closing a
  store also blocks access at once (the guard checks `is_active` on both).
- **A merchant always keeps an admin.** Removing or demoting the last `MERCHANT_ADMIN` returns
  409 `LAST_MERCHANT_ADMIN`. The admin rows are locked (`FOR UPDATE`) during the check, so two admins
  removing each other at the same moment can't both succeed.

---

## 5. Transactions and concurrency

The sale flow lives in [checkout.service.ts](src/sales/checkout.service.ts):

```
POST /stores/:storeId/sales  (Idempotency-Key: ...)
 │
 ├─ TX1 (short) ─────────────────────────────────────────────────────────
 │   claim idempotency key            INSERT ... ON CONFLICT DO NOTHING
 │   load products (this merchant)    → 404 unknown / 409 inactive
 │   price lines from the DB, compute total
 │   insert sale  PENDING_PAYMENT
 │   for each line, ordered by product id:
 │     UPDATE inventory SET quantity = quantity - n
 │      WHERE store_id = .. AND product_id = .. AND quantity >= n   → 0 rows = 409, rollback all
 │     insert stock movement (SALE)
 │   insert sale_items (snapshot), payment PENDING
 ├─ COMMIT
 │
 ├─ provider.charge(...)     ← no transaction or lock is held here
 │
 └─ TX2 ─────────────────────────────────────────────────────────────────
     lock the sale row (SELECT ... FOR UPDATE, still PENDING_PAYMENT?)
     SUCCEEDED → sale COMPLETED, payment SUCCEEDED              → 201
     FAILED    → sale PAYMENT_FAILED, payment FAILED,
                 stock put back + SALE_REVERSAL movements        → 402
     store final response on the idempotency record
     (no answer from provider → stay PENDING_PAYMENT            → 202)
```

**Why not read stock, then update it?** Two terminals could both read "5 in stock", both decide 3 is fine,
and both write. The check and the decrement have to be one atomic step. Here it's a single conditional
`UPDATE ... WHERE quantity >= n`: Postgres locks the row, and a second transaction waiting on that lock
re-checks the `WHERE` clause against the committed value after the first one finishes. If there isn't
enough left, it updates 0 rows and the sale is rejected. Default `READ COMMITTED` isolation is enough
for this, and `CHECK (quantity >= 0)` is the last safety net.

I chose the conditional update over `SELECT ... FOR UPDATE` + check + update because it is one round trip
per line and holds the lock for the shortest possible time. Manual stock adjustments use the same pattern.

**Deadlocks.** A sale with several products locks several inventory rows. Lines are always processed in
product-id order, so two sales touching the same products lock them in the same order and can't deadlock
each other. (Covered by a test that fires sales with items in opposite order at the same time.)

**All or nothing.** If any line is short, TX1 rolls back, including the stock already taken for earlier
lines, the sale row and the idempotency record. Nothing is left behind and the provider is never called.

**Payment outside the transaction.** A provider call can take seconds. Doing it inside TX1 would keep
inventory rows locked for that long and block every other sale of the same products. Instead, stock is
*reserved* in TX1 (the sale is `PENDING_PAYMENT`), the provider is called without any lock, and TX2
either confirms the sale or releases the stock (compensation). The cost is a short window where the stock
is held by a sale that might still fail, which is the normal trade-off for card payments.

**Payment failure / timeout.**

- Declined: sale `PAYMENT_FAILED`, payment `FAILED` with the provider's code, stock released, HTTP 402.
  A failed sale is final; the POS starts a new sale (new key) to try another card.
- No answer within `PAYMENT_TIMEOUT_MS`, or a network error: we don't know if the customer was charged, so
  we don't guess. The sale stays `PENDING_PAYMENT` with the stock held, and the API returns 202.
- `SaleReconciler` runs every 30 s and picks up sales pending for longer than `SALE_RECONCILE_AFTER_SECONDS`.
  It asks the provider about the charge (by sale id) and finalizes the sale the normal way. If the provider
  never saw the charge, the sale is failed and the stock released.
- The same path also covers the process crashing between the charge and TX2.
- TX2 locks the sale row and only acts if it is still pending, so the request and the reconciler (or two
  app instances) can't both finalize the same sale.

---

## 6. Idempotency

- The client sends an `Idempotency-Key` header (8–255 chars, e.g. a UUID generated per checkout) on
  `POST /stores/:storeId/sales`. It's required.
- Keys are scoped per store: `UNIQUE (store_id, idempotency_key)` on `idempotency_records`.
- Along with the key we store a SHA-256 hash of the request body (canonical JSON, so key order in the JSON
  doesn't matter), the status (`IN_PROGRESS` / `COMPLETED`), the sale id, and the final HTTP status + body.

**How a request is handled**

1. In TX1 the key is claimed with `INSERT ... ON CONFLICT (store_id, idempotency_key) DO NOTHING`.
2. If the insert succeeds, this request owns the key and continues.
3. If it conflicts, the key was used before:

| Existing record | Response |
|---|---|
| different request hash | **409** `IDEMPOTENCY_KEY_REUSED` |
| same hash, `COMPLETED` | the stored status + body, with header `Idempotent-Replayed: true` |
| same hash, still `IN_PROGRESS` | **409** `IDEMPOTENCY_REQUEST_IN_PROGRESS`, retry later |

**Simultaneous duplicates.** This relies on the database, not on an in-memory check. When two requests with
the same key arrive together, the second `INSERT` blocks on the unique index until the first transaction
commits or rolls back. If it commits, the second sees the conflict; if it rolls back, the second takes over.
There is no window in which both can create a sale. The sale row carries the key too, with its own unique
constraint, as a second guard.

**No double charge.** The provider is only called by the request that owns the key, and the key is passed
on to the provider (`storeId:key`), which is how real gateways deduplicate charges as well. Replays never
reach the provider. This is verified in the tests by counting provider calls.

**Failed outcomes.** A payment failure (402) is stored and replayed like a success, so retrying a declined
checkout doesn't charge the card again. Requests rejected *before* payment (unknown product, insufficient
stock) roll back TX1 together with the key, so the same key can be retried once the problem is fixed
(e.g. after a restock). Validation errors (400) never reach the key.

---

## 7. Redis cache

I implemented **option A, caching**, for the product catalogue (`GET /merchants/:merchantId/products` and
`GET /merchants/:merchantId/products/:id`), which every POS terminal reads constantly.

**Keys** always include the merchant id:

```
pos:merchant:{merchantId}:products:version              counter
pos:merchant:{merchantId}:products:v{n}:list:{hash}     one list page (hash of page/limit/filters/sort)
pos:merchant:{merchantId}:products:v{n}:item:{id}       one product
```

**Invalidation.** Creating, updating or deactivating a product increments that merchant's `version`
(after the DB write). New reads use the new version, so all of the merchant's cached pages and items are
bypassed at once without scanning or deleting keys. Old entries expire with their TTL
(`CACHE_TTL_SECONDS`, default 60 s). A nice side effect: a slow reader that loaded old data can only
write it under the old version, which nobody reads anymore.

**Tenant safety.** `TenantGuard` runs before the cache is consulted, so a user from another merchant gets a
404 before any cache lookup. Within a merchant the cached data doesn't depend on the caller (cashier and
admin see the same catalogue), so entries are shared.

**Redis unavailable.** The cache is an optimization, so it fails open: no offline queue, short connect and
command timeouts, errors are logged (throttled) and the request goes to the database. `/health` reports
`degraded` (HTTP 200) when Redis is down and `error` (503) only when the database is down.

**Trade-offs**

- Inventory is not cached. Stock changes with every sale and a stale number at the till is worse than an
  extra query; the stock queries are indexed lookups anyway.
- If invalidation fails because Redis is unreachable at that moment, readers may see the old product
  for up to one TTL. Prices used for *sales* are always read from the database inside the sale
  transaction, never from the cache, so a stale cache can't change what a customer pays.
- Cache misses for the same key at the same moment can both hit the database (no stampede lock). Fine for
  this load.

---

## 8. API

Interactive docs: **http://localhost:3000/docs** (Swagger). Click *Authorize* and paste the token from
`/auth/login`.

### Authentication

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"cashier.downtown@acme.test","password":"Password123!"}'
```

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "user": { "id": "30000000-0000-4000-8000-000000000003", "email": "cashier.downtown@acme.test", "fullName": "Carl Cashier" }
}
```

Send it as `Authorization: Bearer <token>` on every other request.

### Endpoints

| Method | Path | Permission |
|---|---|---|
| GET | `/` | public (API info and links) |
| POST | `/auth/login` | public |
| GET | `/auth/me` | any user |
| GET | `/health` | public |
| GET | `/merchants` | any user (their own merchants) |
| GET | `/merchants/:merchantId/stores` | store:read |
| POST | `/merchants/:merchantId/stores` | store:manage |
| PATCH | `/merchants/:merchantId/stores/:storeId` | store:manage (rename, close, reopen) |
| GET | `/stores/:storeId` | store:read |
| GET | `/merchants/:merchantId/members` | member:manage |
| PATCH | `/merchants/:merchantId/members/:membershipId` | member:manage |
| DELETE | `/merchants/:merchantId/members/:membershipId` | member:manage |
| POST | `/merchants/:merchantId/invitations` | member:invite |
| GET | `/merchants/:merchantId/invitations` | member:manage |
| DELETE | `/merchants/:merchantId/invitations/:invitationId` | member:manage |
| POST | `/invitations/accept` | public (token) |
| POST | `/platform/merchants` | platform admin |
| GET | `/platform/merchants` | platform admin |
| PATCH | `/platform/merchants/:id` | platform admin (rename, suspend) |
| GET | `/merchants/:merchantId/products` | product:read |
| GET | `/merchants/:merchantId/products/:productId` | product:read |
| POST | `/merchants/:merchantId/products` | product:write |
| PATCH | `/merchants/:merchantId/products/:productId` | product:write |
| DELETE | `/merchants/:merchantId/products/:productId` | product:write (deactivates) |
| GET | `/stores/:storeId/inventory` | inventory:read |
| GET | `/stores/:storeId/inventory/:productId` | inventory:read |
| GET | `/stores/:storeId/inventory/:productId/movements` | inventory:read |
| POST | `/stores/:storeId/inventory/adjustments` | inventory:adjust |
| POST | `/stores/:storeId/sales` | sale:create |
| GET | `/stores/:storeId/sales` | sale:read |
| GET | `/stores/:storeId/sales/:saleId` | sale:read |
| GET | `/stores/:storeId/sales/:saleId/payment` | sale:read |

I nested products under the merchant and sales/inventory under the store instead of using flat `/products`
or `/sales/:id`: a user can belong to several merchants, so the URL has to say which tenant/store the
request is for, and the guard can then check that against the memberships.

**Lists** accept `page` (default 1) and `limit` (default 20, max 100) and return
`{ data: [...], meta: { page, limit, total, totalPages } }`.
Products: `search` (name/SKU), `isActive`, `sort` (`name|sku|priceCents|createdAt`), `order`.
Inventory: `search`, `maxQuantity` (low-stock report). Sales: `status`, `from`, `to`.

### Create a sale

```bash
curl -s -X POST http://localhost:3000/stores/20000000-0000-4000-8000-000000000011/sales \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "items": [
      { "productId": "40000000-0000-4000-8000-000000000001", "quantity": 2 },
      { "productId": "40000000-0000-4000-8000-000000000002", "quantity": 1 }
    ],
    "payment": { "method": "CARD", "token": "tok_visa" }
  }'
```

`201 Created`

```json
{
  "id": "19063bd3-d5d4-4555-8731-b53255dccf0c",
  "merchantId": "10000000-0000-4000-8000-000000000001",
  "storeId": "20000000-0000-4000-8000-000000000011",
  "status": "COMPLETED",
  "currency": "USD",
  "totalCents": 1050,
  "itemCount": 3,
  "cashierUserId": "30000000-0000-4000-8000-000000000003",
  "failureReason": null,
  "paymentStatus": "SUCCEEDED",
  "createdAt": "2026-11-27T13:36:32.771Z",
  "completedAt": "2026-11-27T13:36:32.790Z",
  "items": [
    { "productId": "40000000-0000-4000-8000-000000000001", "sku": "ESPRESSO", "name": "Espresso", "unitPriceCents": 300, "quantity": 2, "lineTotalCents": 600 },
    { "productId": "40000000-0000-4000-8000-000000000002", "sku": "LATTE-M", "name": "Latte (medium)", "unitPriceCents": 450, "quantity": 1, "lineTotalCents": 450 }
  ],
  "payment": {
    "id": "842aeedb-0eb4-448c-a899-6d5d08fa5014",
    "status": "SUCCEEDED",
    "method": "CARD",
    "provider": "mock",
    "amountCents": 1050,
    "currency": "USD",
    "providerReference": "mock_ch_9fdf719c-aa57-4e3f-90d9-3df26b30858c",
    "failureCode": null,
    "failureMessage": null,
    "processedAt": "2026-11-27T13:36:32.790Z"
  }
}
```

The request has no prices: unit prices, line totals and the total all come from the database.

**Mock payment tokens**

| `payment.token` | Result |
|---|---|
| anything else / omitted | `SUCCEEDED` → 201 |
| `tok_declined` | `FAILED` (`card_declined`) → 402, stock released |
| `tok_insufficient_funds` | `FAILED` (`insufficient_funds`) → 402 |
| `tok_timeout` | no answer → 202 `PENDING_PAYMENT`, settled later by the reconciler |

**Sale responses**

| Status | Meaning |
|---|---|
| 201 | paid, `COMPLETED` |
| 202 | payment outcome unknown, `PENDING_PAYMENT` |
| 402 | payment failed, `PAYMENT_FAILED`, body is the sale with payment failure details |
| 400 | invalid body / missing `Idempotency-Key` |
| 404 | store not accessible, or a product isn't in this merchant's catalogue |
| 409 | `INSUFFICIENT_STOCK`, `PRODUCT_INACTIVE`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_REQUEST_IN_PROGRESS` |

### Adjust stock

```bash
curl -s -X POST http://localhost:3000/stores/20000000-0000-4000-8000-000000000011/inventory/adjustments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "productId": "40000000-0000-4000-8000-000000000004", "quantityDelta": 10, "reason": "RESTOCK", "note": "Weekly delivery" }'
```

```json
{
  "storeId": "20000000-0000-4000-8000-000000000011",
  "productId": "40000000-0000-4000-8000-000000000004",
  "sku": "MUFFIN-BB",
  "quantity": 15,
  "movement": { "id": "b61da4fc-...", "quantityDelta": 10, "reason": "RESTOCK", "note": "Weekly delivery", "createdAt": "..." }
}
```

Negative deltas remove stock; going below zero returns 409 `INSUFFICIENT_STOCK`. Reasons: `RESTOCK`,
`ADJUSTMENT`, `DAMAGE`, `RETURN` (`SALE` / `SALE_REVERSAL` are written only by the sales flow).

### Errors

Every error has the same shape. `code` is stable and meant for the client to branch on.

```json
{
  "statusCode": 409,
  "error": "CONFLICT",
  "code": "INSUFFICIENT_STOCK",
  "message": "Not enough stock for MUFFIN-BB",
  "details": { "productId": "40000000-0000-4000-8000-000000000004", "sku": "MUFFIN-BB", "requested": 6 },
  "path": "/stores/20000000-0000-4000-8000-000000000011/sales",
  "timestamp": "2026-11-27T13:36:33.057Z",
  "requestId": "7b4a18ef-0c1b-4f0a-9b51-0f6f1f1b2a11"
}
```

Database errors are mapped to 4xx where it makes sense (unique → 409, FK → 400, check → 409). Anything
unexpected is a generic 500. SQL, stack traces and internal messages are only logged, together with the
`requestId` (also returned in the `x-request-id` header) so a response can be matched to its log line.

### Postman

Import [postman/multi-tenant-pos.postman_collection.json](postman/multi-tenant-pos.postman_collection.json).

1. Run `npm run seed`, start the API.
2. Send one of the **Auth → Login** requests. The token is saved to the `token` collection variable and
   used by all other requests (collection-level Bearer auth).
3. Seeded IDs are already set as collection variables (`acmeDowntownStoreId`, `acmeEspressoId`, ...).
   Change `baseUrl` if the API isn't on `localhost:3000`.

Things worth trying:

- **Sales → Create sale** generates a new `Idempotency-Key` each time. **Retry last sale** reuses it and gets
  the original response back (`Idempotent-Replayed: true`); edit its body and you get 409.
- **Card declined** → 402, then check **Inventory → Stock of one product**: nothing is missing.
- **Cross-tenant checks**: log in as an Acme user and every request returns 404.
- Log in as the cashier and try **Adjust stock** or **Create product** → 403.
- **Tenant admin (onboarding flow)**: run the folder top to bottom. The platform admin onboards a merchant,
  the owner accepts, opens a store and invites a cashier, who accepts and only sees the new store.

---

## 9. Assumptions and limitations

**Decisions not fixed by the brief**

- **Merchant = tenant.** One shared database and schema, `merchant_id` on every tenant row, enforced three
  ways: application filters, composite foreign keys, and row-level security.
- Products are merchant-wide with one price for all stores. Per-store prices would need a separate table.
- The payment is taken as part of sale creation, not as a separate call. One payment attempt per sale; a
  declined sale is final and the POS starts a new one.
- A cashier can see all sales of their store, not only their own.
- `itemCount` is the number of units, not the number of lines.
- Products are never hard-deleted (`DELETE` deactivates), because sales refer to them.
- No taxes, discounts, refunds, multiple currencies per merchant, or split payments.

**Known limitations**

- The mock provider keeps charges in memory. After a restart it can't confirm a charge made before the
  restart, so the reconciler marks such sales as failed. A real provider can be queried for this.
- A sale left in `PENDING_PAYMENT` holds its stock until the reconciler runs (≈ `SALE_RECONCILE_AFTER_SECONDS`
  + up to 30 s).
- Idempotency records are kept forever; production would need a cleanup job (e.g. delete after 24–48 h).
- Retrying while the first request is still running returns 409 instead of waiting for the result.
- The reconciler is a simple in-process interval. Running several instances is safe (row lock + status check)
  but they all poll; a proper job queue or a leader would be cleaner.
- No refresh tokens, logout/revocation list, login rate limiting or account lockout.
- Invitation tokens are returned by the API because there is no email service. Users can't change their
  password or reset a forgotten one yet.
- The cache has no stampede protection.
