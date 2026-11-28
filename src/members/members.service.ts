import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Membership } from '../access/entities/membership.entity';
import { assertRoleScope } from '../access/role-scope';
import { Role } from '../access/role.enum';
import { TenantContext } from '../access/tenant-context';
import { AppException, ResourceNotFoundException } from '../common/exceptions/app.exception';
import { isUniqueViolation } from '../common/utils/db';
import { TenantDb } from '../database/tenant-db';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { MembershipsRepository } from './memberships.repository';

@Injectable()
export class MembersService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly memberships: MembershipsRepository,
  ) {}

  list(tenant: TenantContext) {
    return this.tenantDb.run(tenant.merchantId, (em) => this.memberships.listForMerchant(em, tenant.merchantId));
  }

  async changeRole(tenant: TenantContext, membershipId: string, dto: UpdateMembershipDto) {
    const storeId = dto.storeId ?? null;
    assertRoleScope(dto.role, storeId);

    try {
      return await this.tenantDb.run(tenant.merchantId, async (em) => {
        const membership = await this.getOrFail(em, tenant.merchantId, membershipId);
        if (storeId) {
          const rows = await em.query(`SELECT 1 FROM stores WHERE id = $1 AND merchant_id = $2`, [
            storeId,
            tenant.merchantId,
          ]);
          if (rows.length === 0) throw new ResourceNotFoundException('Store');
        }
        if (membership.role === Role.MERCHANT_ADMIN && dto.role !== Role.MERCHANT_ADMIN) {
          await this.assertNotLastAdmin(em, tenant.merchantId, membership.id);
        }
        await this.memberships.update(em, membership.id, { role: dto.role, storeId });

        const members = await this.memberships.listForMerchant(em, tenant.merchantId);
        return members.find((m) => m.id === membershipId)!;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_MEMBER', 'The user already has a membership with that scope');
      }
      throw err;
    }
  }

  // takes effect on the user's next request - access is never cached in the token
  async remove(tenant: TenantContext, membershipId: string): Promise<void> {
    await this.tenantDb.run(tenant.merchantId, async (em) => {
      const membership = await this.getOrFail(em, tenant.merchantId, membershipId);
      if (membership.role === Role.MERCHANT_ADMIN) {
        await this.assertNotLastAdmin(em, tenant.merchantId, membership.id);
      }
      await this.memberships.delete(em, membership.id);
    });
  }

  private async getOrFail(em: EntityManager, merchantId: string, id: string): Promise<Membership> {
    const membership = await this.memberships.findOne(em, merchantId, id);
    if (!membership) throw new ResourceNotFoundException('Membership');
    return membership;
  }

  private async assertNotLastAdmin(em: EntityManager, merchantId: string, membershipId: string): Promise<void> {
    const adminIds = await this.memberships.lockAdminIds(em, merchantId);
    if (adminIds.filter((id) => id !== membershipId).length === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'LAST_MERCHANT_ADMIN',
        'A merchant needs at least one admin. Make someone else admin first.',
      );
    }
  }
}
