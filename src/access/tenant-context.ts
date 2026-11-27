import { Role } from './role.enum';

/**
 * Resolved by TenantGuard from the route params + the user's memberships in the DB.
 * Services only ever scope queries with these values, never with raw request input.
 */
export interface TenantContext {
  userId: string;
  merchantId: string;
  role: Role;
  // set for /stores/:storeId/... routes
  storeId?: string;
  // stores the user can see in this merchant; 'ALL' for merchant admins
  storeIds: string[] | 'ALL';
}
