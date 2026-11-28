import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Membership } from '../access/entities/membership.entity';
import { Role } from '../access/role.enum';

export interface MemberRow {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  storeId: string | null;
  storeName: string | null;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class MembershipsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  listForMerchant(merchantId: string): Promise<MemberRow[]> {
    return this.db.query(
      `SELECT m.id, m.user_id AS "userId", u.email, u.full_name AS "fullName", m.role,
              m.store_id AS "storeId", s.name AS "storeName", m.is_active AS "isActive", m.created_at AS "createdAt"
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN stores s ON s.id = m.store_id
        WHERE m.merchant_id = $1
        ORDER BY u.email, s.name NULLS FIRST`,
      [merchantId],
    );
  }

  findOne(em: EntityManager, merchantId: string, id: string): Promise<Membership | null> {
    return em.getRepository(Membership).findOne({ where: { id, merchantId } });
  }

  async exists(em: EntityManager, userId: string, merchantId: string, storeId: string | null): Promise<boolean> {
    const rows = await em.query(
      `SELECT 1 FROM memberships
        WHERE user_id = $1 AND merchant_id = $2 AND store_id IS NOT DISTINCT FROM $3`,
      [userId, merchantId, storeId],
    );
    return rows.length > 0;
  }

  // ON CONFLICT without a target also covers the two partial unique indexes
  async insertIfAbsent(
    em: EntityManager,
    data: { userId: string; merchantId: string; storeId: string | null; role: Role },
  ): Promise<void> {
    await em.query(
      `INSERT INTO memberships (user_id, merchant_id, store_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [data.userId, data.merchantId, data.storeId, data.role],
    );
  }

  /**
   * Locks the merchant's admin memberships and returns their ids. Used before
   * removing/demoting an admin so two admins can't remove each other at the same time
   * and leave the merchant with nobody in charge.
   */
  async lockAdminIds(em: EntityManager, merchantId: string): Promise<string[]> {
    const rows: Array<{ id: string }> = await em.query(
      `SELECT id FROM memberships
        WHERE merchant_id = $1 AND role = 'MERCHANT_ADMIN' AND is_active
        FOR UPDATE`,
      [merchantId],
    );
    return rows.map((r) => r.id);
  }

  async update(em: EntityManager, id: string, data: { role: Role; storeId: string | null }): Promise<void> {
    await em.update(Membership, { id }, data);
  }

  async delete(em: EntityManager, id: string): Promise<void> {
    await em.delete(Membership, { id });
  }
}
