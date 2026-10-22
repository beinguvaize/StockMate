/**
 * The bill register's model: what each bill's state is, which tab it sits in,
 * how bills band together, and every total the screen shows.
 * ==========================================================================
 *
 * Bills come from groupPurchasesIntoBills (src/lib/bills.js) -- the one
 * definition of a bill -- over EVERY purchase row the app has loaded (the
 * hook pages all of them in). So every count and total here covers the whole
 * filtered set, not a page of it. "Load earlier" on the screen limits how many
 * rows are DRAWN; it never limits what is summed.
 *
 * Pure functions, no React. `today` is passed in as 'YYYY-MM-DD' so the rules
 * can be tested on any date.
 */

import { isCreditType } from '../../../lib/bills';

const DAY = 864e5;
export const HINT_PCT = 5;          // a price move that earns a hint on the collapsed row
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── dates, as 'YYYY-MM-DD' strings and UTC day numbers ──────────────────────

export const iso = (v) => String(v || '').slice(0, 10);
const t = (s) => {
  const [y, m, d] = iso(s).split('-').map(Number);
  return y ? Date.UTC(y, m - 1, d) : NaN;
};
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => toIso(t(s) + n * DAY);
export const daysBetween = (a, b) => Math.round((t(a) - t(b)) / DAY);

