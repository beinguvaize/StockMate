/**
 * supabaseMocks.js
 * ----------------
 * Intercepts all Supabase REST + Auth network calls so smoke tests run
 * offline, deterministically, and without seeded production data.
 *
 * Usage:
 *   import { setupMocks, TENANT_SLUG } from './supabaseMocks.js';
 *   test.beforeEach(async ({ page }) => { await setupMocks(page); });
 */

// Read the project URL from the same env var the app uses so this stays in
// sync when the Supabase project is rotated.  Falls back to the staging URL
// for local dev convenience (never commit the real value here).
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  'https://tiywdsbaymrnqmlkxupj.supabase.co';
export const TENANT_SLUG = 'test-co';
const TENANT_ID = '00000000-0000-0000-0000-000000000099';
const USER_ID = '00000000-0000-0000-0000-000000000001';

// ─── Fixture data ─────────────────────────────────────────────────────────────

export const MOCK_USER = {
  id: USER_ID,
  email: 'owner@test.com',
  name: 'Test Owner',
  roles: ['OWNER'],
  status: 'ACTIVE',
  tenant_id: TENANT_ID,
  permissions: {},
};

export const MOCK_STAFF_USER = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'staff@test.com',
  name: 'Test Staff',
  roles: ['STAFF'],
  status: 'ACTIVE',
  tenant_id: TENANT_ID,
  permissions: {},
};

export const MOCK_TENANT = {
  id: TENANT_ID,
  name: 'Test Co',
  slug: TENANT_SLUG,
  plan: 'ENTERPRISE',      // AppContext reads `currentTenant.plan`, not `plan_tier`
  plan_tier: 'ENTERPRISE', // keep both for compatibility
  status: 'ACTIVE',
};

export const MOCK_PRODUCTS = [
  { id: 'PROD-001', name: 'Widget A', sku: 'WGT-001', category: 'General', stock: 100, sellingPrice: 50, costPrice: 30, taxRate: 18, tenant_id: TENANT_ID },
  { id: 'PROD-002', name: 'Gadget B', sku: 'GDG-002', category: 'General', stock: 50,  sellingPrice: 120, costPrice: 80, taxRate: 18, tenant_id: TENANT_ID },
];

export const MOCK_CLIENTS = [
  { id: 'CLI-001', name: 'Acme Corp',    outstanding_balance: 0, tenant_id: TENANT_ID, deleted_at: null },
  { id: 'CLI-002', name: 'Beta Ltd',     outstanding_balance: 500, tenant_id: TENANT_ID, deleted_at: null },
];

export const MOCK_SUPPLIER = { id: 'SUP-001', name: 'Supplier X', tenant_id: TENANT_ID };

export const MOCK_INVENTORY_BALANCES = [
  { product_id: 'PROD-001', location_id: '00000000-0000-0000-0000-000000000001', quantity: 75, tenant_id: TENANT_ID }
];

// ─── Auth session injected into localStorage ──────────────────────────────────

const FAKE_SESSION = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: USER_ID,
    email: 'owner@test.com',
    role: 'authenticated',
    aud: 'authenticated',
  },
};

const FAKE_STAFF_SESSION = {
  access_token: 'fake-staff-token',
  refresh_token: 'fake-staff-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: MOCK_STAFF_USER.id,
    email: 'staff@test.com',
    role: 'authenticated',
    aud: 'authenticated',
  },
};

/**
 * Inject a pre-authenticated session so tests skip the login page.
 * The key MUST match the `storageKey` set in src/lib/supabase.js.
 * Call this in beforeEach for tests that start already logged in.
 */
export async function injectAuthSession(page, isStaff = false) {
  await page.addInitScript(({ session, key }) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, {
    session: isStaff ? FAKE_STAFF_SESSION : FAKE_SESSION,
    key: 'sm-auth-token', // matches storageKey in src/lib/supabase.js
  });
}

// ─── Route interceptors ───────────────────────────────────────────────────────

