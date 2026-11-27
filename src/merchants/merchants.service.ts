import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { highestRole } from '../access/permissions';
import { Role } from '../access/role.enum';

@Injectable()
export class MerchantsService {
  constructor(private readonly access: AccessService) {}

  // merchants the user belongs to, one entry per merchant
  async listForUser(userId: string) {
    const memberships = await this.access.listMemberships(userId);
    const byMerchant = new Map<string, { id: string; name: string; roles: Role[] }>();

    for (const m of memberships) {
      const entry = byMerchant.get(m.merchantId) ?? { id: m.merchantId, name: m.merchantName, roles: [] };
      entry.roles.push(m.role);
      byMerchant.set(m.merchantId, entry);
    }

    return [...byMerchant.values()].map(({ id, name, roles }) => ({
      id,
      name,
      role: highestRole(roles),
    }));
  }
}
