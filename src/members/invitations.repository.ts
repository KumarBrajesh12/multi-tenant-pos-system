import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Invitation } from './entities/invitation.entity';

@Injectable()
export class InvitationsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // re-inviting someone replaces the previous open invitation (old link stops working)
  async revokeOpen(em: EntityManager, merchantId: string, email: string, storeId: string | null): Promise<void> {
    await em.query(
      `UPDATE invitations SET revoked_at = now()
        WHERE merchant_id = $1 AND email = $2 AND store_id IS NOT DISTINCT FROM $3
          AND accepted_at IS NULL AND revoked_at IS NULL`,
      [merchantId, email, storeId],
    );
  }

  create(em: EntityManager, data: Partial<Invitation>): Promise<Invitation> {
    const repo = em.getRepository(Invitation);
    return repo.save(repo.create(data));
  }

  findOpenByTokenHashForUpdate(em: EntityManager, tokenHash: string): Promise<Invitation | null> {
    return em
      .getRepository(Invitation)
      .createQueryBuilder('i')
      .where('i.tokenHash = :tokenHash', { tokenHash })
      .andWhere('i.acceptedAt IS NULL AND i.revokedAt IS NULL AND i.expiresAt > now()')
      .setLock('pessimistic_write')
      .getOne();
  }

  listOpen(merchantId: string): Promise<Invitation[]> {
    return this.db.getRepository(Invitation).find({
      where: { merchantId, acceptedAt: IsNull(), revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  findOpen(merchantId: string, id: string): Promise<Invitation | null> {
    return this.db.getRepository(Invitation).findOne({
      where: { id, merchantId, acceptedAt: IsNull(), revokedAt: IsNull() },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.db.getRepository(Invitation).update({ id }, { revokedAt: new Date() });
  }

  async markAccepted(em: EntityManager, id: string, userId: string): Promise<void> {
    await em.update(Invitation, { id }, { acceptedAt: new Date(), acceptedUserId: userId });
  }
}