/**
 * Pre-seed the app's localStorage cache (`ledgr_*` keys) with fixture data.
 *
 * `initializeApp` reads from cache BEFORE checking currentTenantId, so seeding
 * bypasses the React-state timing race where `setCurrentTenant` hasn't applied
 * yet when `initializeApp` runs (which normally triggers the fail-closed guard
 * and returns empty state).
 *
 * Must be called before page.goto() — it registers an addInitScript that runs
 * before any page scripts execute.
 */
export async function seedAppCache(page, isStaff = false) {
  const CACHE_TTL = Date.now() + 3_600_000; // 1 hour
  const entry = (data) => JSON.stringify({ data, expiry: CACHE_TTL });

  await page.addInitScript(({ entries, versionKey, version }) => {
    try {
      localStorage.setItem(versionKey, version);
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(key, value);
      }
    } catch {
      // private browsing — silently skip
    }
  }, {
    versionKey: 'ledgr_cache_version',
    version: 'v2',
    entries: {
      'ledgr_products':         entry(MOCK_PRODUCTS),
      'ledgr_clients':          entry(MOCK_CLIENTS),
      'ledgr_sales':            entry([]),
      'ledgr_expenses':         entry([]),
      'ledgr_users':            entry([isStaff ? MOCK_STAFF_USER : MOCK_USER]),
      'ledgr_employees':        entry([]),
      'ledgr_payroll':          entry([]),
      'ledgr_business_profile': entry({ id: 'BP-1', name: 'Test Co', currency: 'USD', currencySymbol: '$', tenant_id: TENANT_ID }),
      'ledgr_day_book':         entry([]),
      'ledgr_client_payments':  entry([]),
      'ledgr_vehicles':         entry([]),
      'ledgr_routes':           entry([]),
      'ledgr_purchases':        entry([]),
      'ledgr_suppliers':        entry([MOCK_SUPPLIER]),
      'ledgr_movement_log':     entry([]),
      'ledgr_inventory_balances': entry(MOCK_INVENTORY_BALANCES),
      'ledgr_invoices':         entry([]),
    },
  });
}

/**
 * Set up all Supabase network mocks on the given page.
 * Intercepts Auth, REST data, and RPC endpoints.
 */
export async function setupMocks(page, isStaff = false) {
  const base = SUPABASE_URL;

  // 1. Auth — sign-in (password grant)
  await page.route(`${base}/auth/v1/token*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isStaff ? FAKE_STAFF_SESSION : FAKE_SESSION),
    });
  });

  // 2. Auth — session refresh
  await page.route(`${base}/auth/v1/user`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isStaff ? FAKE_STAFF_SESSION.user : FAKE_SESSION.user),
    });
  });

  // 3. RPC calls — process_sale, process_purchase, log_audit_event, etc.
  await page.route(`${base}/rest/v1/rpc/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
    });
  });

  // 4. REST — table-specific responses (order matters: specific before catch-all)
  const tableFixtures = {
    users:               [MOCK_USER],
    tenants:             [MOCK_TENANT],
    products:            MOCK_PRODUCTS,
    product_categories:  [],
    clients:             MOCK_CLIENTS,
    sales:               [],
    expenses:            [],
    employees:           [],
    payroll:             [],
    business_profile:    [{ id: 'BP-1', name: 'Test Co', currency: 'USD', currencySymbol: '$', tenant_id: TENANT_ID }],
    day_book:            [],
    settings:            [],
    client_payments:     [],
    vehicles:            [],
    movement_log:        [],
    routes:              [],
    inventory_locations: [],
    inventory_balances:  MOCK_INVENTORY_BALANCES,
    purchases:           [],
    invoices:            [],
    audit_log:           [],
    suppliers:           [MOCK_SUPPLIER],
  };

  for (const [table, data] of Object.entries(tableFixtures)) {
    await page.route(`${base}/rest/v1/${table}*`, async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      
      // DEBUG: console.log(`[MOCK] ${method} -> ${table}`);

      // POST / PATCH / DELETE → acknowledge without body
      if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      // GET → return fixture array (or single object for business_profile maybeSingle)
      const isSingle = url.includes('limit=1') || table === 'business_profile';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isSingle && Array.isArray(data) ? (data[0] ?? null) : data),
      });
    });
  }
}
