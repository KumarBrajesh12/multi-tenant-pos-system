import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '../access/role.enum';
import { TenantContext } from '../access/tenant-context';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { isUniqueViolation } from '../common/utils/db';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { Store } from './entities/store.entity';
import { StoresRepository } from './stores.repository';

@Injectable()
export class StoresService {
  constructor(private readonly stores: StoresRepository) {}

  // admins also see closed stores (so they can reopen them), staff only their active ones
  async list(tenant: TenantContext) {
    const stores =
      tenant.role === Role.MERCHANT_ADMIN
        ? await this.stores.findAllForMerchant(tenant.merchantId)
        : await this.stores.findAccessible(tenant);
    return stores.map((s) => this.toResponse(s));
  }

  async get(tenant: TenantContext) {
    const store = await this.stores.findOne(tenant.merchantId, tenant.storeId!);
    if (!store) throw new ResourceNotFoundException('Store');
    return { ...this.toResponse(store), yourRole: tenant.role };
  }

  async create(tenant: TenantContext, dto: CreateStoreDto) {
    try {
      const store = await this.stores.create(tenant.merchantId, {
        code: dto.code,
        name: dto.name,
        address: dto.address ?? null,
      });
      return this.toResponse(store);
    } catch (err) {
      if (isUniqueViolation(err, 'uq_stores_merchant_code')) {
        throw new AppException(HttpStatus.CONFLICT, 'STORE_CODE_EXISTS', `A store with code ${dto.code} already exists`);
      }
      throw err;
    }
  }

  async update(tenant: TenantContext, storeId: string, dto: UpdateStoreDto) {
    const store = await this.stores.findOne(tenant.merchantId, storeId);
    if (!store) throw new ResourceNotFoundException('Store');
    Object.assign(store, dto);
    return this.toResponse(await this.stores.save(store));
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
