/**
 * Reports view rules (web redesign, approved mockups reports-01 to 29).
 *
 * Presentation only. Nothing here computes a figure a report shows: the
 * catalogue is the list of reports the hub offered before the redesign (same
 * ids, groups, labels and permissions), and the table helpers are the search,
 * sort and paging ReportTable did inline, moved here unchanged so they can be
 * tested.
 */

export const REPORT_GROUPS = [
  { key: 'OPERATIONAL', label: 'Operations' },
  { key: 'ACCOUNTING', label: 'Accounting' },
  { key: 'COMPLIANCE', label: 'GST' },
];

/** Every report, in the order the hub listed them. `blurb` is the line the
 *  home cards carry (reports-03). */
export const REPORT_CATALOGUE = [
  // Operations
  { id: 'BUSINESS', group: 'OPERATIONAL', label: 'Business Report', blurb: 'Did we make money, sales, cash position', permission: 'sales' },
  { id: 'DAILY_SALES', group: 'OPERATIONAL', label: 'Daily Sales', blurb: 'Every bill by day, with filters', permission: 'sales' },
  { id: 'INVENTORY', group: 'OPERATIONAL', label: 'Inventory', blurb: 'Stock value, dead and idle stock', permission: 'inventory' },
  { id: 'PROFITABILITY', group: 'OPERATIONAL', label: 'Product Margins', blurb: 'Margin per item, loss makers', permission: 'inventory' },
  { id: 'LOGISTICS', group: 'OPERATIONAL', label: 'Deliveries', blurb: 'Vehicles and territories', permission: 'inventory' },
  { id: 'HR', group: 'OPERATIONAL', label: 'Staff & Payroll', blurb: 'Staff, salaries, pay runs', permission: 'reports' },
  { id: 'CLIENTS', group: 'OPERATIONAL', label: 'Clients', blurb: 'Outstanding and credit use', permission: 'clients' },
  { id: 'EXPENSES', group: 'OPERATIONAL', label: 'Expenses', blurb: 'Spending by category', permission: 'expenses' },
  { id: 'CLIENT_STATEMENT', group: 'OPERATIONAL', label: 'Client Statement', blurb: 'One client, bills and payments', permission: 'clients' },
  { id: 'BILL_PROFIT', group: 'OPERATIONAL', label: 'Bill Profit', blurb: 'Profit on every bill', permission: 'sales' },
  { id: 'LOW_STOCK', group: 'OPERATIONAL', label: 'Low Stock', blurb: 'Items at or below reorder level', permission: 'inventory' },
  { id: 'EXPIRY', group: 'OPERATIONAL', label: 'Expiry Tracking', blurb: 'Batches near expiry, write off', permission: 'inventory' },
  { id: 'UNVERIFIED_COST', group: 'OPERATIONAL', label: 'Unverified Cost', blurb: 'Stock whose cost nobody confirmed', permission: 'inventory' },
  { id: 'IMEI_SERIAL', group: 'OPERATIONAL', label: 'IMEI / Serial', blurb: 'Serial numbers sold', permission: 'inventory' },
  { id: 'SALES_BY_PARTY', group: 'OPERATIONAL', label: 'Sales by Party', blurb: 'Sales and purchases per party', permission: 'sales' },
  { id: 'PARTY_PROFIT', group: 'OPERATIONAL', label: 'Party Profit', blurb: 'Profit per customer', permission: 'reports' },
  { id: 'CATEGORY_PROFIT', group: 'OPERATIONAL', label: 'Category Profit', blurb: 'Profit per category', permission: 'inventory' },
  { id: 'ALL_TRANSACTIONS', group: 'OPERATIONAL', label: 'All Transactions', blurb: 'Every rupee in and out', permission: 'reports' },
  { id: 'ITEM_PARTY', group: 'OPERATIONAL', label: 'Item × Party', blurb: 'Who buys what', permission: 'sales' },
  { id: 'PRODUCT_SALES', group: 'OPERATIONAL', label: 'Product Sales', blurb: 'One item, buyers and trend', permission: 'sales' },
  { id: 'PRODUCT_MOVEMENT', group: 'OPERATIONAL', label: 'Fast / Slow Movers', blurb: 'What sells, what sits', permission: 'inventory' },
  { id: 'PURCHASES', group: 'OPERATIONAL', label: 'Purchases', blurb: 'Bought by supplier and item', permission: 'purchases' },
  // Accounting
  { id: 'BALANCE_SHEET', group: 'ACCOUNTING', label: 'Balance Sheet', blurb: 'Assets, liabilities, equity', permission: 'reports' },
  { id: 'TRIAL_BALANCE', group: 'ACCOUNTING', label: 'Trial Balance', blurb: 'Debits and credits by account', permission: 'reports' },
  { id: 'GENERAL_LEDGER', group: 'ACCOUNTING', label: 'General Ledger', blurb: 'Every journal entry', permission: 'reports' },
  { id: 'CASH_FLOW', group: 'ACCOUNTING', label: 'Cash Flow', blurb: 'Operating, investing, financing', permission: 'reports' },
  { id: 'AR_AGING', group: 'ACCOUNTING', label: 'Customer Aging', blurb: 'What customers owe, by age', permission: 'clients' },
  { id: 'AP_AGING', group: 'ACCOUNTING', label: 'Supplier Aging', blurb: 'What you owe, by age', permission: 'inventory' },
  { id: 'BUDGET_ACTUAL', group: 'ACCOUNTING', label: 'Budget vs Actual', blurb: 'Plan against what happened', permission: 'reports' },
  { id: 'YOY', group: 'ACCOUNTING', label: 'Year Comparison', blurb: 'This year against last', permission: 'reports' },
  { id: 'FINANCIALS', group: 'ACCOUNTING', label: 'Profit & Loss', blurb: 'Revenue, costs, net profit', permission: 'reports' },
  // GST
  { id: 'GSTR1', group: 'COMPLIANCE', label: 'GSTR-1', blurb: 'Outward supplies, HSN, documents', permission: 'reports' },
  { id: 'GSTR3B', group: 'COMPLIANCE', label: 'GSTR-3B', blurb: 'Monthly summary, set-off, ITC ledger', permission: 'reports' },
  { id: 'PURCHASE_REGISTER', group: 'COMPLIANCE', label: 'Purchase Register', blurb: 'Bills with GST for ITC', permission: 'reports' },
  { id: 'GSTR2B_RECON', group: 'COMPLIANCE', label: 'GSTR-2B Reconciliation', blurb: 'Match the portal 2B to your bills', permission: 'reports' },
];

