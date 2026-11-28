import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { Invitation } from './entities/invitation.entity';

@Injectable()
export class InvitationsRepository {
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

  // used by the public accept endpoint: the token is the only key, so this runs without a tenant
  findOpenByTokenHashForUpdate(em: EntityManager, tokenHash: string): Promise<Invitation | null> {
    return em
      .getRepository(Invitation)
      .createQueryBuilder('i')
      .where('i.tokenHash = :tokenHash', { tokenHash })
      .andWhere('i.acceptedAt IS NULL AND i.revokedAt IS NULL AND i.expiresAt > now()')
      .setLock('pessimistic_write')
      .getOne();
  }

  listOpen(em: EntityManager, merchantId: string): Promise<Invitation[]> {
    return em.getRepository(Invitation).find({
      where: { merchantId, acceptedAt: IsNull(), revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  findOpen(em: EntityManager, merchantId: string, id: string): Promise<Invitation | null> {
    return em.getRepository(Invitation).findOne({
      where: { id, merchantId, acceptedAt: IsNull(), revokedAt: IsNull() },
    });
  }

  async revoke(em: EntityManager, id: string): Promise<void> {
    await em.getRepository(Invitation).update({ id }, { revokedAt: new Date() });
  }

  async markAccepted(em: EntityManager, id: string, userId: string): Promise<void> {
    await em.update(Invitation, { id }, { acceptedAt: new Date(), acceptedUserId: userId });
  }
}
