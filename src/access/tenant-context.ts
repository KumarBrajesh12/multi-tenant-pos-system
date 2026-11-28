import { Role } from './role.enum';

// Built by TenantGuard from the memberships table. Services use this, not request input.
export interface TenantContext {
  userId: string;
  merchantId: string;
  role: Role;
  // set for /stores/:storeId/... routes
  storeId?: string;
  // stores the user can see in this merchant; 'ALL' for merchant admins
  storeIds: string[] | 'ALL';
}
