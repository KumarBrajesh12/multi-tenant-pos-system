import { Role } from './role.enum';

export enum Permission {
  STORE_READ = 'store:read',
  PRODUCT_READ = 'product:read',
  PRODUCT_WRITE = 'product:write',
  INVENTORY_READ = 'inventory:read',
  INVENTORY_ADJUST = 'inventory:adjust',
  SALE_CREATE = 'sale:create',
  SALE_READ = 'sale:read',
}

const CASHIER: Permission[] = [
  Permission.STORE_READ,
  Permission.PRODUCT_READ,
  Permission.INVENTORY_READ,
  Permission.SALE_CREATE,
  Permission.SALE_READ,
];

const STORE_MANAGER: Permission[] = [...CASHIER, Permission.INVENTORY_ADJUST];

const MERCHANT_ADMIN: Permission[] = [...STORE_MANAGER, Permission.PRODUCT_WRITE];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [Role.CASHIER]: new Set(CASHIER),
  [Role.STORE_MANAGER]: new Set(STORE_MANAGER),
  [Role.MERCHANT_ADMIN]: new Set(MERCHANT_ADMIN),
};

// higher wins when a user has more than one membership that applies
export const ROLE_RANK: Record<Role, number> = {
  [Role.CASHIER]: 1,
  [Role.STORE_MANAGER]: 2,
  [Role.MERCHANT_ADMIN]: 3,
};

export const hasPermission = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].has(permission);

export const highestRole = (roles: Role[]): Role | undefined =>
  roles.reduce<Role | undefined>(
    (best, role) => (!best || ROLE_RANK[role] > ROLE_RANK[best] ? role : best),
    undefined,
  );
