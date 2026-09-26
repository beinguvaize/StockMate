// ─────────────────────────────────────────────────────────────────────────
// Vertical foundation (Stage A)
//
// One platform, many verticals. A tenant's `business_type` selects a default
// module set + a terminology map. `tenant.modules` (jsonb) is a per-tenant
// override layer on top of the defaults. Everything vertical-aware reads from
// here — nav gating, terminology, registration. Add a vertical = add an entry,
// not a rewrite.
//
// THIS AXIS IS CLIENT-SIDE, DELIBERATELY. The database enforces the PLAN axis
// (has_module_access + the plan_gate_* RLS policies) because a plan is an
// entitlement: letting a Free tenant reach Enterprise data would be a billing
// hole. A vertical toggle is not an entitlement, it is a preference about which
// parts of a paid-for product a shop wants to see. A restaurant that flips
// `vehicles` on is not stealing anything.
//
// So: never put anything behind a vertical toggle that must not be reached.
// Use the plan axis for that. This one decides what is SHOWN.
// ─────────────────────────────────────────────────────────────────────────

export const BUSINESS_TYPES = ['RETAIL', 'RESTAURANT', 'SERVICES'];

// Industry picker metadata (registration / onboarding).
export const VERTICAL_META = {
  RETAIL:     { label: 'Retail / Distribution', tagline: 'Shops, wholesale, B2B & B2C', icon: 'Store' },
  RESTAURANT: { label: 'Restaurant / Food',     tagline: 'Dine-in, takeaway, delivery',  icon: 'UtensilsCrossed' },
  SERVICES:   { label: 'Professional Services',  tagline: 'Appointments & service billing', icon: 'Briefcase' },
};

// Module keys gate nav, routes and POS mode. Keep these stable — they are the
// vocabulary the rest of the app checks against.
//   Shared spine (always on, every vertical): dashboard, clients, sales,
//   invoices, expenses, reports, suppliers, purchases, daybook, settings, users.
//   The map below only lists the *vertical-specific* toggles; spine modules are
//   implied true and never gated.
export const DEFAULT_MODULES = {
  RETAIL: {
    inventory: true,
    orders: true,
    manufacturing: true,
    vehicles: true,        // van-sale / route
    pos: true,
    payroll: true,
    // restaurant-only
    tables: false, kot: false, modifiers: false, recipe_deduct: false, channels: false,
    // services-only
    appointments: false,
  },
  RESTAURANT: {
    inventory: true,       // ingredient stock
    manufacturing: true,   // recipes / BOM (food costing)
    pos: true,
    payroll: true,
    orders: false,
    vehicles: false,
    // restaurant features
    tables: true, kot: true, modifiers: true,
    recipe_deduct: true,   // R5 — BOM ingredients auto-deducted on dish sale
    channels: false,       // phase R7 — Swiggy/Zomato via middleware
    appointments: false,
  },
  SERVICES: {
    // The service catalog IS the inventory module, gated by `inventory` and
    // relabelled through TERMS below. A separate `service_catalog` flag used
    // to sit here declaring the same thing and gating nothing — no navItem
    // and no route ever asked for it. One switch, or the label and the
    // behaviour drift apart.
    inventory: true,       // = service catalog (no stock; relabelled)
    manufacturing: false,
    vehicles: false,
    orders: false,
    pos: true,             // counter billing
    payroll: true,
    tables: false, kot: false, modifiers: false, recipe_deduct: false, channels: false,
    // services features
    appointments: true,
  },
};

