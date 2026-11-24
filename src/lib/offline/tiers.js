/**
 * What the till keeps locally, and what it does not.
 * ==========================================================================
 *
 * SYNCED_TABLES in syncEngine.js is forty tables and means "download
 * everything". That is affordable for a shop with 151 products. It is not for
 * a supermarket: the catalogue alone is 10,000-50,000 rows, the ledger is
 * unbounded, and a first sync that pulls all forty before the till can sell
 * anything is a counter standing idle.
 *
 * So the forty are split by what the counter actually needs:
 *
 *   POS_CRITICAL   Billing must work with no network at all. Complete, always.
 *   CACHED_WINDOW  Useful at the till, but only recently. A window, not a table.
 *   ONLINE_ONLY    Never cached. The screens that read these say so.
 *
 * ONLINE_ONLY is the one worth arguing about, so the reasoning is per table
 * below rather than in a blanket sentence. The rule it follows: a table is
 * online-only when a STALE answer would be worse than no answer. A ledger that
 * is three hours out of date does not look stale, it looks wrong, and someone
 * reconciles against it.
 *
 * A test asserts every table is in exactly one tier, so adding one to
 * SYNCED_TABLES without deciding what it is for fails rather than silently
 * inheriting "download everything".
 */

/**
 * Complete offline. Billing cannot happen without these.
 *
 * product_batches is pulled with qty_remaining > 0 only: exhausted batches are
 * history, and FEFO only ever looks at what is left.
 */
export const POS_CRITICAL = [
  'products',
  'product_categories',
  'clients',
  'inventory_locations',
  'inventory_balances',
  'product_batches',
  'business_profile',
  'users',
  'accounts',
];

/**
 * Recent slice only. The window itself is a separate decision from the tier --
 * see WINDOW_DAYS -- because the right number comes from a measured cold start,
 * not from taste.
 */
export const CACHED_WINDOW = [
  'sales',
  'sales_returns',
  'invoices',
  'client_payments',
  'day_book',
  'expenses',
  'purchases',
  'purchase_returns',
  'supplier_payments',
  'suppliers',
  'estimates',
  'orders',
  'routes',
  'route_stops',
  'vehicles',
  'employees',
  'price_lists',
];

/**
 * Never cached, each for its own reason.
 *
 *   account_transactions   The ledger. Every balance is a sum over it, so a
 *   gl_lines               partial copy produces a confident wrong number
 *   gl_journals            rather than a visibly short list. Already the worst
 *                          offender: it was being read whole-table, unbounded.
 *   movement_log           Append-only audit trail, read backwards, never at
 *                          the till.
 *   sale_batch_consumption Derived from a sale; the sale is cached, this is
 *                          reconstructible and large.
 *   payroll, attendance    Monthly, not operational. Caching salary data on a
 *                          shop-floor machine is a liability, not a feature.
 *   bom*, production_*     Manufacturing runs on its own screen with a
 *                          connection; nothing on the billing path reads it.
 */
export const ONLINE_ONLY = [
  'account_transactions',
  'gl_lines',
  'gl_journals',
  'movement_log',
  'sale_batch_consumption',
  'payroll',
  'attendance',
  'bom',
  'bom_components',
  'production_orders',
  'production_order_materials',
  'production_costs',
];

/**
 * How much history the till keeps, per table.
 *
 * Deliberately small and deliberately a constant rather than a hardcoded date
 * in a query: the plan's answer to "how much history" was "whatever the cold
 * start can afford", and that is a number to be measured against a 50k seed
 * and then set here, in one place, rather than discovered across six queries.
 */
export const WINDOW_DAYS = {
  sales: 7,
  sales_returns: 90,
  invoices: 90,
  client_payments: 90,
  day_book: 60,
  expenses: 30,
  purchases: 30,
  purchase_returns: 90,
  supplier_payments: 90,
};

/** 'critical' | 'window' | 'online' | null when the table is unknown. */
export function tierOf(table) {
  if (POS_CRITICAL.includes(table)) return 'critical';
  if (CACHED_WINDOW.includes(table)) return 'window';
  if (ONLINE_ONLY.includes(table)) return 'online';
  return null;
}

/** Everything that gets a local copy, critical first — that is the pull order. */
export const CACHED_TABLES = [...POS_CRITICAL, ...CACHED_WINDOW];

/** True when the table may be read from the cache at all. */
export const isCached = (table) => tierOf(table) === 'critical' || tierOf(table) === 'window';
