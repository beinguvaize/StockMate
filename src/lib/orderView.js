/**
 * The Orders page (web redesign, orders-01 to 09). Pure, so it can be tested.
 *
 * The pipeline is today's: orders from the `orders` table plus invoices not
 * linked to an order, each invoice placed in a stage from its payment and
 * delivery state. Nothing here works money out in a new way: totals are the
 * stored `grand_total`, and a line's figures are read the way the expanded
 * row always read them.
 */
import { shopDay } from './estimateView';

const num = (v) => Number(v) || 0;

export const STAGES = [
  { id: 'DRAFT', label: 'Draft', tone: 'draft', next: 'CONFIRMED' },
  { id: 'CONFIRMED', label: 'Confirmed', tone: 'conf', next: 'DISPATCHED' },
  { id: 'DISPATCHED', label: 'Dispatched', tone: 'disp', next: 'DELIVERED' },
  { id: 'DELIVERED', label: 'Delivered', tone: 'deliv', next: 'INVOICED' },
  { id: 'INVOICED', label: 'Invoiced', tone: 'inv', next: null },
];
export const CANCELLED = { id: 'CANCELLED', label: 'Cancelled', tone: 'can', next: null };
/** Today's lookup: an unknown status reads as Draft. Cancelled has its own pill. */
export const stageOf = (id) => (id === 'CANCELLED' ? CANCELLED : STAGES.find((s) => s.id === id) || STAGES[0]);

export const TIER_LABELS = { RETAIL: 'Retail', WHOLESALE: 'Wholesale', DISTRIBUTOR: 'Distributor' };

// ── Invoice → order stage (unchanged) ──
export const invoiceToStage = (inv) => {
  if (inv.payment_status === 'PAID' || inv.status === 'PAID') return 'INVOICED';
  const ds = (inv.delivery_status || '').toUpperCase();
  if (ds === 'DELIVERED') return 'DELIVERED';
  if (ds === 'IN_TRANSIT') return 'DISPATCHED';
  return 'CONFIRMED';
};

export const normalizeInvoice = (inv) => ({
  id: inv.id,
  _source: 'invoice',
  _delivery_required: !!inv.delivery_required,
  order_number: (inv.invoice_number || `INV-${String(inv.id).slice(-6).toUpperCase()}`).replace(/^#+/, ''),
  client_id: inv.client_id || null,
  client_name: inv.client_name || '',
  order_type: 'B2B',
  price_tier: 'RETAIL',
  status: invoiceToStage(inv),
  items: Array.isArray(inv.items) ? inv.items : [],
  grand_total: inv.grand_total || inv.amount || 0,
  notes: inv.notes || null,
  requested_date: inv.invoice_date || inv.date || null,
  created_at: inv.created_at,
});

/** Orders plus invoices not already linked to an order, newest first. */
export function mergePipeline(orders = [], invoices = []) {
  const linked = new Set(orders.map((o) => o.invoice_id).filter(Boolean));
  const invoiceRows = invoices.filter((inv) => !linked.has(inv.id)).map(normalizeInvoice);
  return [...orders, ...invoiceRows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export function filterOrders(rows = [], { stage = 'ALL', query = '' } = {}) {
  let list = rows;
  if (stage !== 'ALL') list = list.filter((o) => o.status === stage);
  const q = String(query || '').trim().toLowerCase();
  if (q) {
    list = list.filter((o) => (o.order_number || '').toLowerCase().includes(q)
      || (o.client_name || '').toLowerCase().includes(q));
  }
  return list;
}

/** All = everything but cancelled, as today. */
export function stageCounts(rows = []) {
  const c = { ALL: rows.filter((o) => o.status !== 'CANCELLED').length, CANCELLED: 0 };
  STAGES.forEach((s) => { c[s.id] = 0; });
  rows.forEach((o) => { if (c[o.status] !== undefined) c[o.status] += 1; });
  return c;
}

/**
 * The strip. "Today" counts orders made on the shop's day: created_at is a
 * UTC timestamp, read in the shop's timezone (it used to be compared as a
 * UTC string, which missed orders made between midnight and 5:30 am IST).
 */
export function orderFigures(rows = [], today) {
  const counts = stageCounts(rows);
  const open = rows.filter((o) => !['INVOICED', 'CANCELLED'].includes(o.status))
    .reduce((s, o) => s + num(o.grand_total), 0);
  const madeToday = rows.filter((o) => shopDay(o.created_at) === today).length;
  return { open, active: counts.ALL, today: madeToday, toDispatch: counts.CONFIRMED || 0 };
}

/** A line's qty, rate and amount, read from any of the shapes items come in (unchanged). */
export function lineFigures(item = {}) {
  const qty = num(item.qty ?? item.quantity ?? 1) || 1;
  let amount = num(item.total ?? item.amount ?? item.lineTotal ?? ((item.taxable || 0) + (item.totalTax || 0)));
  let rate = num(item.unitPrice ?? item.price ?? item.rate ?? 0);
  if (!amount && rate) amount = rate * qty;
  if (!rate && amount) rate = amount / qty;
  return { name: item.productName || item.name || 'Item', qty, rate, amount, has: amount > 0 || rate > 0 };
}

/** What a row (and the panel) offers: today's rules. */
export function orderActions(o = {}) {
  const isInvoice = o._source === 'invoice';
  const cancelled = o.status === 'CANCELLED';
  const stage = stageOf(o.status);
  const items = Array.isArray(o.items) ? o.items : [];
  return {
    isInvoice,
    advance: !isInvoice && !cancelled && !!stage.next ? stage.next : null,
    convert: !isInvoice && !cancelled && stage.next === 'INVOICED',
    delivery: isInvoice && !['DISPATCHED', 'DELIVERED', 'INVOICED'].includes(o.status),
    viewInvoice: isInvoice,
    edit: !isInvoice && o.status === 'DRAFT',
    cancel: !isInvoice && !['INVOICED', 'CANCELLED'].includes(o.status),
    remove: !isInvoice && ['DRAFT', 'CANCELLED'].includes(o.status),
    expand: items.length > 0,
  };
}

/** The five-step track in the panel: steps before the current one are done. */
export function trackSteps(o = {}) {
  const cur = STAGES.findIndex((s) => s.id === o.status);
  return STAGES.map((s, i) => ({
    id: s.id, label: s.label,
    done: cur >= 0 && i <= cur,
    current: i === cur,
    // Only the day it was made is stored; later stages have no date.
    day: i === 0 ? shopDay(o.created_at) : '',
  }));
}

/**
 * What the till is handed (sessionStorage 'estimate_cart'), same shape as
 * today. Returns null when the order has nothing to sell. The order is NOT
 * moved to Invoiced here: the Sales page does that once the sale is saved.
 */
export function orderHandoff(o = {}) {
  const items = (Array.isArray(o.items) ? o.items : []).map((i) => ({
    id: i.productId, name: i.productName, qty: i.qty, rate: i.unitPrice, taxRate: i.taxRate || 0,
  }));
  if (!items.length) return null;
  return { orderId: o.id, clientId: o.client_id || null, items };
}

/** The form's grand total: the sum of line totals, no GST (unchanged). */
export const formTotal = (items = []) => items.reduce((s, i) => s + num(i.total), 0);

/** Why the form cannot be saved yet, or '' when it can. */
export function formProblem(items = []) {
  if (!items.length) return 'Add at least one item.';
  if (items.some((i) => !i.productId)) return 'Choose a product on every line.';
  return '';
}