export function fmtDate(s, { year = true, weekday = false } = {}) {
  const ms = t(s);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  const core = `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
  return weekday ? `${WK[d.getUTCDay()]}, ${core}` : core;
}

/** Indian financial year that a date falls in: 2026-10-22 -> 2026 (FY 2026-27). */
const fyStart = (s) => {
  const d = new Date(t(s));
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};

/** Date-range presets, worked out from today. Quarters are FY quarters. */
export function datePresets(today) {
  const d = new Date(t(today));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const monthStart = (yy, mm) => `${yy}-${pad(mm + 1)}-01`;
  const monthEnd = (yy, mm) => toIso(Date.UTC(yy, mm + 1, 0));
  const lm = m === 0 ? [y - 1, 11] : [y, m - 1];
  // FY quarters (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar) are the calendar quarters.
  const qs = Math.floor(m / 3) * 3;
  const [lqY, lqS] = qs === 0 ? [y - 1, 9] : [y, qs - 3];
  const fy = fyStart(today);
  return [
    { id: 'today', label: 'Today', from: today, to: today },
    { id: 'month', label: 'This month', from: monthStart(y, m), to: today },
    { id: 'lmonth', label: 'Last month', from: monthStart(...lm), to: monthEnd(...lm) },
    { id: 'q', label: 'This quarter', from: monthStart(y, qs), to: today },
    { id: 'lq', label: 'Last quarter', from: monthStart(lqY, lqS), to: monthEnd(lqY, lqS + 2) },
    { id: 'fy', label: 'This FY', sub: `${fy}–${String(fy + 1).slice(2)}`, from: `${fy}-04-01`, to: today },
    { id: 'lfy', label: 'Last FY', sub: `${fy - 1}–${String(fy).slice(2)}`, from: `${fy - 1}-04-01`, to: `${fy}-03-31` },
    { id: 'all', label: 'All time', from: '0000-01-01', to: '9999-12-31' },
  ];
}

// ── price movement per line ─────────────────────────────────────────────────

/**
 * Each purchase line against the previous purchase of the same product.
 * @returns Map<lineId, {prevRate, prevDate, pct} | null>   null = first purchase
 */
export function lineDeltas(purchases) {
  const rows = (purchases || [])
    .filter((p) => !p.deleted_at && Number(p.quantity) > 0 && Number(p.total_amount) > 0)
    .sort((a, b) => iso(a.date).localeCompare(iso(b.date))
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const last = new Map();
  const out = new Map();
  for (const p of rows) {
    const rate = Number(p.total_amount) / Number(p.quantity);
    const prev = last.get(p.linked_product_id);
    out.set(p.id, prev ? { prevRate: prev.rate, prevDate: prev.date, pct: ((rate - prev.rate) / prev.rate) * 100 } : null);
    last.set(p.linked_product_id, { rate, date: iso(p.date) });
  }
  return out;
}

// ── a bill's state ──────────────────────────────────────────────────────────

/**
 * Days of credit a bill carries: its own payment terms, else the supplier's
 * credit days, else 30 -- the rule the register used before due dates existed.
 * A bill not bought on credit was due the day it was bought.
 */
export function creditDays(bill, supplier, termsById) {
  if (!isCreditType(bill.payment_type)) return 0;
  const term = termsById?.get?.(bill.lines?.[0]?.terms_id);
  if (term && Number.isFinite(Number(term.days))) return Number(term.days);
  const sd = Number(supplier?.credit_days);
  return Number.isFinite(sd) && sd > 0 ? sd : 30;
}

/**
 * Add what the register needs to each bill: due date, days left, state,
 * the overdue part, when and how it was paid, and the price hints.
 */
export function decorateBills(bills, { suppliers = [], termsById = new Map(), payments = [], deltas = new Map(), taxRateOf = () => 0, today }) {
  const supById = new Map(suppliers.map((s) => [s.id, s]));
  const payByLine = new Map();
  for (const p of payments) {
    if (p.deleted_at || !p.purchase_id) continue;
    (payByLine.get(p.purchase_id) || payByLine.set(p.purchase_id, []).get(p.purchase_id)).push(p);
  }
  return bills.map((b) => {
    const supplier = supById.get(b.supplier_id) || null;
    const credit = creditDays(b, supplier, termsById);
    const dueOn = addDays(b.date, credit);
    const dleft = daysBetween(dueOn, today);
    const settled = b.due < 0.5;
    const state = settled ? 'paid' : dleft < 0 ? 'over' : b.paid > 0.005 ? 'part' : 'due';

    const pays = b.lines.flatMap((l) => payByLine.get(l.id) || []);
    const lastPay = pays.sort((x, y) => iso(y.date).localeCompare(iso(x.date)))[0];
    const paidOn = lastPay ? iso(lastPay.date) : (b.paid > 0.005 ? iso(b.date) : null);
    const paidVia = lastPay ? (lastPay.method || lastPay.payment_method || lastPay.mode || null) : null;

    let dearer = 0;
    let cheaper = 0;
    let tax = 0;
    const lines = b.lines.map((l) => {
      const delta = deltas.get(l.id) ?? null;
      if (delta && delta.pct >= HINT_PCT) dearer += 1;
      if (delta && delta.pct <= -HINT_PCT) cheaper += 1;
      const amt = Number(l.total_amount) || 0;
      const rate = Number(taxRateOf(l.linked_product_id)) || 0;
      tax += rate > 0 ? amt - amt / (1 + rate / 100) : 0;
      return { ...l, delta };
    });

    return {
      ...b, lines, supplier, credit, dueOn, dleft, state,
      overdue: state === 'over' ? b.due : 0,
      paidOn, paidVia, dearer, cheaper,
      tax: Math.round(tax * 100) / 100,
    };
  });
}

// ── tabs, filters, sorts ────────────────────────────────────────────────────

export const TABS = [
  { id: 'due', label: 'Due', test: (b) => b.state !== 'paid', money: true },
  { id: 'over', label: 'Overdue', test: (b) => b.state === 'over', money: true, neg: true },
  { id: 'part', label: 'Part paid', test: (b) => b.paid > 0.005 && b.due >= 0.5, money: true },
  { id: 'paid', label: 'Paid', test: (b) => b.state === 'paid' },
  { id: 'all', label: 'All', test: () => true },
];
export const OPEN_TABS = ['due', 'over', 'part'];
export const defaultView = (tab) => (OPEN_TABS.includes(tab) ? { group: 'status', sort: 'dueon' } : { group: 'week', sort: 'new' });

export const TERMS = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank', CREDIT: 'Credit' };
export const termOf = (b) => (isCreditType(b.payment_type) ? 'CREDIT' : String(b.payment_type || 'CASH').toUpperCase());

/** Everything but the tab: date range, suppliers, terms, search. */
export function filterRegister(bills, { range, suppliers = [], terms = [], q = '', productNameOf = () => '', voucherNoOf = () => '' }) {
  const needle = String(q).trim().toLowerCase();
  const sup = new Set(suppliers);
  const trm = new Set(terms);
  return bills.filter((b) => {
    const d = iso(b.date);
    if (range && (d < range.from || d > range.to)) return false;
    if (sup.size && !sup.has(b.supplier_id)) return false;
    if (trm.size && !trm.has(termOf(b))) return false;
    if (!needle) return true;
    const hay = [b.bill_no, voucherNoOf(b), b.supplier_name, ...b.lines.map((l) => productNameOf(l.linked_product_id))];
    return hay.some((v) => String(v || '').toLowerCase().includes(needle));
  });
}

export const SORTS = {
  dueon: { label: 'Due date', long: 'Due date, soonest first', fn: (a, b) => (a.due >= 0.5 ? t(a.dueOn) : Infinity) - (b.due >= 0.5 ? t(b.dueOn) : Infinity) || b.due - a.due },
  new: { label: 'Newest', long: 'Bill date, newest first', fn: (a, b) => iso(b.date).localeCompare(iso(a.date)) || String(b.id).localeCompare(String(a.id)) },
  old: { label: 'Oldest', long: 'Bill date, oldest first', fn: (a, b) => iso(a.date).localeCompare(iso(b.date)) || String(a.id).localeCompare(String(b.id)) },
  amt: { label: 'Amount', long: 'Amount, largest first', fn: (a, b) => b.total - a.total },
  amtasc: { label: 'Amount ↑', long: 'Amount, smallest first', fn: (a, b) => a.total - b.total },
  due: { label: 'Due amount', long: 'Due amount, largest first', fn: (a, b) => b.due - a.due },
  dueasc: { label: 'Due amount ↑', long: 'Due amount, smallest first', fn: (a, b) => a.due - b.due },
};
/** Sorts under which rows can be drawn a month at a time. */
export const DATE_SORTS = ['new', 'old'];

export const GROUPS = {
  status: { label: 'Due status', sub: 'Overdue, due in 7 days, later' },
  day: { label: 'Day' },
  week: { label: 'Week', sub: 'Mon–Sun' },
  month: { label: 'Bill month' },
  supplier: { label: 'Supplier', sub: 'largest due first' },
  none: { label: 'None' },
};

// ── totals ──────────────────────────────────────────────────────────────────

const r2 = (n) => Math.round(n * 100) / 100;

export function totals(bills) {
  let total = 0, paid = 0, due = 0, overdue = 0;
  for (const b of bills) { total += b.total; paid += b.paid; due += b.due; overdue += b.overdue; }
  return { count: bills.length, total: r2(total), paid: r2(paid), due: r2(due), overdue: r2(overdue) };
}

/** Count and money for every tab, over the filtered set. */
export function tabStats(filtered) {
  return Object.fromEntries(TABS.map((tab) => [tab.id, totals(filtered.filter(tab.test))]));
}

// ── bands ───────────────────────────────────────────────────────────────────

const mondayOf = (s) => {
  const ms = t(s);
  const wd = (new Date(ms).getUTCDay() + 6) % 7;            // Mon = 0
  return toIso(ms - wd * DAY);
};

function bandOf(b, group, today) {
  if (group === 'status') {
    if (b.state === 'paid') return { key: '3paid', label: 'Paid' };
    if (b.state === 'over') return { key: '0over', label: 'Overdue', over: true };
    if (b.dleft <= 7) return { key: '1week', label: 'Due in 7 days' };
    return { key: '2later', label: 'Due later' };
  }
  if (group === 'day') return { key: iso(b.date), label: fmtDate(b.date, { weekday: true }) };
  if (group === 'week') {
    const mon = mondayOf(b.date);
    const sun = addDays(mon, 6);
    const thisWeek = mondayOf(today) === mon;
    return { key: mon, label: thisWeek ? 'This week' : `Week of ${fmtDate(mon, { year: false })}`, sub: `${fmtDate(mon, { year: false })} – ${fmtDate(sun, { year: false })}` };
  }
  if (group === 'month') {
    const d = new Date(t(b.date));
    return { key: iso(b.date).slice(0, 7), label: `${MONL[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  }
  if (group === 'supplier') {
    return { key: b.supplier_id || b.supplier_name || '?', label: b.supplier_name || 'Unknown supplier', supplier: b.supplier };
  }
  return { key: 'all', label: '' };
}

/**
 * Bills in bands, each band with its own subtotals. Bands keep a fixed order
 * of their own (status: overdue first; dates: follow the sort direction;
 * suppliers: most owed first); the chosen sort orders rows inside each band.
 */
export function bandRegister(bills, { group, sort, today }) {
  const sorted = [...bills].sort((SORTS[sort] || SORTS.new).fn);
  if (group === 'none') return [{ key: 'all', label: '', bills: sorted, ...totals(sorted) }];
  const map = new Map();
  for (const b of sorted) {
    const band = bandOf(b, group, today);
    if (!map.has(band.key)) map.set(band.key, { ...band, bills: [] });
    map.get(band.key).bills.push(b);
  }
  const bands = [...map.values()].map((g) => ({ ...g, ...totals(g.bills) }));
  if (group === 'status') bands.sort((a, b) => a.key.localeCompare(b.key));
  else if (group === 'supplier') bands.sort((a, b) => b.due - a.due || b.total - a.total);
  else bands.sort((a, b) => (sort === 'old' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)));
  return bands;
}

