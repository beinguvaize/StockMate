/**
 * Unit classification and quantity formatting.
 *
 * Loose goods are sold by weight — 200 g of rubber bands, not "1". The POS
 * previously forced whole numbers, so a cashier had to enter quantity 1 and
 * type the real money into the rate field. Revenue came out right; stock and
 * COGS did not (a full kilo deducted and costed against a fifth of a kilo),
 * which is why RUBBER BAND reported a −36.8% margin on a healthy cost price.
 *
 * Decimals are allowed for weight/volume/area/length units only. Piece-based
 * units stay whole so nobody sells 2.5 carry bags by mistake, and so
 * serial-tracked goods (always discrete) keep a countable quantity.
 */

/** Units measured on a scale or tape — fractions are meaningful. */
const FRACTIONAL_UNITS = new Set(['KG', 'LITRE', 'LTR', 'L', 'SQFT', 'MSTR', 'MTR', 'GM', 'G', 'ML']);

/**
 * Live data has both `KG` and `kg`; ImportData and BulkAdd default new
 * products to lowercase. Normalise before matching or imported products get
 * misclassified.
 */
const norm = (unit) => String(unit ?? '').trim().toUpperCase();

/**
 * Whether this unit may be sold in fractions.
 *
 * Unknown units return false. That matters: 19 products use `Ps`, which is not
 * in the UNITS enum at all. Defaulting unknown units to whole numbers is the
 * safe direction — the worst case is a cashier cannot enter a decimal, rather
 * than stock quietly going fractional on a product that is counted in pieces.
 */
export const allowsFraction = (unit) => FRACTIONAL_UNITS.has(norm(unit));

/**
 * Step for a quantity input. 0.001 on weight units gives gram precision on a
 * KG product, and matches the 3 decimal places the database stores on
 * product_batches.qty_remaining / sale_batch_consumption.qty_taken.
 */
export const qtyStep = (unit) => (allowsFraction(unit) ? 0.001 : 1);

/** Smallest sellable quantity — a gram, or one piece. */
export const qtyMin = (unit) => (allowsFraction(unit) ? 0.001 : 1);

/**
 * Step size for the +/- buttons. Distinct from qtyStep: typing 0.001 is
 * reasonable, but stepping to 1 kg in 1 g increments is not.
 */
export const qtyStepButton = (unit) => (allowsFraction(unit) ? 0.5 : 1);

/**
 * Display a quantity without float noise.
 *
 * 0.1 + 0.2 style error would otherwise reach receipts and stock warnings as
 * "0.30000000000000004". Trailing zeros are dropped so a whole 2 KG prints as
 * "2", not "2.000".
 */
export const formatQty = (qty, unit) => {
  const n = Number(qty);
  if (!Number.isFinite(n)) return '0';
  if (!allowsFraction(unit)) return String(Math.round(n));
  return String(Number(n.toFixed(3)));
};

/** Quantity with its unit, e.g. "0.25 KG". Falls back cleanly when unit is unset. */
export const formatQtyWithUnit = (qty, unit) => {
  const u = String(unit ?? '').trim();
  return u ? `${formatQty(qty, unit)} ${u}` : formatQty(qty, unit);
};

/**
 * Round a typed quantity to what the unit permits. Use on input so the value
 * stored matches the value shown.
 */
export const clampQty = (qty, unit) => {
  const n = Number(qty);
  if (!Number.isFinite(n) || n < 0) return 0;
  return allowsFraction(unit) ? Number(n.toFixed(3)) : Math.round(n);
};

/**
 * Compare against available stock with a tolerance. Without this, float error
 * makes 0.3 > 0.3 true and the cart clamps a perfectly valid entry down.
 */
export const exceedsStock = (qty, available) => Number(qty) - Number(available) > 1e-6;
