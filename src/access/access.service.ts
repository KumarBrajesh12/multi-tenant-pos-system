import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { highestRole } from './permissions';
import { Role } from './role.enum';
import { TenantContext } from './tenant-context';

interface MembershipRow {
  merchant_id: string;
  store_id: string | null;
  role: Role;
}

@Injectable()
export class AccessService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Access to a single store. The store must be active, its merchant active, and the
   * user needs either a merchant-wide membership or one for this exact store.
   * Returns null when any of that is false - callers turn it into a 404.
   */
  async resolveStoreAccess(userId: string, storeId: string): Promise<TenantContext | null> {
    const rows: MembershipRow[] = await this.db.query(
      `SELECT s.merchant_id, m.store_id, m.role
         FROM stores s
         JOIN merchants mer ON mer.id = s.merchant_id AND mer.is_active
         JOIN memberships m ON m.merchant_id = s.merchant_id
                           AND m.user_id = $1
                           AND m.is_active
                           AND (m.store_id IS NULL OR m.store_id = s.id)
        WHERE s.id = $2 AND s.is_active`,
      [userId, storeId],
    );
    if (rows.length === 0) return null;

    const role = highestRole(rows.map((r) => r.role))!;
    return {
      userId,
      merchantId: rows[0].merchant_id,
      storeId,
      role,
      storeIds: role === Role.MERCHANT_ADMIN ? 'ALL' : [storeId],
    };
  }

  /**
   * Access at merchant level (catalogue, store list). Any active membership in the
   * merchant is enough to get in; what the user can do depends on their best role.
   */
  async resolveMerchantAccess(userId: string, merchantId: string): Promise<TenantContext | null> {
    const rows: MembershipRow[] = await this.db.query(
      `SELECT m.merchant_id, m.store_id, m.role
         FROM memberships m
         JOIN merchants mer ON mer.id = m.merchant_id AND mer.is_active
         LEFT JOIN stores s ON s.id = m.store_id
        WHERE m.user_id = $1
          AND m.merchant_id = $2
          AND m.is_active
          AND (m.store_id IS NULL OR s.is_active)`,
      [userId, merchantId],
    );
    if (rows.length === 0) return null;

    const role = highestRole(rows.map((r) => r.role))!;
    return {
      userId,
      merchantId,
      role,
      storeIds:
        role === Role.MERCHANT_ADMIN ? 'ALL' : rows.map((r) => r.store_id).filter((id): id is string => !!id),
    };
  }

  // used by /auth/me and /merchants
  async listMemberships(userId: string) {
    const rows: Array<{
      merchant_id: string;
      merchant_name: string;
      store_id: string | null;
      store_name: string | null;
      role: Role;
    }> = await this.db.query(
      `SELECT mer.id AS merchant_id, mer.name AS merchant_name,
              s.id AS store_id, s.name AS store_name, m.role
         FROM memberships m
         JOIN merchants mer ON mer.id = m.merchant_id AND mer.is_active
         LEFT JOIN stores s ON s.id = m.store_id
        WHERE m.user_id = $1 AND m.is_active
          AND (m.store_id IS NULL OR s.is_active)
        ORDER BY mer.name, s.name NULLS FIRST`,
      [userId],
    );
    return rows.map((r) => ({
      merchantId: r.merchant_id,
      merchantName: r.merchant_name,
      storeId: r.store_id,
      storeName: r.store_name,
      role: r.role,
    }));
  }
}
