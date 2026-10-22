/**
 * Which lines of a purchase bill change what the shop pays for an item.
 * ==========================================================================
 *
 * A supplier raising (or dropping) a price is easy to miss on a bill of
 * twenty lines, and the selling price stays where it was. That is how
 * "10*13 Cover PKT" kept selling at Rs 8.50 against batches bought at
 * Rs 9.00-9.15 -- every sale a small loss, for weeks.
 *
 * Costs are compared per BASE unit. A line bought by the packet carries a
 * per-packet price; comparing that to the per-piece cost would flag every
 * packet purchase as a huge increase.
 */

// Rupee amounts within half a paisa are the same price.
const EPS = 0.005;

const round2 = (n) => Math.round(n * 100) / 100;

/** The per-base-unit cost a bill line implies, or null when it does not imply one. */
export function lineUnitCost(line, product) {
  const qty = parseFloat(line.quantity);
  const total = parseFloat(line.total_amount);
  if (!(qty > 0) || !(total > 0)) return null;
  const conv = Number(product?.conversion_factor);
  const baseQty = line.buyUnit === 'ALT' && product?.secondary_unit && conv > 0 ? qty * conv : qty;
  return total / baseQty;
}

/**
 * One entry per product whose cost on this bill differs from its current
 * cost. A product on several lines is judged by its dearest line: that is
 * the price the selling price must now cover.
 */
export function priceChanges(lines, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const found = new Map();
  for (const line of lines) {
    const product = byId.get(line.linked_product_id);
    if (!product) continue;
    const newCost = lineUnitCost(line, product);
    const oldCost = Number(product.costPrice) || 0;
    if (newCost === null || !(oldCost > 0)) continue;   // a first purchase has nothing to compare with
    if (Math.abs(newCost - oldCost) < EPS) continue;
    const seen = found.get(product.id);
    if (seen && seen.newCost >= newCost) continue;

    const sell = Number(product.sellingPrice) || 0;
    found.set(product.id, {
      productId: product.id,
      name: product.name,
      unit: product.unit || '',
      oldCost: round2(oldCost),
      newCost: round2(newCost),
      direction: newCost > oldCost ? 'UP' : 'DOWN',
      pct: round2(((newCost - oldCost) / oldCost) * 100),
      sellingPrice: sell,
      marginBefore: sell > 0 ? round2(((sell - oldCost) / sell) * 100) : null,
      marginAfter: sell > 0 ? round2(((sell - newCost) / sell) * 100) : null,
      // Selling at or below what it now costs: every sale loses money.
      sellsAtLoss: sell > 0 && sell <= newCost + EPS,
    });
  }
  // Increases first, biggest first: those are the ones that cost money.
  return [...found.values()].sort((a, b) =>
    (a.direction === b.direction ? 0 : a.direction === 'UP' ? -1 : 1) || Math.abs(b.pct) - Math.abs(a.pct));
}

/**
 * The selling price that keeps the margin the item had before the cost
 * changed, rounded up to the next 50 paise -- a price a shop would print.
 * Null when there was no margin to keep.
 */
export function priceKeepingMargin(change) {
  if (!(change.sellingPrice > 0) || change.marginBefore === null || change.marginBefore >= 100) return null;
  const raw = change.newCost / (1 - change.marginBefore / 100);
  return Math.ceil(raw * 2 - 1e-9) / 2;
}
