import { MigrationInterface, QueryRunner } from 'typeorm';

// Platform admins (manage merchants) + invitations (how users join a merchant/store).
export class TenantAdministration1764300000000 implements MigrationInterface {
  name = 'TenantAdministration1764300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false`);

    await q.query(`
      CREATE TABLE invitations (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id        uuid         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        store_id           uuid,
        email              varchar(320) NOT NULL CHECK (email = lower(email) AND position('@' in email) > 1),
        role               varchar(32)  NOT NULL CHECK (role IN ('MERCHANT_ADMIN', 'STORE_MANAGER', 'CASHIER')),
        -- only the sha256 of the token is stored, the token itself is shown once
        token_hash         char(64)     NOT NULL,
        invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        expires_at         timestamptz  NOT NULL,
        accepted_at        timestamptz,
        accepted_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
        revoked_at         timestamptz,
        created_at         timestamptz  NOT NULL DEFAULT now(),
        updated_at         timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_invitations_token_hash UNIQUE (token_hash),
        CONSTRAINT fk_invitations_store FOREIGN KEY (store_id, merchant_id)
          REFERENCES stores(id, merchant_id) ON DELETE CASCADE,
        -- same rule as memberships: admin = whole merchant, manager/cashier = one store
        CONSTRAINT ck_invitations_role_scope CHECK (
          (role = 'MERCHANT_ADMIN' AND store_id IS NULL) OR
          (role IN ('STORE_MANAGER', 'CASHIER') AND store_id IS NOT NULL)
        ),
        CONSTRAINT ck_invitations_final_state CHECK (accepted_at IS NULL OR revoked_at IS NULL)
      );
      -- at most one open invitation per person and scope (re-inviting replaces it)
      CREATE UNIQUE INDEX uq_invitations_open
        ON invitations (merchant_id, email, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid))
        WHERE accepted_at IS NULL AND revoked_at IS NULL;
      CREATE INDEX ix_invitations_merchant_created ON invitations (merchant_id, created_at DESC);

      CREATE TRIGGER trg_invitations_updated_at BEFORE UPDATE ON invitations
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS invitations`);
    await q.query(`ALTER TABLE users DROP COLUMN IF EXISTS is_platform_admin`);
  }
}
