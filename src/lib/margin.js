/**
 * One margin definition for the web app (owner approved): margin on the
 * selling price, (price − cost) ÷ price, as a percent. The item form, the
 * products table and the till's minimum-margin check all read it this way,
 * as the phone does. Display only: profit and COGS are not worked out here.
 */

/** Margin on the selling price, in percent; null when there is no price. */
export function marginOnPrice(price, cost) {
  const p = Number(price);
  const c = Number(cost) || 0;
  if (!Number.isFinite(p) || p <= 0) return null;
  return ((p - c) / p) * 100;
}

/**
 * The pack size that gives margin `m` (on the selling price) at shelf price
 * `price`, when one base unit costs `cost`:
 *   price = cost × size ÷ (1 − m/100)  ⇒  size = price × (1 − m/100) ÷ cost.
 * Null when the inputs cannot give one (no price or cost, m below 0 or 100+).
 */
export function packSizeForMargin(price, m, cost) {
  const p = Number(price), pc = Number(m), c = Number(cost);
  if (!(p > 0) || !(c > 0) || !Number.isFinite(pc) || pc < 0 || pc >= 100) return null;
  return (p * (1 - pc / 100)) / c;
}
