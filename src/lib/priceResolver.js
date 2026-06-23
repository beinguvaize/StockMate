/**
 * Client-side price resolver.
 * Uses price_lists loaded into state — no extra round trip.
 *
 * Usage:
 *   const price = resolvePrice(priceLists, productId, tier, qty, basePrice);
 */

/**
 * @param {Array}  priceLists  - rows from price_lists table
 * @param {string} productId
 * @param {string} tier        - 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR'
 * @param {number} qty         - quantity ordered
 * @param {number} basePrice   - product's sellingPrice fallback
 * @returns {number}
 */
export function resolvePrice(priceLists, productId, tier, qty = 1, basePrice = 0) {
  const t = (tier || 'RETAIL').toUpperCase();
  const q = Math.max(1, qty);

  // Filter to matching product + tier, sort by min_qty DESC
  const candidates = (priceLists || [])
    .filter(p => p.product_id === productId && p.tier === t && p.min_qty <= q)
    .sort((a, b) => b.min_qty - a.min_qty);

  return candidates.length > 0 ? Number(candidates[0].price) : Number(basePrice || 0);
}

/**
 * Resolve a product's selling price for a client tier using the product's own
 * tier columns (wholesale_price / distributor_price). Falls back gracefully:
 * distributor → wholesale → retail. Use when there is no per-qty price_lists
 * row — the common case for the Add Product tier fields.
 *
 * @param {object} product - product row (sellingPrice, wholesale_price, distributor_price)
 * @param {string} tier    - 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR'
 * @returns {number}
 */
export function tierPrice(product, tier) {
  if (!product) return 0;
  const retail = Number(product.sellingPrice ?? product.selling_price ?? 0);
  const wholesale = Number(product.wholesale_price) || retail;
  const distributor = Number(product.distributor_price) || wholesale;
  switch ((tier || 'RETAIL').toUpperCase()) {
    case 'DISTRIBUTOR': return distributor;
    case 'WHOLESALE':   return wholesale;
    default:            return retail;
  }
}

/**
 * Compute line totals for an order item array using price lists.
 * Returns items with unitPrice + total filled in.
 *
 * @param {Array}  items       - [{ productId, productName, qty, ... }]
 * @param {Array}  priceLists
 * @param {string} tier
 * @param {Array}  products    - product rows for basePrice fallback
 * @returns {{ items, subtotal }}
 */
export function computeOrderTotals(items, priceLists, tier, products = []) {
  let subtotal = 0;
  const priced = (items || []).map(item => {
    const product  = products.find(p => p.id === item.productId);
    const base     = Number(product?.sellingPrice || product?.selling_price || 0);
    const unitPrice = resolvePrice(priceLists, item.productId, tier, item.qty, base);
    const total    = unitPrice * (item.qty || 1);
    subtotal += total;
    return { ...item, unitPrice, total };
  });
  return { items: priced, subtotal };
}
