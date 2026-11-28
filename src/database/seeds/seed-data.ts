import { Role } from '../../access/role.enum';

// Fixed IDs so the Postman collection / README examples work right after seeding.
export const IDS = {
  merchants: {
    acme: '10000000-0000-4000-8000-000000000001',
    bluebird: '10000000-0000-4000-8000-000000000002',
  },
  stores: {
    acmeDowntown: '20000000-0000-4000-8000-000000000011',
    acmeAirport: '20000000-0000-4000-8000-000000000012',
    bluebirdCentral: '20000000-0000-4000-8000-000000000021',
  },
  users: {
    acmeOwner: '30000000-0000-4000-8000-000000000001',
    acmeDowntownManager: '30000000-0000-4000-8000-000000000002',
    acmeDowntownCashier: '30000000-0000-4000-8000-000000000003',
    acmeAirportCashier: '30000000-0000-4000-8000-000000000004',
    bluebirdOwner: '30000000-0000-4000-8000-000000000005',
    bluebirdCashier: '30000000-0000-4000-8000-000000000006',
    consultant: '30000000-0000-4000-8000-000000000007',
    platformAdmin: '30000000-0000-4000-8000-000000000099',
  },
  products: {
    acmeEspresso: '40000000-0000-4000-8000-000000000001',
    acmeLatte: '40000000-0000-4000-8000-000000000002',
    acmeCroissant: '40000000-0000-4000-8000-000000000003',
    acmeMuffin: '40000000-0000-4000-8000-000000000004',
    acmeBeans: '40000000-0000-4000-8000-000000000005',
    acmeMug: '40000000-0000-4000-8000-000000000006',
    bluebirdNotebook: '40000000-0000-4000-8000-000000000101',
    bluebirdPens: '40000000-0000-4000-8000-000000000102',
    bluebirdBookmark: '40000000-0000-4000-8000-000000000103',
    bluebirdEspresso: '40000000-0000-4000-8000-000000000104',
  },
} as const;

// demo password for every seeded user (local/dev data only)
export const SEED_PASSWORD = 'Password123!';

export const merchants = [
  { id: IDS.merchants.acme, name: 'Acme Coffee Co.', slug: 'acme-coffee', currency: 'USD' },
  { id: IDS.merchants.bluebird, name: 'Bluebird Books', slug: 'bluebird-books', currency: 'USD' },
];

export const stores = [
  {
    id: IDS.stores.acmeDowntown,
    merchantId: IDS.merchants.acme,
    code: 'ACME-DT',
    name: 'Acme Downtown',
    address: '12 Main Street',
  },
  {
    id: IDS.stores.acmeAirport,
    merchantId: IDS.merchants.acme,
    code: 'ACME-AP',
    name: 'Acme Airport Kiosk',
    address: 'Terminal 2, Gate B',
  },
  {
    id: IDS.stores.bluebirdCentral,
    merchantId: IDS.merchants.bluebird,
    code: 'BB-CENTRAL',
    name: 'Bluebird Central',
    address: '5 Library Lane',
  },
];

export const users = [
  { id: IDS.users.acmeOwner, email: 'owner@acme.test', fullName: 'Alice Owner' },
  { id: IDS.users.acmeDowntownManager, email: 'manager.downtown@acme.test', fullName: 'Mark Manager' },
  { id: IDS.users.acmeDowntownCashier, email: 'cashier.downtown@acme.test', fullName: 'Carl Cashier' },
  { id: IDS.users.acmeAirportCashier, email: 'cashier.airport@acme.test', fullName: 'Amy Airport' },
  { id: IDS.users.bluebirdOwner, email: 'owner@bluebird.test', fullName: 'Bob Bluebird' },
  { id: IDS.users.bluebirdCashier, email: 'cashier.central@bluebird.test', fullName: 'Cathy Central' },
  { id: IDS.users.consultant, email: 'consultant@example.test', fullName: 'Chris Consultant' },
  // runs the platform: can create/suspend merchants, has no membership in any of them
  { id: IDS.users.platformAdmin, email: 'admin@platform.test', fullName: 'Pat Platform', isPlatformAdmin: true },
];