// ── paying a bill ───────────────────────────────────────────────────────────

/**
 * Spread a payment across a bill's lines, oldest line first, never more than
 * a line owes. Each slice is recorded against its own purchase row by the
 * server, so the bill's paid figure and the supplier balance move together.
 */
export function allocatePayment(lines, amount) {
  let left = r2(Number(amount) || 0);
  const out = [];
  for (const l of lines) {
    if (left <= 0) break;
    const owes = r2(Math.max(0, (Number(l.total_amount) || 0) - (Number(l.paid_amount) || 0)));
    if (owes <= 0) continue;
    const take = Math.min(owes, left);
    out.push({ purchaseId: l.id, amount: take });
    left = r2(left - take);
  }
  return out;
}

// ── export ──────────────────────────────────────────────────────────────────

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const STATE_LABEL = { paid: 'Paid', over: 'Overdue', part: 'Part paid', due: 'Due' };

/** The bills shown, one row each, with the GST split an accountant needs. */
export function registerCsv(bills, { productNameOf = () => '', voucherNoOf = () => '' } = {}) {
  const head = ['Supplier bill no', 'Voucher no', 'Bill date', 'Supplier', 'Supplier GSTIN', 'Items', 'Terms',
    'Due date', 'Status', 'Taxable value', 'GST', 'Amount', 'Paid', 'Due'];
  const rows = bills.map((b) => [
    b.bill_no || '', voucherNoOf(b), iso(b.date), b.supplier_name || '', b.supplier?.gstin || '',
    b.lines.map((l) => `${productNameOf(l.linked_product_id)} x ${Number(l.quantity)}`).join('; '),
    TERMS[termOf(b)] || termOf(b), b.state === 'paid' ? '' : b.dueOn, STATE_LABEL[b.state],
    r2(b.total - b.tax).toFixed(2), b.tax.toFixed(2), b.total.toFixed(2), b.paid.toFixed(2), b.due.toFixed(2),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}
