/**
 * What the Suppliers page shows, worked out in one place (web redesign,
 * approved mockups suppliers-01 … 14).
 *
 * Nothing here is a new money rule:
 *   · what a supplier is owed is lib/supplierOwed.js, the same function the
 *     Dashboard reads, unchanged;
 *   · when a bill falls due is the Purchases register's rule (decorateBills in
 *     pages/purchases/lib/register.js: a credit bill falls due after its terms,
 *     else the supplier's credit days, else 30; a cash bill on the bill date);
 *   · the tiles are the figures the page showed before the redesign, moved
 *     here so they are tested.
 *
 * Every figure keeps the source it had. The list's "You owe" and the due-date
 * bar can differ (the bar adds up unpaid BILLS, the list takes advances off);
 * when they do the screen says so rather than pick one.
 *
 * Pure functions, no React. `today` is 'YYYY-MM-DD' in the shop's time zone.
 */
import { owedBySupplier, purchaseTotal, purchasePaid } from './supplierOwed';
import { groupPurchasesIntoBills } from './bills';
import { decorateBills, daysBetween, fmtDate } from '../pages/purchases/lib/register';

const DAY = 86400000;
const daysSince = (d, now = Date.now()) => (d ? Math.floor((now - new Date(d).getTime()) / DAY) : null);

/** A purchase or bill belongs to a supplier by id, or by name on older rows. */
const matches = (s, p) => s.id === p.supplier_id || s.name === p.supplier_name;

/**
 * Every bill (one per physical bill, as the ledger and Purchases group them)
 * with the register's due date and state, and the supplier it belongs to.
 */
export function decoratedSupplierBills({ suppliers = [], purchases = [], payments = [], today }) {
  const bills = decorateBills(groupPurchasesIntoBills(purchases || []), {
    suppliers: suppliers || [], payments: payments || [], today,
  });
  return bills.map((b) => {
    const sup = (suppliers || []).find((s) => matches(s, b)) || null;
    return { ...b, supplierKey: sup?.id || null };
  });
}

/** An unpaid bill: owing something and not cancelled. */
export const isOpenBill = (b) => b.state !== 'paid' && b.state !== 'cancelled';

/**
 * The status pill a bill carries, in the Purchases register's words:
 * Overdue 9d (red), Part paid (amber), Due in 6d (grey), Paid (green).
 */
export function billPill(b) {
  if (!b) return null;
  if (b.state === 'cancelled') return { tone: 'neutral', text: 'Cancelled' };
  if (b.state === 'paid') return { tone: 'good', text: 'Paid' };
  if (b.state === 'over') return { tone: 'bad', text: `Overdue ${-b.dleft}d` };
  if (b.state === 'part') return { tone: 'warn', text: 'Part paid' };
  if (b.dleft === 0) return { tone: 'neutral', text: 'Due today' };
  return { tone: 'neutral', text: `Due in ${b.dleft}d` };
}

/**
 * The due-date bar over the list: unpaid bills banded the way the Purchases
 * register bands them -- Overdue, Due in 7 days, Due later. Only bills of
 * suppliers on the list count.
 */
export function dueBands(bills = []) {
  const out = {
    over: { amount: 0, count: 0 },
    week: { amount: 0, count: 0 },
    later: { amount: 0, count: 0 },
    total: 0,
  };
  for (const b of bills) {
    if (!b.supplierKey || !isOpenBill(b)) continue;
    const band = b.state === 'over' ? out.over : b.dleft <= 7 ? out.week : out.later;
    band.amount += b.due;
    band.count += 1;
    out.total += b.due;
  }
  for (const k of ['over', 'week', 'later']) out[k].amount = Math.round(out[k].amount * 100) / 100;
  out.total = Math.round(out.total * 100) / 100;
  return out;
}

/**
 * One supplier's due picture: the oldest unpaid bill and its pill, how many
 * bills are unpaid, and whether any is overdue.
 */
export function supplierDue(bills = []) {
  const open = bills.filter(isOpenBill).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const oldest = open[0] || null;
  const overdue = open.filter((b) => b.state === 'over');
  const worst = overdue.reduce((w, b) => (!w || b.dleft < w.dleft ? b : w), null);
  return {
    open,
    oldest,
    unpaidCount: open.length,
    overdue: overdue.length > 0,
    // The header pill names the most overdue bill; otherwise the oldest one.
    pill: billPill(worst || oldest),
  };
}

/**
 * The list rows. The figures are the ones the page showed before the
 * redesign, from the same rows and the same rule:
 *   _payable   what the list says is owed (lib/supplierOwed.js)
 *   _advance   overpaid money sitting with the supplier
 *   billCount  purchase ROWS (one per product), as before -- see the report
 *   lastBill / oldestUnpaid  dates over purchase rows, as before
 * plus, read-only, the register's due state (`due`) for the new column.
 */
