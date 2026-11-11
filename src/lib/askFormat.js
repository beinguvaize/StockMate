/**
 * Draws the values in an ai-ask card. No figure is worked out here: the server
 * sends the numbers and the sentences, and this only formats them for a `kind`.
 */

const NUM = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const MONEY = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (n) => {
  const v = Number(n) || 0;
  return `${v < 0 ? '-' : ''}₹${MONEY.format(Math.abs(v))}`;
};

export const fill = (template, vars = {}) =>
  String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/** "18 Nov" or "18 नवंबर". Digits stay Western in both. */
export function dayMonth(iso, strings) {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return m ? `${d} ${strings.months_short[m - 1]}` : '';
}

export function formatValue(value, kind, strings) {
  if (value === null || value === undefined) return '—';
  switch (kind) {
    case 'money':   return money(value);
    case 'count':
    case 'qty':     return NUM.format(Number(value));
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'days':    return NUM.format(Number(value));
    case 'date':    return dayMonth(value, strings);
    default:        return String(value);    // an unknown kind draws as plain text
  }
}

/** The month a quota window covers: the one before it resets. */
export function usageVars(usage, strings) {
  const [, m] = String(usage?.resets_on ?? '').slice(0, 10).split('-').map(Number);
  if (!m) return { used: usage?.used, limit: usage?.limit, month: '', reset: '' };
  return {
    used: usage.used,
    limit: usage.limit,
    month: strings.months_long[(m + 10) % 12],
    reset: dayMonth(usage.resets_on, strings),
  };
}

// `dated` screens take the answer's period, so they open on the same dates and
// show the same number. The others show the present (stock, dues, balances).
const DATED = new Set(['reports_daily_sales', 'reports_financials', 'reports_product_sales', 'reports_gstr3b', 'reports_purchase_register']);
DATED.add('reports_expenses');
DATED.add('reports_business');
DATED.add('reports_sales_by_party');
// Payroll's Attendance tab opens on the month of the answer's dates.
DATED.add('payroll_attendance');
const ROUTES = {
  reports_daily_sales: '/reports?tab=DAILY_SALES',
  reports_financials: '/reports?tab=FINANCIALS',
  reports_product_sales: '/reports?tab=PRODUCT_SALES',
  reports_low_stock: '/reports?tab=LOW_STOCK',
  reports_expiry: '/reports?tab=EXPIRY',
  reports_inventory_dead: '/reports?tab=INVENTORY&sub=DEAD_STOCK',
  reports_gstr3b: '/reports?tab=GSTR3B',
  reports_purchase_register: '/reports?tab=PURCHASE_REGISTER',
  sales: '/sales',
  inventory: '/inventory',
  clients: '/clients',
  daybook: '/daybook',
  accounts: '/accounts',
  dashboard: '/dashboard',
  suppliers: '/suppliers',
  purchases: '/purchases',
  // Expenses report: opens on the answer's dates (useDateWindow takes the link).
  reports_expenses: '/reports?tab=EXPENSES',
  reports_customer_aging: '/reports?tab=AR_AGING',
  reports_business: '/reports?tab=BUSINESS',
  reports_sales_by_party: '/reports?tab=SALES_BY_PARTY',
  reports_product_movement: '/reports?tab=PRODUCT_MOVEMENT',
  payroll_attendance: '/payroll?tab=ATTENDANCE',
};

/** The route for a screen key, or null: an unknown key draws no link. */
export function screenPath(key, params) {
  const base = ROUTES[key];
  if (!base) return null;
  if (!DATED.has(key) || !params?.from || !params?.to) return base;
  return `${base}&from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`;
}

/** Splits text so money and percentages can be set in the number font. */
export const splitNumbers = (text) =>
  String(text ?? '').split(/(₹[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%)/g).map((part, i) => ({ part, number: i % 2 === 1 }));