export const memberships = [
  { userId: IDS.users.acmeOwner, merchantId: IDS.merchants.acme, storeId: null, role: Role.MERCHANT_ADMIN },
  {
    userId: IDS.users.acmeDowntownManager,
    merchantId: IDS.merchants.acme,
    storeId: IDS.stores.acmeDowntown,
    role: Role.STORE_MANAGER,
  },
  {
    userId: IDS.users.acmeDowntownCashier,
    merchantId: IDS.merchants.acme,
    storeId: IDS.stores.acmeDowntown,
    role: Role.CASHIER,
  },
  {
    userId: IDS.users.acmeAirportCashier,
    merchantId: IDS.merchants.acme,
    storeId: IDS.stores.acmeAirport,
    role: Role.CASHIER,
  },
  { userId: IDS.users.bluebirdOwner, merchantId: IDS.merchants.bluebird, storeId: null, role: Role.MERCHANT_ADMIN },
  {
    userId: IDS.users.bluebirdCashier,
    merchantId: IDS.merchants.bluebird,
    storeId: IDS.stores.bluebirdCentral,
    role: Role.CASHIER,
  },
  // works for both merchants with different roles
  { userId: IDS.users.consultant, merchantId: IDS.merchants.bluebird, storeId: null, role: Role.MERCHANT_ADMIN },
  {
    userId: IDS.users.consultant,
    merchantId: IDS.merchants.acme,
    storeId: IDS.stores.acmeAirport,
    role: Role.CASHIER,
  },
];

export const products = [
  { id: IDS.products.acmeEspresso, merchantId: IDS.merchants.acme, sku: 'ESPRESSO', name: 'Espresso', priceCents: 300 },
  { id: IDS.products.acmeLatte, merchantId: IDS.merchants.acme, sku: 'LATTE-M', name: 'Latte (medium)', priceCents: 450 },
  { id: IDS.products.acmeCroissant, merchantId: IDS.merchants.acme, sku: 'CROISSANT', name: 'Butter Croissant', priceCents: 325 },
  { id: IDS.products.acmeMuffin, merchantId: IDS.merchants.acme, sku: 'MUFFIN-BB', name: 'Blueberry Muffin', priceCents: 295 },
  {
    id: IDS.products.acmeBeans,
    merchantId: IDS.merchants.acme,
    sku: 'BEANS-1KG',
    name: 'House Blend Beans 1kg',
    description: 'Medium roast, whole bean',
    priceCents: 2499,
  },
  {
    id: IDS.products.acmeMug,
    merchantId: IDS.merchants.acme,
    sku: 'MUG-SEASONAL',
    name: 'Seasonal Mug',
    priceCents: 1500,
    isActive: false,
  },
  { id: IDS.products.bluebirdNotebook, merchantId: IDS.merchants.bluebird, sku: 'NOTEBOOK-A5', name: 'A5 Dotted Notebook', priceCents: 899 },
  { id: IDS.products.bluebirdPens, merchantId: IDS.merchants.bluebird, sku: 'PENS-GEL-6', name: 'Gel Pen Set (6)', priceCents: 1250 },
  { id: IDS.products.bluebirdBookmark, merchantId: IDS.merchants.bluebird, sku: 'BOOKMARK', name: 'Leather Bookmark', priceCents: 199 },
  // same SKU as Acme (SKUs are unique per merchant only)
  { id: IDS.products.bluebirdEspresso, merchantId: IDS.merchants.bluebird, sku: 'ESPRESSO', name: 'Reading Room Espresso', priceCents: 275 },
];

// stock per store - same product, different quantities in each store
export const inventory = [
  { storeId: IDS.stores.acmeDowntown, productId: IDS.products.acmeEspresso, quantity: 120 },
  { storeId: IDS.stores.acmeDowntown, productId: IDS.products.acmeLatte, quantity: 80 },
  { storeId: IDS.stores.acmeDowntown, productId: IDS.products.acmeCroissant, quantity: 24 },
  { storeId: IDS.stores.acmeDowntown, productId: IDS.products.acmeMuffin, quantity: 5 },
  { storeId: IDS.stores.acmeDowntown, productId: IDS.products.acmeBeans, quantity: 10 },
  { storeId: IDS.stores.acmeAirport, productId: IDS.products.acmeEspresso, quantity: 40 },
  { storeId: IDS.stores.acmeAirport, productId: IDS.products.acmeLatte, quantity: 30 },
  { storeId: IDS.stores.acmeAirport, productId: IDS.products.acmeCroissant, quantity: 0 },
  { storeId: IDS.stores.bluebirdCentral, productId: IDS.products.bluebirdNotebook, quantity: 50 },
  { storeId: IDS.stores.bluebirdCentral, productId: IDS.products.bluebirdPens, quantity: 25 },
  { storeId: IDS.stores.bluebirdCentral, productId: IDS.products.bluebirdBookmark, quantity: 200 },
  { storeId: IDS.stores.bluebirdCentral, productId: IDS.products.bluebirdEspresso, quantity: 15 },
];