export function supplierRows({ suppliers = [], purchases = [], supplierPayments = [], decorated = [] }) {
  const by = {};
  (suppliers || []).forEach((s) => {
    by[s.id] = { bills: [], payments: [], payable: 0, advance: 0, billCount: 0, lastBill: null, lastBillNo: null, oldestUnpaid: null, purchased: 0, decorated: [] };
  });

  (purchases || []).forEach((p) => {
    const sup = (suppliers || []).find((s) => matches(s, p));
    if (!sup) return;
    const f = by[sup.id];
    const total = purchaseTotal(p);
    const due = Math.max(0, total - purchasePaid(p));
    f.bills.push({ ...p, _total: total, _due: due });
    f.billCount += 1;
    f.purchased += total;
    if (!f.lastBill || String(p.date) > String(f.lastBill)) { f.lastBill = p.date; f.lastBillNo = p.bill_no || null; }
    if (due > 0.01 && (!f.oldestUnpaid || String(p.date) < String(f.oldestUnpaid))) f.oldestUnpaid = p.date;
  });

  (supplierPayments || []).forEach((pay) => {
    const f = by[pay.supplier_id];
    if (f) f.payments.push(pay);
  });

  (decorated || []).forEach((b) => { if (b.supplierKey && by[b.supplierKey]) by[b.supplierKey].decorated.push(b); });

  const owed = owedBySupplier(suppliers, purchases);
  owed.forEach((o, id) => { if (by[id]) { by[id].payable = o.payable; by[id].advance = o.advance; } });

  Object.values(by).forEach((f) => {
    f.bills.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    f.payments.sort((a, b) => String(b.date ?? b.created_at).localeCompare(String(a.date ?? a.created_at)));
  });

  return (suppliers || []).map((s) => {
    const f = by[s.id];
    return {
      ...s,
      _f: f,
      _advance: f.advance || 0,
      _payable: Math.max(0, (f.payable || 0) - (f.advance || 0)),
      _due: supplierDue(f.decorated),
    };
  });
}

export const FILTERS = [
  { key: 'OWING', label: 'Owing' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'ALL', label: 'All' },
];

const inFilter = (r, filter) => {
  if (filter === 'OWING') return r._payable > 0.01;
  if (filter === 'OVERDUE') return r._due.overdue;
  return true;
};

/** Counts for the filter pills (before search). */
export const filterCounts = (rows = []) => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => inFilter(r, f.key)).length]));

/** Filter, search (name, contact, phone, GSTIN) and the fixed order: most owed first. */
export function visibleRows(rows = [], { filter = 'OWING', q = '' } = {}) {
  const term = String(q || '').trim().toLowerCase();
  return rows
    .filter((r) => inFilter(r, filter))
    .filter((r) => !term || [r.name, r.contact_person, r.phone, r.gstin].some((v) => String(v || '').toLowerCase().includes(term)))
    .sort((a, b) => b._payable - a._payable);
}

/** The four tiles, exactly as the page worked them out before. */
export function supplierKpis({ rows = [], suppliers = [], purchases = [], supplierPayments = [], now = new Date() }) {
  let payable = 0, owing = 0, advance = 0;
  rows.forEach((r) => {
    payable += r._payable;
    advance += r._advance || 0;
    if (r._payable > 0.01) owing += 1;
  });

  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const paidThisMonth = (supplierPayments || [])
    .filter((p) => new Date(p.date ?? p.created_at) >= monthStart)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const purchasedThisMonth = (purchases || [])
    .filter((p) => new Date(p.date) >= monthStart)
    .reduce((s, p) => s + purchaseTotal(p), 0);
  const billsThisMonth = (purchases || []).filter((p) => new Date(p.date) >= monthStart).length;

  let oldest = null, oldestName = '', oldestDate = null;
  rows.forEach((r) => {
    const age = daysSince(r._f?.oldestUnpaid, now.getTime());
    if (age != null && (oldest == null || age > oldest)) { oldest = age; oldestName = r.name; oldestDate = r._f.oldestUnpaid; }
  });

  return {
    payable, owing, advance, supplierCount: (suppliers || []).length,
    paidThisMonth, paymentsRecorded: (supplierPayments || []).length,
    purchasedThisMonth, billsThisMonth, oldest, oldestName, oldestDate,
  };
}

/** "18 Nov" -- the register's short date. */
export const shortDay = (d) => (d ? fmtDate(d, { year: false }) : '—');

/** Days from `today` to a 'YYYY-MM-DD' date; negative when past. */
export const daysUntil = (d, today) => daysBetween(d, today);

/** Two initials for an avatar ("Demo Kirana Store" -> "DK"). */
export function initialsOf(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '–';
  return (w[0][0] + (w[1]?.[0] || '')).toUpperCase();
}

/** A GSTIN is 15 characters, as the bulk import checks. Empty is allowed. */
export const gstinError = (v) => {
  const s = String(v || '').trim();
  return !s || s.length === 15 ? null : 'Must be 15 characters';
};
