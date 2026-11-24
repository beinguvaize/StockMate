/**
 * Is this line's price far from what the item last cost?
 * ==========================================================================
 *
 * A line entered against the wrong product looks like a normal line. "10*13
 * Cover PKT" was saved at Rs 9.15 a unit when its other purchases were Rs 6.00
 * and Rs 5.90 -- the price belonged to a different cover -- and nothing said
 * so. A price that far from the last purchase is either a real change or a
 * typing mistake, and only the person at the bill knows which. So it is asked,
 * once, before saving. It never stops the save.
 *
 * This compares with the LAST PURCHASE, not with products.costPrice. costPrice
 * is the weighted average of open batches and drifts with every sale; the last
 * bill is what the owner remembers paying.
 *
 * Costs are per BASE unit, which is how purchases are stored, so a line bought
 * by the packet is converted before it is compared.
 *
 * The Flutter app has the same rule in mobile_app/lib/core/utils/price_check.dart.
 * Change both together.
 */

/** A line more than this many percent above or below the last purchase is asked about. */
export const PRICE_CHECK_PCT = 20;

const round2 = (n) => Math.round(n * 100) / 100;
const dayOf = (d) => String(d || '').slice(0, 10);

/**
 * The newest real purchase of a product: deleted and cancelled rows left out,
 * newest by date, then by when it was entered. `excludeIds` drops rows -- the
 * line being edited must not be compared with itself.
 *
 * @returns {{ id, unitCost: number, date: string } | null}
 */
export function lastPurchaseCost(purchases, productId, excludeIds = []) {
  if (!productId) return null;
  const skip = new Set(excludeIds.filter(Boolean));
  let best = null;
  for (const p of purchases || []) {
    if (p.linked_product_id !== productId || p.deleted_at || skip.has(p.id)) continue;
    if (String(p.status || '').toUpperCase() === 'CANCELLED') continue;
    const qty = Number(p.quantity);
    if (!(qty > 0)) continue;
    if (best && (dayOf(p.date).localeCompare(dayOf(best.date))
      || String(p.created_at || '').localeCompare(String(best.created_at || ''))) <= 0) continue;
    best = p;
  }
  if (!best) return null;
  return { id: best.id, unitCost: round2((Number(best.total_amount) || 0) / Number(best.quantity)), date: dayOf(best.date) };
}

/** Per-base-unit cost of a form line, or null when it has no quantity yet. */
export function baseUnitCost(line, product) {
  const qty = parseFloat(line.quantity);
  const total = parseFloat(line.total_amount);
  if (!(qty > 0) || !(total >= 0)) return null;
  const conv = Number(product?.conversion_factor);
  const baseQty = line.buyUnit === 'ALT' && product?.secondary_unit && conv > 0 ? qty * conv : qty;
  return round2(total / baseQty);
}

/**
 * Every line whose cost is more than PRICE_CHECK_PCT away from the product's
 * last purchase, in the order the lines are on the bill.
 *
 * Each line: { key, linked_product_id, quantity, total_amount, buyUnit?, id? }.
 * A line with an `id` is an existing purchase row; it is left out of its own
 * comparison. No previous purchase, or a last cost of 0, means nothing to
 * compare with, and the line is not asked about.
 */
export function priceCheck(lines, purchases, products = [], pct = PRICE_CHECK_PCT) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const flagged = [];
  for (const line of lines || []) {
    const product = byId.get(line.linked_product_id);
    const newCost = baseUnitCost(line, product);
    if (newCost === null) continue;
    const last = lastPurchaseCost(purchases, line.linked_product_id, [line.id]);
    if (!last || !(last.unitCost > 0)) continue;
    const change = ((newCost - last.unitCost) / last.unitCost) * 100;
    // Exactly 20 % is within bounds; the epsilon keeps float noise from
    // tipping a clean 20 % over the edge.
    if (Math.abs(change) <= pct + 1e-9) continue;
    flagged.push({
      key: line.key,
      productId: line.linked_product_id,
      name: product?.name || 'This item',
      newCost,
      lastCost: last.unitCost,
      lastDate: last.date,
      direction: change > 0 ? 'higher' : 'lower',
      pct: Math.round(Math.abs(change)),
    });
  }
  return flagged;
}

export const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "29 Oct", or "29 Oct 2025" when it is not this year. */
export function shortDate(ymd, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return '';
  const base = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return Number(m[1]) === today.getFullYear() ? base : `${base} ${m[1]}`;
}

/** "10*13 Cover PKT: ₹9.15 per unit. Last bought at ₹5.90 on 29 Oct, 55% higher." */
export function priceCheckMessage(f, today = new Date()) {
  return `${f.name}: ${inr(f.newCost)} per unit. Last bought at ${inr(f.lastCost)} on ${shortDate(f.lastDate, today)}, ${f.pct}% ${f.direction}.`;
}
