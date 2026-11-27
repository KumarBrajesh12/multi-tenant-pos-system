import { MigrationInterface, QueryRunner } from 'typeorm';

// Merchant = tenant. Every tenant-owned table has merchant_id, and child tables
// use composite FKs like (store_id, merchant_id) -> stores(id, merchant_id) so a
// row can never mix data from two merchants.
// Status columns are varchar + CHECK instead of PG enums (easier to extend).
export class InitialSchema1764200000000 implements MigrationInterface {
  name = 'InitialSchema1764200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // ---------------------------------------------------------------- merchants (tenants)
    await q.query(`
      CREATE TABLE merchants (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
        slug        varchar(100) NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        currency    char(3)      NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
        is_active   boolean      NOT NULL DEFAULT true,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_merchants_slug UNIQUE (slug)
      );
    `);

    // ---------------------------------------------------------------- stores
    await q.query(`
      CREATE TABLE stores (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id uuid         NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
        code        varchar(50)  NOT NULL CHECK (code ~ '^[A-Z0-9_-]+$'),
        name        varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
        address     text,
        is_active   boolean      NOT NULL DEFAULT true,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_stores_merchant_code UNIQUE (merchant_id, code),
        CONSTRAINT uq_stores_id_merchant   UNIQUE (id, merchant_id)
      );
    `);

    // users are global (one person can work for several merchants),
    // access to a merchant/store comes only from memberships
    // ---------------------------------------------------------------- users
    await q.query(`
      CREATE TABLE users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email         varchar(320) NOT NULL CHECK (email = lower(email) AND position('@' in email) > 1),
        password_hash varchar(100) NOT NULL,
        full_name     varchar(200) NOT NULL CHECK (length(btrim(full_name)) > 0),
        is_active     boolean      NOT NULL DEFAULT true,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email)
      );
    `);

    // ---------------------------------------------------------------- memberships (user <-> merchant/store + role)
    await q.query(`
      CREATE TABLE memberships (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        merchant_id uuid        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        store_id    uuid,
        role        varchar(32) NOT NULL CHECK (role IN ('MERCHANT_ADMIN', 'STORE_MANAGER', 'CASHIER')),
        is_active   boolean     NOT NULL DEFAULT true,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_memberships_store FOREIGN KEY (store_id, merchant_id)
          REFERENCES stores(id, merchant_id) ON DELETE CASCADE,
        -- admin = whole merchant, manager/cashier = one store
        CONSTRAINT ck_memberships_role_scope CHECK (
          (role = 'MERCHANT_ADMIN' AND store_id IS NULL) OR
          (role IN ('STORE_MANAGER', 'CASHIER') AND store_id IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX uq_memberships_merchant_level ON memberships (user_id, merchant_id) WHERE store_id IS NULL;
      CREATE UNIQUE INDEX uq_memberships_store_level    ON memberships (user_id, store_id)    WHERE store_id IS NOT NULL;
      CREATE INDEX ix_memberships_merchant ON memberships (merchant_id);
      CREATE INDEX ix_memberships_store    ON memberships (store_id) WHERE store_id IS NOT NULL;
    `);

    // ---------------------------------------------------------------- products (merchant-owned catalogue)
    await q.query(`
      CREATE TABLE products (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id uuid         NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
        sku         varchar(64)  NOT NULL CHECK (sku ~ '^[A-Z0-9._-]+$'),
        name        varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
        description text,
        price_cents integer      NOT NULL CHECK (price_cents >= 0),
        is_active   boolean      NOT NULL DEFAULT true,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_products_merchant_sku UNIQUE (merchant_id, sku),
        CONSTRAINT uq_products_id_merchant  UNIQUE (id, merchant_id)
      );
      CREATE INDEX ix_products_merchant_active_name ON products (merchant_id, is_active, name);
      CREATE INDEX ix_products_merchant_created     ON products (merchant_id, created_at DESC);
    `);

