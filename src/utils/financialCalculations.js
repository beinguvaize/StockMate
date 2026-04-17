/**
 * financialCalculations.js
 * ------------------------
 * Shared utilities for accounting calculations used across reports.
 * Ensures consistent rounding, currency formatting, and date math.
 */

// Standard 2-decimal rounding for currency (avoids floating point drift)
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Indian Rupee currency formatter (2 decimals)
export const formatINR = (val) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(val || 0);

// Generic currency formatter with symbol support
export const formatCurrency = (val, symbol = '₹') => `${symbol}${round2(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Days between two dates
export const daysBetween = (dateStr, reference = new Date()) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ref = reference instanceof Date ? reference : new Date(reference);
  return Math.floor((ref.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
};

// Aging bucket classifier
// Returns one of: 'CURRENT', '1-30', '31-60', '61-90', '91-120', '120+'
export const getAgingBucket = (daysOverdue) => {
  if (daysOverdue === null || daysOverdue === undefined || daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  if (daysOverdue <= 120) return '91-120';
  return '120+';
};

// Aging buckets in display order
export const AGING_BUCKETS = ['CURRENT', '1-30', '31-60', '61-90', '91-120', '120+'];

export const AGING_BUCKET_COLORS = {
  'CURRENT': { bg: 'bg-emerald-50', text: 'text-emerald-600', chart: '#10b981' },
  '1-30': { bg: 'bg-sky-50', text: 'text-sky-600', chart: '#0ea5e9' },
  '31-60': { bg: 'bg-amber-50', text: 'text-amber-600', chart: '#f59e0b' },
  '61-90': { bg: 'bg-orange-50', text: 'text-orange-600', chart: '#f97316' },
  '91-120': { bg: 'bg-rose-50', text: 'text-rose-600', chart: '#e11d48' },
  '120+': { bg: 'bg-red-50', text: 'text-red-700', chart: '#b91c1c' },
};

// Chart of Accounts — standard classifications for ERP
export const ACCOUNT_TYPES = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
};

// Normal balance side per account type (used for trial balance)
export const NORMAL_BALANCE = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
};

// Default chart of accounts used when no GL table exists
// These are derived from operational tables (sales, expenses, payroll, clients, inventory)
export const DEFAULT_CHART_OF_ACCOUNTS = [
  // Assets
  { code: '1000', name: 'Cash & Bank', type: ACCOUNT_TYPES.ASSET, category: 'Current Assets' },
  { code: '1100', name: 'Accounts Receivable', type: ACCOUNT_TYPES.ASSET, category: 'Current Assets' },
  { code: '1200', name: 'Inventory', type: ACCOUNT_TYPES.ASSET, category: 'Current Assets' },
  { code: '1500', name: 'Fixed Assets (Vehicles)', type: ACCOUNT_TYPES.ASSET, category: 'Non-Current Assets' },
  // Liabilities
  { code: '2000', name: 'Accounts Payable', type: ACCOUNT_TYPES.LIABILITY, category: 'Current Liabilities' },
  { code: '2100', name: 'Accrued Payroll', type: ACCOUNT_TYPES.LIABILITY, category: 'Current Liabilities' },
  { code: '2200', name: 'Tax Payable (GST)', type: ACCOUNT_TYPES.LIABILITY, category: 'Current Liabilities' },
  // Equity
  { code: '3000', name: 'Owner Equity', type: ACCOUNT_TYPES.EQUITY, category: 'Equity' },
  { code: '3100', name: 'Retained Earnings', type: ACCOUNT_TYPES.EQUITY, category: 'Equity' },
  // Revenue
  { code: '4000', name: 'Sales Revenue', type: ACCOUNT_TYPES.REVENUE, category: 'Operating Revenue' },
  // Expenses
  { code: '5000', name: 'Cost of Goods Sold', type: ACCOUNT_TYPES.EXPENSE, category: 'Operating Expenses' },
  { code: '5100', name: 'Payroll Expense', type: ACCOUNT_TYPES.EXPENSE, category: 'Operating Expenses' },
  { code: '5200', name: 'Operating Expenses', type: ACCOUNT_TYPES.EXPENSE, category: 'Operating Expenses' },
  { code: '5300', name: 'Fleet & Logistics', type: ACCOUNT_TYPES.EXPENSE, category: 'Operating Expenses' },
];

// Compute GL balances from operational tables (virtual GL)
// Assumes clean operational data; in a real ERP this would be replaced by journal_entries table.
//
// computeVirtualLedger has been deprecated. Reports now fetch directly from 
// PostgreSQL via RPC (`get_gl_balances`) representing the immutable Double-Entry Ledger.
