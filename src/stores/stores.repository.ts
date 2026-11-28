import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { TenantContext } from '../access/tenant-context';
import { Store } from './entities/store.entity';

@Injectable()
export class StoresRepository {
  findAccessible(em: EntityManager, tenant: TenantContext): Promise<Store[]> {
    if (tenant.storeIds !== 'ALL' && tenant.storeIds.length === 0) {
      return Promise.resolve([]);
    }
    return em.getRepository(Store).find({
      where: {
        merchantId: tenant.merchantId,
        isActive: true,
        ...(tenant.storeIds === 'ALL' ? {} : { id: In(tenant.storeIds) }),
      },
      order: { name: 'ASC' },
    });
  }

  findOne(em: EntityManager, merchantId: string, storeId: string): Promise<Store | null> {
    return em.getRepository(Store).findOne({ where: { id: storeId, merchantId } });
  }

  // admin view: includes inactive stores
  findAllForMerchant(em: EntityManager, merchantId: string): Promise<Store[]> {
    return em.getRepository(Store).find({ where: { merchantId }, order: { name: 'ASC' } });
  }

  create(em: EntityManager, merchantId: string, data: Partial<Store>): Promise<Store> {
    const repo = em.getRepository(Store);
    return repo.save(repo.create({ ...data, merchantId }));
  }

  save(em: EntityManager, store: Store): Promise<Store> {
    return em.getRepository(Store).save(store);
  }
}
