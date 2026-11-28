/**
 * One "low stock" rule for the whole web app (owner approved): a product is
 * low when its stock is at or below its OWN reorder level. Display only.
 *
 * Same shape as the phone's StockLevels (mobile_app/lib/core/utils/
 * stock_levels.dart):
 *   · reorder level = the product's own (lowStockThreshold and its other
 *     spellings), or 10 when it has none: the figure Add item saves by
 *     default (lib/itemForm) and the phone's defaultThreshold;
 *   · out of stock   = stock 0 or below;
 *   · low            = above 0 and at or below the reorder level;
 *   · needs restock  = low OR out (stock at or below the reorder level): what
 *     a single "Low stock" count means when there is only one number.
 * A service carries no stock, so it is never low or out (lib/productTypes).
 */
import { isStocked } from './productTypes';

export const DEFAULT_REORDER_LEVEL = 10;

const present = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

/** The product's own reorder level, or null when it has none. */
export function ownReorderLevel(p = {}) {
  const v = [p.reorderLevel, p.reorder_level, p.lowStockThreshold, p.low_stock_threshold, p.minStock, p.min_stock].find(present);
  return v === undefined ? null : Number(v);
}

/** The reorder level the rule uses: the product's own, else 10. */
export const reorderLevel = (p = {}) => ownReorderLevel(p) ?? DEFAULT_REORDER_LEVEL;

export const isOutOfStock = (qty) => Number(qty) <= 0;

/** On the shelf but at or under the product's reorder level. */
export function isLowStock(p, qty) {
  if (!isStocked(p || {})) return false;
  const q = Number(qty) || 0;
  return q > 0 && q <= reorderLevel(p);
}

/** Low or out: stock at or under the product's reorder level. */
export function needsRestock(p, qty) {
  if (!isStocked(p || {})) return false;
  return (Number(qty) || 0) <= reorderLevel(p);
}

/** 'out' | 'low' | 'ok' (services are always 'ok'). */
export function stockState(p, qty) {
  if (!isStocked(p || {})) return 'ok';
  if (isOutOfStock(qty)) return 'out';
  return isLowStock(p, qty) ? 'low' : 'ok';
}