// What each toggle MEANS, for the screen that switches them. Without this the
// settings page would render raw keys like `recipe_deduct`, which is a database
// column name, not a sentence a shopkeeper can act on.
//
// `plan` names the plan module the feature ALSO needs, where the two axes
// overlap. Turning a vertical toggle on cannot buy you a feature your plan does
// not include, and the screen has to be able to say so rather than offering a
// switch that appears to do nothing.
export const MODULE_META = {
  inventory:     { label: 'Stock & catalog',      help: 'Products, stock levels and valuation.', plan: 'inventory' },
  pos:           { label: 'Counter billing',      help: 'The point-of-sale screen.',             plan: 'sales' },
  orders:        { label: 'Order pipeline',       help: 'Quote to order to delivery.',           plan: 'sales' },
  manufacturing: { label: 'Manufacturing',        help: 'Bills of materials and production.',    plan: 'manufacturing' },
  vehicles:      { label: 'Vehicles & routes',    help: 'Van sales and delivery routes.',        plan: 'vehicles' },
  payroll:       { label: 'Staff & payroll',      help: 'Employees, attendance and salary.',     plan: 'payroll' },
  appointments:  { label: 'Appointments',         help: 'Bookings against a service catalog.',   plan: 'appointments' },
  tables:        { label: 'Tables',               help: 'Floor plan and table-wise orders.',     plan: 'sales' },
  kot:           { label: 'Kitchen display',      help: 'Send tickets to the kitchen screen.',   plan: 'kds' },
  modifiers:     { label: 'Item modifiers',       help: 'Add-ons and options on a line.',        plan: 'inventory' },
  recipe_deduct: { label: 'Deduct ingredients',   help: 'Take recipe ingredients out of stock on sale.', plan: 'manufacturing' },
  channels:      { label: 'Delivery channels',    help: 'Aggregator orders. Not built yet.',     plan: 'sales' },
};

// The toggles a shop can actually change, in the order they should be shown.
// Driven off RETAIL because every vertical declares the same key set -- a fact
// verticals.test.js pins, because a key present for one vertical and missing
// for another reads as ENABLED, not disabled.
export const MODULE_KEYS = Object.keys(DEFAULT_MODULES.RETAIL);

/**
 * Reduce a desired module map to only what DIFFERS from the vertical's default.
 *
 * `tenants.modules` stores overrides, not a snapshot. Writing the whole
 * resolved map would freeze today's defaults into every tenant row: change
 * DEFAULT_MODULES later and nobody who had ever opened this screen would get
 * the change. Storing only genuine deviations keeps the defaults live.
 *
 * Unknown keys are dropped rather than carried, so a stale client cannot
 * persist a toggle this build no longer has.
 */
export function overridesFrom(businessType, desired = {}) {
  const defaults = DEFAULT_MODULES[normalizeType(businessType)];
  const out = {};
  for (const key of Object.keys(defaults)) {
    if (key in desired && !!desired[key] !== !!defaults[key]) out[key] = !!desired[key];
  }
  return out;
}

// Terminology — only the labels that differ per vertical. Anything not
// overridden falls back to the RETAIL/base word.
const BASE_TERMS = {
  product: 'Product', products: 'Products',
  inventory: 'Inventory',
  customer: 'Customer', customers: 'Customers',
  sale: 'Sale', sales: 'Sales',
  catalog: 'Catalog',
  recipe: 'Bill of Materials', recipes: 'Bills of Materials',
  build: 'Build',
};

export const TERMS = {
  RETAIL: { ...BASE_TERMS },
  RESTAURANT: {
    ...BASE_TERMS,
    product: 'Dish', products: 'Dishes',
    inventory: 'Menu',
    customer: 'Guest', customers: 'Guests',
    sale: 'Order', sales: 'Orders',
    catalog: 'Menu',
    recipe: 'Recipe', recipes: 'Recipes',
    build: 'Prep',
  },
  SERVICES: {
    ...BASE_TERMS,
    product: 'Service', products: 'Services',
    inventory: 'Service Catalog',
    sale: 'Booking', sales: 'Bookings',
    catalog: 'Service Catalog',
  },
};

// Normalize whatever the DB hands back to a known type.
export function normalizeType(businessType) {
  const t = String(businessType || 'RETAIL').toUpperCase();
  return BUSINESS_TYPES.includes(t) ? t : 'RETAIL';
}

// Effective modules = vertical defaults overlaid with the tenant's overrides.
export function resolveModules(tenant) {
  const type = normalizeType(tenant?.business_type);
  const overrides = (tenant && typeof tenant.modules === 'object' && tenant.modules) || {};
  return { ...DEFAULT_MODULES[type], ...overrides };
}

// Single module check. Unknown keys default to enabled (spine modules aren't
// listed in the map and must not be hidden).
export function isModuleEnabled(modules, key) {
  if (!modules || !(key in modules)) return true;
  return !!modules[key];
}

// Terminology lookup with graceful fallback.
export function term(businessType, key) {
  const type = normalizeType(businessType);
  return (TERMS[type] && TERMS[type][key]) || BASE_TERMS[key] || key;
}
