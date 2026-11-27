import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Membership } from '../../access/entities/membership.entity';
import { Inventory } from '../../inventory/entities/inventory.entity';
import { InventoryMovement, MovementReason } from '../../inventory/entities/inventory-movement.entity';
import { Merchant } from '../../merchants/entities/merchant.entity';
import { Product } from '../../products/entities/product.entity';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import * as data from './seed-data';

const TENANT_TABLES = [
  'idempotency_records',
  'inventory_movements',
  'payments',
  'sale_items',
  'sales',
  'inventory',
  'products',
  'memberships',
  'users',
  'stores',
  'merchants',
];

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(`TRUNCATE TABLE ${TENANT_TABLES.join(', ')} CASCADE`);
}

// Wipes the data tables and loads the demo data. Used by `npm run seed` and the e2e tests.
export async function seedDatabase(dataSource: DataSource): Promise<void> {
  const passwordHash = await bcrypt.hash(data.SEED_PASSWORD, 10);
  const storeMerchant = new Map(data.stores.map((s) => [s.id, s.merchantId]));

  await dataSource.transaction(async (em) => {
    await em.query(`TRUNCATE TABLE ${TENANT_TABLES.join(', ')} CASCADE`);

    await em.insert(Merchant, data.merchants);
    await em.insert(Store, data.stores);
    await em.insert(
      User,
      data.users.map((u) => ({ ...u, passwordHash })),
    );
    await em.insert(Membership, data.memberships);
    await em.insert(Product, data.products);

    const stock = data.inventory.map((row) => ({
      ...row,
      merchantId: storeMerchant.get(row.storeId)!,
    }));
    await em.insert(Inventory, stock);

    // opening balance in the stock history
    await em.insert(
      InventoryMovement,
      stock
        .filter((row) => row.quantity > 0)
        .map((row) => ({
          merchantId: row.merchantId,
          storeId: row.storeId,
          productId: row.productId,
          quantityDelta: row.quantity,
          quantityAfter: row.quantity,
          reason: MovementReason.RESTOCK,
          note: 'Opening stock (seed)',
        })),
    );
  });
}
