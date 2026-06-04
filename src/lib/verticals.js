// ─────────────────────────────────────────────────────────────────────────
// Vertical foundation (Stage A)
//
// One platform, many verticals. A tenant's `business_type` selects a default
// module set + a terminology map. `tenant.modules` (jsonb) is a per-tenant
// override layer on top of the defaults. Everything vertical-aware reads from
// here — nav gating, terminology, registration. Add a vertical = add an entry,
// not a rewrite.
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
    appointments: false, service_catalog: false,
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
    appointments: false, service_catalog: false,
  },
  SERVICES: {
    inventory: false,
    manufacturing: false,
    vehicles: false,
    orders: false,
    pos: true,             // counter billing still useful
    payroll: true,
    tables: false, kot: false, modifiers: false, recipe_deduct: false, channels: false,
    // services features
    appointments: true, service_catalog: true,
  },
};

// Terminology — only the labels that differ per vertical. Anything not
// overridden falls back to the RETAIL/base word.
const BASE_TERMS = {
  product: 'Product', products: 'Products',
  inventory: 'Inventory',
  customer: 'Customer', customers: 'Customers',
  sale: 'Sale', sales: 'Sales',
  catalog: 'Catalog',
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
