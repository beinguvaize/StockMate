import { isNonCashMethod } from './dayBook';

/**
 * The All Transactions report's rows (components/reports/AllTransactionsReport.jsx).
 *
 * dir is 'in' or 'out' for money that moved, and 'none' for an expense that
 * moved no money (method ADVANCE: pay kept against a staff advance or an
 * advance written off; method ADJUSTMENT: a stock write-off). Those stay in the
 * list as expenses but out of Money In / Money Out. Staff advances given and
 * paid back (account_transactions ref STAFF_ADVANCE) are money that moved with
 * no expense row, so they are listed as their own rows.
 */
export function allTransactionRows({ sales = [], payments = [], purchases = [], expenses = [], advances = [], clientMap = {} } = {}) {
  const rows = [];
  for (const s of sales || []) {
    const cid = s.customerInfo?.id || s.shopId || null;
    rows.push({ date: s.date || '', type: 'Sale', party: (cid && clientMap[cid]) || s.customerInfo?.name || 'Walk-in',
      dir: 'in', amount: Number(s.totalAmount || 0), ref: (s.id || '').toUpperCase() });
  }
  for (const p of payments || []) {
    rows.push({ date: p.date || '', type: 'Payment', party: (p.client_id && clientMap[p.client_id]) || 'Client',
      dir: 'in', amount: Number(p.amount || 0), ref: `PMT-${(p.id || '').slice(0, 8).toUpperCase()}` });
  }
  for (const p of purchases || []) {
    rows.push({ date: p.date || '', type: 'Purchase', party: p.supplier_name || 'Supplier',
      dir: 'out', amount: Number(p.total_amount || 0), ref: `PUR-${(p.id || '').slice(0, 8).toUpperCase()}` });
  }
  for (const e of expenses || []) {
    const noCash = isNonCashMethod(e.payment_method ?? e.paymentMethod);
    rows.push({ date: e.date || '', type: 'Expense', party: e.description || e.note || e.category || 'Expense',
      dir: noCash ? 'none' : 'out', amount: Number(e.amount || 0), ref: `EXP-${(e.id || '').slice(0, 8).toUpperCase()}` });
  }
  for (const t of advances || []) {
    if (String(t?.ref_type || '').toUpperCase() !== 'STAFF_ADVANCE') continue;
    const inn = String(t.direction || '').toUpperCase() === 'IN';
    rows.push({ date: String(t.date || '').slice(0, 10), type: 'Staff advance', party: t.note || (inn ? 'Staff advance paid back' : 'Staff advance given'),
      dir: inn ? 'in' : 'out', amount: Number(t.amount || 0), ref: `ADV-${String(t.ref_id || t.id || '').slice(0, 8).toUpperCase()}` });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
  return rows;
}

/** Money In / Money Out / net over rows: 'none' rows count in neither. */
export function moneyTotals(rows = []) {
  const totalIn = rows.filter((r) => r.dir === 'in').reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.dir === 'out').reduce((s, r) => s + r.amount, 0);
  return { totalIn, totalOut, net: totalIn - totalOut, count: rows.length };
}