/** The reports this person may open (the same `view` check as before). */
export function visibleReports(hasPermission, catalogue = REPORT_CATALOGUE) {
  const can = typeof hasPermission === 'function' ? hasPermission : () => true;
  return catalogue.filter((r) => can(r.permission, 'view'));
}

/** { OPERATIONAL: [...], ACCOUNTING: [...], COMPLIANCE: [...] } */
export function groupReports(reports) {
  const groups = { OPERATIONAL: [], ACCOUNTING: [], COMPLIANCE: [] };
  (reports || []).forEach((r) => { if (groups[r.group]) groups[r.group].push(r); });
  return groups;
}

/** The group chips: only groups with at least one report, with their count. */
export function groupChips(grouped) {
  return REPORT_GROUPS
    .map((g) => ({ key: g.key, label: g.label, count: (grouped?.[g.key] || []).length }))
    .filter((g) => g.count > 0);
}

export const groupLabel = (key) => REPORT_GROUPS.find((g) => g.key === key)?.label || '';

/** The picker's search, as before: label contains the text, any case. */
export function matchReports(reports, query) {
  const q = String(query || '').toLowerCase();
  return (reports || []).filter((r) => r.label.toLowerCase().includes(q));
}

/** The home page's search (new): label or the card's line. */
export function searchCatalogue(reports, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return reports || [];
  return (reports || []).filter((r) =>
    r.label.toLowerCase().includes(q) || String(r.blurb || '').toLowerCase().includes(q));
}

/** A ?tab= link resolves only to a report this person can open. */
export const findReport = (reports, id) => (reports || []).find((r) => r.id === id) || null;

/**
 * The message a failed load shows. Takes any number of hook errors (string,
 * Error or Supabase error object) and returns the first, or null when none
 * failed. A report with a message renders its error state instead of figures,
 * so a failed load never reads as ₹0.
 */
export function loadError(...errors) {
  for (const e of errors.flat()) {
    if (!e) continue;
    if (typeof e === 'string') return e;
    if (e.message) return String(e.message);
    return 'Could not load this report';
  }
  return null;
}

/* ── Figures on KPI cards (moved from PremiumReportView, unchanged) ───────── */

const MONEY_RE = /value|revenue|profit|capital|payroll|disburs|outstanding|magnitude|burn|salary|\brev\b|balance|amount|spend|yield|cost/i;

export const formatCompact = (val, formatCurrency) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
  return formatCurrency(val);
};

export const kpiDisplay = (label, value, formatCurrency) => {
  if (typeof value !== 'number') return value;
  return MONEY_RE.test(label || '') ? formatCompact(value, formatCurrency) : value.toLocaleString('en-IN');
};

/* ── Table search / sort / paging (moved from ReportTable, unchanged) ─────── */

export function filterRows(data, search) {
  if (!search) return data;
  const lower = search.toLowerCase();
  return data.filter((row) => Object.values(row).some((val) => String(val).toLowerCase().includes(lower)));
}

export function sortRows(rows, sortKey, sortDir) {
  if (!sortKey || !sortDir) return rows;
  return [...rows].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal === bVal) return 0;
    const res = aVal > bVal ? 1 : -1;
    return sortDir === 'asc' ? res : -res;
  });
}

/** Clicking a sortable head: asc → desc → off. Returns { key, dir }. */
export function nextSort({ key, dir }, clicked) {
  if (key === clicked) {
    if (dir === 'asc') return { key, dir: 'desc' };
    if (dir === 'desc') return { key: '', dir: null };
    return { key, dir: 'asc' };
  }
  return { key: clicked, dir: 'asc' };
}

export function pageRows(rows, page, pageSize) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export const pageCount = (n, pageSize) => Math.ceil(n / pageSize);

/** "25 of 1,946 records" under a table, as drawn. */
export function recordsLine(shown, total, noun = 'records') {
  const f = (n) => Number(n || 0).toLocaleString('en-IN');
  return `${f(shown)} of ${f(total)} ${noun}`;
}
