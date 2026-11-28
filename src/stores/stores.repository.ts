import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantContext } from '../access/tenant-context';
import { Store } from './entities/store.entity';

@Injectable()
export class StoresRepository {
  constructor(@InjectRepository(Store) private readonly repo: Repository<Store>) {}

  findAccessible(tenant: TenantContext): Promise<Store[]> {
    if (tenant.storeIds !== 'ALL' && tenant.storeIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.repo.find({
      where: {
        merchantId: tenant.merchantId,
        isActive: true,
        ...(tenant.storeIds === 'ALL' ? {} : { id: In(tenant.storeIds) }),
      },
      order: { name: 'ASC' },
    });
  }

  findOne(merchantId: string, storeId: string): Promise<Store | null> {
    return this.repo.findOne({ where: { id: storeId, merchantId } });
  }

  // admin view: includes inactive stores
  findAllForMerchant(merchantId: string): Promise<Store[]> {
    return this.repo.find({ where: { merchantId }, order: { name: 'ASC' } });
  }

  create(merchantId: string, data: Partial<Store>): Promise<Store> {
    return this.repo.save(this.repo.create({ ...data, merchantId }));
  }

  save(store: Store): Promise<Store> {
    return this.repo.save(store);
  }
}