    // ---------------------------------------------------------------- inventory (per store, per product)
    await q.query(`
      CREATE TABLE inventory (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id uuid        NOT NULL,
        store_id    uuid        NOT NULL,
        product_id  uuid        NOT NULL,
        quantity    integer     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_inventory_store_product UNIQUE (store_id, product_id),
        CONSTRAINT fk_inventory_store   FOREIGN KEY (store_id, merchant_id)
          REFERENCES stores(id, merchant_id) ON DELETE CASCADE,
        CONSTRAINT fk_inventory_product FOREIGN KEY (product_id, merchant_id)
          REFERENCES products(id, merchant_id) ON DELETE RESTRICT
      );
      CREATE INDEX ix_inventory_product ON inventory (product_id);
    `);

    // ---------------------------------------------------------------- sales
    await q.query(`
      CREATE TABLE sales (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id     uuid         NOT NULL,
        store_id        uuid         NOT NULL,
        cashier_user_id uuid         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status          varchar(32)  NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'COMPLETED', 'PAYMENT_FAILED')),
        currency        char(3)      NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        total_cents     bigint       NOT NULL CHECK (total_cents >= 0),
        item_count      integer      NOT NULL CHECK (item_count > 0),
        idempotency_key varchar(255) NOT NULL,
        failure_reason  varchar(255),
        completed_at    timestamptz,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        updated_at      timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_sales_id_merchant UNIQUE (id, merchant_id),
        CONSTRAINT uq_sales_store_idempotency_key UNIQUE (store_id, idempotency_key),
        CONSTRAINT fk_sales_store FOREIGN KEY (store_id, merchant_id)
          REFERENCES stores(id, merchant_id) ON DELETE RESTRICT,
        CONSTRAINT ck_sales_completed_at CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL)
      );
      CREATE INDEX ix_sales_store_created ON sales (store_id, created_at DESC);
      CREATE INDEX ix_sales_merchant_created ON sales (merchant_id, created_at DESC);
      -- for the job that cleans up sales stuck in PENDING_PAYMENT
      CREATE INDEX ix_sales_pending ON sales (updated_at) WHERE status = 'PENDING_PAYMENT';
    `);

    // ---------------------------------------------------------------- sale_items (price/name snapshot)
    await q.query(`
      CREATE TABLE sale_items (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id      uuid         NOT NULL,
        sale_id          uuid         NOT NULL,
        product_id       uuid         NOT NULL,
        product_sku      varchar(64)  NOT NULL,
        product_name     varchar(200) NOT NULL,
        unit_price_cents integer      NOT NULL CHECK (unit_price_cents >= 0),
        quantity         integer      NOT NULL CHECK (quantity > 0),
        line_total_cents bigint       NOT NULL,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_sale_items_sale_product UNIQUE (sale_id, product_id),
        CONSTRAINT fk_sale_items_sale    FOREIGN KEY (sale_id, merchant_id)
          REFERENCES sales(id, merchant_id) ON DELETE CASCADE,
        CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id, merchant_id)
          REFERENCES products(id, merchant_id) ON DELETE RESTRICT,
        CONSTRAINT ck_sale_items_line_total CHECK (line_total_cents = unit_price_cents::bigint * quantity)
      );
      CREATE INDEX ix_sale_items_product ON sale_items (product_id);
    `);

    // ---------------------------------------------------------------- payments
    await q.query(`
      CREATE TABLE payments (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id        uuid         NOT NULL,
        sale_id            uuid         NOT NULL,
        provider           varchar(32)  NOT NULL,
        method             varchar(32)  NOT NULL CHECK (method IN ('CARD', 'CASH', 'WALLET')),
        status             varchar(32)  NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
        amount_cents       bigint       NOT NULL CHECK (amount_cents >= 0),
        currency           char(3)      NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        provider_reference varchar(255),
        failure_code       varchar(64),
        failure_message    varchar(255),
        processed_at       timestamptz,
        created_at         timestamptz  NOT NULL DEFAULT now(),
        updated_at         timestamptz  NOT NULL DEFAULT now(),
        -- one payment per sale; if it fails the POS starts a new sale
        CONSTRAINT uq_payments_sale UNIQUE (sale_id),
        CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id, merchant_id)
          REFERENCES sales(id, merchant_id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX uq_payments_provider_reference
        ON payments (provider, provider_reference) WHERE provider_reference IS NOT NULL;
    `);

