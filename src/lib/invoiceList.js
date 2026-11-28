/**
 * The Invoices list's rules, out of the page so they can be tested.
 *
 * Every rule here is the one the page used before the redesign, moved and not
 * changed: the status a row shows, the date windows, the summary figures, the
 * search, the order and the CSV columns. The only additions are labels (the
 * "Part paid" pill) and counts the old page already had the data for (how many
 * invoices are overdue). No money is written from here.
 */
import { parseLocalDate } from './utils';

export const isPaidStatus = (s) => s === 'PAID';

/** This bill's balance: total less what was paid on it, never below zero. */
export const invoiceOutstanding = (inv) =>
  Math.max(0, (Number(inv?.grand_total) || 0) - (Number(inv?.paid_amount) || 0));

/**
 * PAID / PARTIAL / OVERDUE / UNPAID, exactly as the page decided it before:
 * paid wins, then part paid, then a due date that has passed, else pending.
 */
export function resolveInvoiceStatus(inv, now = new Date()) {
  if (isPaidStatus(inv?.payment_status)) return 'PAID';
  if (inv?.payment_status === 'PARTIAL') return 'PARTIAL';
  if (inv?.due_date && parseLocalDate(inv.due_date) < now) return 'OVERDUE';
  return 'UNPAID';
}

export const STATUS_LABEL = { PAID: 'Paid', PARTIAL: 'Part paid', UNPAID: 'Pending', OVERDUE: 'Overdue' };
export const STATUS_TONE = { PAID: 'good', PARTIAL: 'warn', UNPAID: 'neutral', OVERDUE: 'bad' };

export const DELIVERY_LABEL = { DELIVERED: 'Delivered', IN_TRANSIT: 'In transit' };
export const deliveryPill = (inv) => {
  if (!inv?.delivery_required) return null;
  if (inv.delivery_status === 'DELIVERED') return { tone: 'good', label: 'Delivered' };
  if (inv.delivery_status === 'IN_TRANSIT') return { tone: 'info', label: 'In transit' };
  return { tone: 'warn', label: 'Awaiting dispatch' };
};

const DAY = 86400000;

/** Is the invoice inside the chosen date window? `today` is the shop's today (YYYY-MM-DD). */
export function inInvoiceDateRange(inv, dateFilter, customRange = {}, today) {
  if (dateFilter === 'ALL') return true;
  const d = String(inv?.invoice_date || '').slice(0, 10);
  if (!d) return false;
  if (dateFilter === 'TODAY') return d === today;
  const todayMs = new Date(today + 'T00:00:00Z').getTime();
  const dMs = new Date(d + 'T00:00:00Z').getTime();
  if (dateFilter === '7D') return dMs >= todayMs - 7 * DAY;
  if (dateFilter === '30D') return dMs >= todayMs - 30 * DAY;
  if (dateFilter === 'CUSTOM') {
    if (customRange.from && d < customRange.from) return false;
    if (customRange.to && d > customRange.to) return false;
    return true;
  }
  return true;
}

/** The four figures at the top, plus the counts the filter pills show. */
export function summarizeInvoices(invoices = [], inRange = () => true, now = new Date()) {
  let revenue = 0, paidAmt = 0, paidCt = 0, unpaidCt = 0, unpaidAmt = 0, overdue = 0, overdueCt = 0;
  for (const inv of invoices) {
    if (!inRange(inv)) continue;
    const gt = Number(inv.grand_total) || 0;
    revenue += gt;
    const st = resolveInvoiceStatus(inv, now);
    if (st === 'PAID') { paidAmt += gt; paidCt++; continue; }
    unpaidCt++;
    unpaidAmt += invoiceOutstanding(inv);
    if (st === 'OVERDUE') { overdue += invoiceOutstanding(inv); overdueCt++; }
  }
  return { revenue, paidAmt, paidCt, unpaidCt, unpaidAmt, overdue, overdueCt, count: paidCt + unpaidCt };
}

/**
 * The rows the table shows: in the window, of the chosen status, matching the
 * search on invoice number or client name. Newest invoice date first, then
 * invoice number descending, so same-day rows keep one order everywhere.
 */
export function filterInvoices(invoices = [], { inRange = () => true, status = 'ALL', query = '', clientName = (i) => i.client_name || '', now = new Date() } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return invoices
    .filter((inv) => {
      if (!inRange(inv)) return false;
      if (status !== 'ALL' && resolveInvoiceStatus(inv, now) !== status) return false;
      if (!q) return true;
      const name = String(clientName(inv) || '').toLowerCase();
      return String(inv.invoice_number || '').toLowerCase().includes(q) || name.includes(q);
    })
    .sort((a, b) => {
      const ad = a.invoice_date || '';
      const bd = b.invoice_date || '';
      if (ad !== bd) return bd.localeCompare(ad);
      return String(b.invoice_number || '').localeCompare(String(a.invoice_number || ''));
    });
}

/** One page of rows and the "1 to 50 of 142" words under the table. */
export function pageOf(rows = [], page = 0, size = 50) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  const start = p * size;
  const slice = rows.slice(start, start + size);
  return {
    rows: slice, page: p, pages, total,
    from: total ? start + 1 : 0,
    to: start + slice.length,
    hasPrev: p > 0,
    hasNext: p < pages - 1,
  };
}

/** The CSV the Export button downloads. Same columns as before. */
export const invoiceCsvRows = (rows = [], clientName = (i) => i.client_name || '', now = new Date()) =>
  rows.map((inv) => ({
    date: inv.invoice_date,
    invoice: inv.invoice_number,
    client: clientName(inv) || '',
    taxable: inv.taxable_amount ?? '',
    grand_total: inv.grand_total ?? 0,
    paid_amount: inv.paid_amount ?? 0,
    outstanding: invoiceOutstanding(inv),
    status: resolveInvoiceStatus(inv, now),
  }));

/**
 * What the Record payment dialog says about an amount before it is saved.
 * The checks are the page's old ones (a positive amount, no more than this
 * bill's balance); `full` is the case the page settles with markInvoicePaid.
 */
export function paymentCheck(inv, rawAmount) {
  const out = invoiceOutstanding(inv);
  const amt = parseFloat(rawAmount);
  if (!amt || amt <= 0) return { ok: false, out, error: 'Enter an amount above zero.' };
  if (amt > out) return { ok: false, out, error: `That is more than this bill's balance. Up to ${out.toFixed(2)}.` };
  const left = Math.max(0, +(out - amt).toFixed(2));
  return { ok: true, out, amount: amt, full: amt >= out, left, statusAfter: amt >= out ? 'PAID' : 'PARTIAL' };
}

/** Whole days from today to a YYYY-MM-DD date (negative when it has passed). */
export function daysUntil(ymd, today) {
  if (!ymd || !today) return null;
  const a = new Date(String(today).slice(0, 10) + 'T00:00:00Z').getTime();
  const b = new Date(String(ymd).slice(0, 10) + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY);
}

/** "in 12 days" / "today" / "3 days ago", for the due date. */
export function dueWords(ymd, today) {
  const n = daysUntil(ymd, today);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1) return `in ${n} days`;
  if (n === -1) return '1 day ago';
  return `${-n} days ago`;
}
