import { Injectable } from '@nestjs/common';
import { TenantContext } from '../access/tenant-context';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { Store } from './entities/store.entity';
import { StoresRepository } from './stores.repository';

@Injectable()
export class StoresService {
  constructor(private readonly stores: StoresRepository) {}

  async list(tenant: TenantContext) {
    const stores = await this.stores.findAccessible(tenant);
    return stores.map((s) => this.toResponse(s));
  }

  async get(tenant: TenantContext) {
    const store = await this.stores.findOne(tenant.merchantId, tenant.storeId!);
    if (!store) throw new ResourceNotFoundException('Store');
    return { ...this.toResponse(store), yourRole: tenant.role };
  }

  private toResponse(s: Store) {
    return {
      id: s.id,
      merchantId: s.merchantId,
      code: s.code,
      name: s.name,
      address: s.address,
      isActive: s.isActive,
    };
  }
}