    // ---------------------------------------------------------------- inventory_movements (stock history)
    await q.query(`
      CREATE TABLE inventory_movements (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id    uuid        NOT NULL,
        store_id       uuid        NOT NULL,
        product_id     uuid        NOT NULL,
        quantity_delta integer     NOT NULL CHECK (quantity_delta <> 0),
        quantity_after integer     NOT NULL CHECK (quantity_after >= 0),
        reason         varchar(32) NOT NULL CHECK (reason IN
                         ('RESTOCK', 'ADJUSTMENT', 'DAMAGE', 'RETURN', 'SALE', 'SALE_REVERSAL')),
        note           varchar(500),
        sale_id        uuid,
        actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_inv_mov_store   FOREIGN KEY (store_id, merchant_id)
          REFERENCES stores(id, merchant_id) ON DELETE CASCADE,
        CONSTRAINT fk_inv_mov_product FOREIGN KEY (product_id, merchant_id)
          REFERENCES products(id, merchant_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_mov_sale    FOREIGN KEY (sale_id, merchant_id)
          REFERENCES sales(id, merchant_id) ON DELETE CASCADE
      );
      CREATE INDEX ix_inv_mov_store_product_created ON inventory_movements (store_id, product_id, created_at DESC);
      CREATE INDEX ix_inv_mov_sale ON inventory_movements (sale_id) WHERE sale_id IS NOT NULL;
    `);

    // ---------------------------------------------------------------- idempotency_records
    await q.query(`
      CREATE TABLE idempotency_records (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id          uuid         NOT NULL,
        store_id             uuid         NOT NULL,
        user_id              uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key      varchar(255) NOT NULL CHECK (length(idempotency_key) > 0),
        request_hash         char(64)     NOT NULL,
        status               varchar(16)  NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
        response_status_code integer,
        response_body        jsonb,
        sale_id              uuid,
        created_at           timestamptz  NOT NULL DEFAULT now(),
        updated_at           timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_idempotency_store_key UNIQUE (store_id, idempotency_key),
        CONSTRAINT fk_idempotency_store FOREIGN KEY (store_id, merchant_id)
          REFERENCES stores(id, merchant_id) ON DELETE CASCADE,
        CONSTRAINT fk_idempotency_sale  FOREIGN KEY (sale_id, merchant_id)
          REFERENCES sales(id, merchant_id) ON DELETE RESTRICT,
        CONSTRAINT ck_idempotency_completed CHECK (
          status <> 'COMPLETED' OR (response_status_code IS NOT NULL AND response_body IS NOT NULL)
        )
      );
      CREATE INDEX ix_idempotency_created ON idempotency_records (created_at);
    `);

    // ---------------------------------------------------------------- updated_at triggers
    for (const table of [
      'merchants',
      'stores',
      'users',
      'memberships',
      'products',
      'inventory',
      'sales',
      'payments',
      'idempotency_records',
    ]) {
      await q.query(
        `CREATE TRIGGER trg_${table}_updated_at BEFORE UPDATE ON ${table}
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS idempotency_records;
      DROP TABLE IF EXISTS inventory_movements;
      DROP TABLE IF EXISTS payments;
      DROP TABLE IF EXISTS sale_items;
      DROP TABLE IF EXISTS sales;
      DROP TABLE IF EXISTS inventory;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS memberships;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS stores;
      DROP TABLE IF EXISTS merchants;
      DROP FUNCTION IF EXISTS set_updated_at();
    `);
  }
}
