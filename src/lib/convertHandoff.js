/**
 * Estimate / order → New sale handoff (sessionStorage 'estimate_cart').
 *
 * The Estimates and Orders pages stash the items (and which estimate or
 * order they came from) and open the till. They used to mark the estimate
 * Converted, or move the order to Invoiced, BEFORE the sale existed: backing
 * out of the till left it marked billed with no sale behind it.
 *
 * Now the till does it, after the sale is saved, with the same server calls
 * as before (the estimates status update; advance_order_status, which also
 * stores the sale id). This file is the pure part: reading the stash and
 * deciding whether a saved sale is the converted one.
 */

/** Parse the stash: the cart lines for the builder and where they came from. */
export function readHandoff(raw) {
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) return null;
  const cart = items.map((it) => ({
    uid: it.id, productId: it.id, name: it.name,
    basePrice: Number(it.rate) || 0, price: Number(it.rate) || 0,
    quantity: Number(it.qty) || 1, taxRate: Number(it.taxRate) || 0,
    modifiers: [], modLabel: null,
  }));
  const source = parsed.estimateId
    ? { kind: 'estimate', id: parsed.estimateId }
    : parsed.orderId ? { kind: 'order', id: parsed.orderId } : null;
  return {
    cart,
    clientId: parsed.clientId || null,
    source: source ? { ...source, productIds: items.map((i) => i.id).filter(Boolean) } : null,
  };
}

/**
 * Is this saved sale the one the estimate / order turned into? The till is
 * free to hold a cart and ring another sale first, so the sale must carry at
 * least one of the handed-over products. An edit of an old sale never counts.
 */
export function saleIsConversion(source, saleData = {}, { editing = false } = {}) {
  if (!source || editing) return false;
  const ids = new Set(source.productIds || []);
  if (!ids.size) return true;
  return (saleData.items || []).some((i) => ids.has(i.productId ?? i.id));
}

/** The words for a failed mark, after the sale itself was saved. */
export function markFailedWords(source, reason) {
  const what = source?.kind === 'order' ? 'The order could not be moved to Invoiced' : 'The estimate could not be marked Billed';
  return `Sale saved. ${what}: ${reason || 'unknown error'}`;
}
