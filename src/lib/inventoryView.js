/**
 * Inventory screen helpers (web redesign, approved inventory-01…16).
 * ==========================================================================
 *
 * Presentation only. Every figure here is read off what the products, the
 * balances and the batches already hold; nothing is written from here and no
 * cost is derived. `costPrice` is the database's weighted average of open
 * batches (recompute_product_cost) and is only ever read.
 *
 * Most of these used to live inline in pages/inventory/index.jsx and its
 * components. They moved here unchanged so they can be tested. "Low" is
 * lib/stockLevels everywhere (owner rule): stock at or below the product's
 * own reorder level, 10 when it has none, in the rows, tiles and chips alike.
 */
import { isRaw, isStocked } from './productTypes';
import { reorderLevel, isLowStock } from './stockLevels';
import { getAppLocale, getAppTimezone } from './utils';

// Postgres numeric arrives as a string: coerce before maths.
export const toNum = (v) => Number(v ?? 0);

/** Reorder level in effect: the product's own, else 10 (lib/stockLevels). */
export const reorderOf = (p = {}) => reorderLevel(p);

/**
 * A row's stock state from its quantity and reorder level (reorderOf):
 * out at 0 or below, low at or below the level, else ok.
 */
export const statusOf = (qty, reorder) => {
  if (qty <= 0) return 'crit';
  return qty <= toNum(reorder) ? 'low' : 'ok';
};

