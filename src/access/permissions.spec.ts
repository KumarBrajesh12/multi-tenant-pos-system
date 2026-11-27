import { hasPermission, highestRole, Permission } from './permissions';
import { Role } from './role.enum';

describe('permissions', () => {
  it.each([
    [Role.CASHIER, Permission.SALE_CREATE, true],
    [Role.CASHIER, Permission.INVENTORY_READ, true],
    [Role.CASHIER, Permission.INVENTORY_ADJUST, false],
    [Role.CASHIER, Permission.PRODUCT_WRITE, false],
    [Role.STORE_MANAGER, Permission.INVENTORY_ADJUST, true],
    [Role.STORE_MANAGER, Permission.PRODUCT_WRITE, false],
    [Role.MERCHANT_ADMIN, Permission.PRODUCT_WRITE, true],
    [Role.MERCHANT_ADMIN, Permission.SALE_CREATE, true],
  ])('%s -> %s = %s', (role, permission, expected) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });

  it('picks the strongest role when a user has several memberships', () => {
    expect(highestRole([Role.CASHIER, Role.MERCHANT_ADMIN, Role.STORE_MANAGER])).toBe(Role.MERCHANT_ADMIN);
    expect(highestRole([Role.CASHIER, Role.STORE_MANAGER])).toBe(Role.STORE_MANAGER);
    expect(highestRole([])).toBeUndefined();
  });
});