/** Search, type, stock and category filters, exactly as the list applied them. */
export function filterProducts(products = [], { query = '', type = 'ALL', stock = 'ALL', category = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return products.filter((p) => {
    if (q) {
      const hay = `${p.name || ''} ${p.sku || ''} ${p.category || ''} ${p.barcode || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (type !== 'ALL' && (p.product_type || 'STANDARD').toUpperCase() !== type) return false;
    if (category && (p.category || '') !== category) return false;
    // A service cannot be in, low or out, so it is in none of the answers.
    if (stock !== 'ALL' && !isStocked(p)) return false;
    const stk = toNum(p.stock);
    if (stock === 'IN' && stk <= 0) return false;
    if (stock === 'LOW' && !isLowStock(p, stk)) return false;
    if (stock === 'OUT' && stk !== 0) return false;
    return true;
  });
}

/**
 * The strip's figures. Retail value is over sellable stock only (raw material
 * has no selling price); raw material is its own figure. `inCount` is new for
 * the stock bar: stocked products above their reorder level, so that
 * in + low + out covers every stocked product with stock of 0 or more.
 */
export function inventoryKpis(products = []) {
  const sellable = products.filter((p) => !isRaw(p));
  const raw = products.filter(isRaw);
  const stocked = products.filter(isStocked);
  const val = (list, field) => list.reduce((s, p) => s + (p[field] || 0) * (p.stock || 0), 0);

  const stockValue = val(products, 'costPrice');
  const sellableCost = val(sellable, 'costPrice');
  const retailValue = val(sellable, 'sellingPrice');
  const rawValue = val(raw, 'costPrice');
  const marginValue = retailValue - sellableCost;

  const lowStock = stocked.filter((p) => isLowStock(p, toNum(p.stock))).length;
  const outOfStock = stocked.filter((p) => (p.stock || 0) === 0).length;
  const inCount = stocked.filter((p) => toNum(p.stock) > reorderLevel(p)).length;
  const totalUnits = stocked.reduce((s, p) => s + (p.stock || 0), 0);
  const uniqueCats = new Set(products.map((p) => p.category).filter(Boolean)).size;
  return {
    stockValue, retailValue, rawValue, marginValue, sellableCost,
    rawCount: raw.length, lowStock, outOfStock, inCount, totalUnits, uniqueCats,
  };
}

/** Widths for the in / low / out bar, in percent of the three together. */
export function stockBarParts({ inCount = 0, lowStock = 0, outOfStock = 0 } = {}) {
  const total = inCount + lowStock + outOfStock;
  if (!total) return null;
  const pct = (n) => (n / total) * 100;
  return { in: pct(inCount), low: pct(lowStock), out: pct(outOfStock) };
}

/** "AA" from "Aashirvaad Atta 5 kg": first letters of the first two words. */
export const initials = (name = '') => {
  const words = String(name).trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (!words.length) return '?';
  const first = (w) => (w.match(/[\p{L}\p{N}]/u) || ['?'])[0];
  return (first(words[0]) + (words[1] ? first(words[1]) : (words[0].match(/[\p{L}\p{N}]/gu) || [])[1] || '')).toUpperCase();
};

/** One of six soft tints, the same for the same category every time. */
export const avatarTone = (key = '') => {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return (h % 6) + 1;
};

/**
 * The detail panel's state pill, by the ROW rule (statusOf with the reorder
 * level). Display only.
 */
export function productPill(product, qty, { service = false } = {}) {
  if (service) return { tone: 'neutral', label: 'Service' };
  const st = statusOf(qty, reorderOf(product));
  if (st === 'crit') return { tone: 'bad', label: qty < 0 ? `Below zero · ${qty}` : 'Out of stock' };
  if (st === 'low') return { tone: 'warn', label: `Low · ${qty} left` };
  return { tone: 'good', label: 'In stock' };
}

/**
 * movement_log.type is only ever IN or OUT. Adjustment and Transfer are told
 * apart by the reason text, so classify on that first (unchanged).
 */
export const classifyMovement = (row = {}) => {
  const reason = (row.reason || '').toLowerCase();
  if (/manual|adjust/.test(reason)) return 'ADJUST';
  if (/transfer|godown|to location|relocat/.test(reason)) return 'TRANSFER';
  return (row.type || '').toUpperCase() === 'OUT' ? 'OUT' : 'IN';
};

export const MOVEMENT_LABEL = { IN: 'Stock in', OUT: 'Stock out', ADJUST: 'Adjustment', TRANSFER: 'Transfer' };
export const MOVEMENT_TONE = { IN: 'good', OUT: 'bad', ADJUST: 'warn', TRANSFER: 'info' };

/** Rows of stock history matching a search and a type chip. */
export function filterMovements(log = [], { query = '', type = 'ALL', nameOf = () => '' } = {}) {
  const q = String(query || '').toLowerCase();
  return log.filter((r) => {
    const name = (r.product_name || nameOf(r.product_id) || '').toLowerCase();
    const reason = (r.reason || '').toLowerCase();
    const matchSearch = !q || name.includes(q) || reason.includes(q);
    return matchSearch && (type === 'ALL' || classifyMovement(r) === type);
  });
}

/**
 * "26 Nov", in the shop's time zone. A plain YYYY-MM-DD is taken as that
 * calendar day; a timestamp is shown on the shop's local day.
 */
export function dayMonth(value) {
  if (!value) return '—';
  const s = String(value);
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = ymd ? (() => { const [y, m, day] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)); })() : new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(getAppLocale(), { day: '2-digit', month: 'short', timeZone: ymd ? 'UTC' : getAppTimezone() });
}

/** Distinct products per price-list tier, and the sum for the tab count. */
export function priceListCounts(priceLists = []) {
  const per = {};
  for (const e of priceLists) {
    (per[e.tier] = per[e.tier] || new Set()).add(e.product_id);
  }
  const out = { total: 0 };
  for (const [tier, set] of Object.entries(per)) { out[tier] = set.size; out.total += set.size; }
  return out;
}

/**
 * Bulk edit, one product: the columns to write. Blank fields are left alone.
 * Moved unchanged from the page: a % change rounds the new price to paise, a
 * fixed price wins over a %, and the reorder level and GST rate are set as
 * typed. Never touches stock or cost.
 */
export function bulkEditPatch(product = {}, patch = {}) {
  const updates = {};
  if (patch.category) updates.category = patch.category;
  if (patch.reorder !== '' && patch.reorder != null) updates.lowStockThreshold = Number(patch.reorder);
  if (patch.pricePct !== '' && patch.pricePct != null) {
    const pct = Number(patch.pricePct) / 100;
    updates.sellingPrice = Math.round(Number(product.sellingPrice || 0) * (1 + pct) * 100) / 100;
  }
  if (patch.sellPrice !== '' && patch.sellPrice != null) updates.sellingPrice = Number(patch.sellPrice);
  if (patch.gstRate !== '' && patch.gstRate != null) updates.taxRate = Number(patch.gstRate);
  return updates;
}

/**
 * Run one write per item, in turn, and keep every failure with its reason.
 * The old loops awaited each write and dropped its error, so a refused
 * delete looked exactly like a done one.
 */
export async function applyEach(items = [], write) {
  const done = [];
  const failed = [];
  for (const item of items) {
    try {
      const res = await write(item);
      if (res?.error) failed.push({ item, error: res.error });
      else done.push(item);
    } catch (error) {
      failed.push({ item, error });
    }
  }
  return { done, failed };
}

/**
 * The Add / Edit form's progress list. Display only: Save still runs the
 * form's own checks (validateItemPricing and the required inputs).
 */
export function formSteps(form = {}, { pricingError = null, hasPhoto = false } = {}) {
  const details = Boolean(String(form.name || '').trim() && String(form.sku || '').trim());
  return [
    { key: 'f1', n: 1, label: 'Details', state: details ? 'done' : 'todo' },
    { key: 'f2', n: 2, label: 'Pricing and units', state: pricingError ? 'todo' : 'done' },
    { key: 'f3', n: 3, label: 'Tax', state: 'done' },
    { key: 'f4', n: 4, label: 'Photo', state: hasPhoto ? 'done' : 'optional' },
  ];
}
