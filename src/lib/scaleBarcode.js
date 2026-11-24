/**
 * Weighing-scale barcodes.
 *
 * A counter scale in a grocery prints a label whose barcode carries the
 * WEIGHT or the PRICE of that particular piece, because 380g of tomatoes has
 * no fixed barcode. Scanning it at the till has to yield both the product and
 * the amount. Without this a shop weighs at the scale and then keys the
 * quantity in again at the POS, which is the manual step the scale existed to
 * remove.
 *
 * THERE IS NO SINGLE FORMAT. The layout is configured on the scale, per shop.
 * What is fixed is only the envelope: 13 digits, a GS1 "restricted
 * circulation" prefix in the 20-29 range, and a standard EAN-13 check digit.
 * Inside that, how many digits are the item code and whether the rest is
 * grams, paise or rupees is a setting on the machine. So this takes a format
 * rather than assuming one, and the default is the common Indian layout
 * rather than the only one.
 *
 * Deliberately pure: a wrong answer here is a wrong price on a bill, and this
 * needs to be checkable without a scanner and a scale on the desk.
 */

import { isValidEan13 } from './labelPrint';

/** What the embedded digits mean. */
export const VALUE_KINDS = {
  WEIGHT_G:     'WEIGHT_G',      // grams      -> quantity in kg
  WEIGHT_10G:   'WEIGHT_10G',    // 10g units  -> quantity in kg
  PRICE_PAISE:  'PRICE_PAISE',   // paise      -> line total in rupees
  PRICE_RUPEE:  'PRICE_RUPEE',   // rupees     -> line total in rupees
};

/**
 * The layout most Indian counter scales ship with: prefix, five-digit PLU,
 * five-digit value, check digit.
 *
 * `prefixes` is the set of leading two digits that mark a scale label. It
 * MUST stay narrow: every digit it claims is a digit that can no longer be an
 * ordinary product barcode, and mistaking a packet of biscuits for a weighed
 * item prices it by accident.
 */
export const DEFAULT_SCALE_FORMAT = {
  prefixes: ['20', '21', '22'],
  itemDigits: 5,
  valueDigits: 5,
  valueKind: VALUE_KINDS.WEIGHT_G,
};

/**
 * Read a scanned code as a scale label.
 *
 * Returns null for anything that is not one — an ordinary barcode, a short
 * code, a mis-scan with a bad check digit. Null means "this is not a scale
 * label", so the caller falls through to its normal product lookup; it never
 * means "this is a broken scale label", because the two need different
 * handling and conflating them is how a mis-scan becomes a silent zero.
 */
export function parseScaleBarcode(raw, format = DEFAULT_SCALE_FORMAT) {
  const code = String(raw ?? '').trim();
  if (!/^\d{13}$/.test(code)) return null;

  const f = { ...DEFAULT_SCALE_FORMAT, ...(format || {}) };
  if (!f.prefixes?.includes(code.slice(0, 2))) return null;

  // A bad check digit is a mis-scan. Pricing off it would invent a number.
  if (!isValidEan13(code)) return null;

  const itemStart = 2;
  const itemEnd = itemStart + Number(f.itemDigits || 0);
  const valueEnd = itemEnd + Number(f.valueDigits || 0);
  // The fields must fill the 12-digit body exactly. A format that does not is
  // a misconfiguration, and guessing which end to trim would price things.
  if (valueEnd !== 12) return null;

  const itemCode = code.slice(itemStart, itemEnd);
  const value = Number(code.slice(itemEnd, valueEnd));
  if (!Number.isFinite(value)) return null;

  const out = { raw: code, itemCode, valueKind: f.valueKind, embedded: value };

  switch (f.valueKind) {
    case VALUE_KINDS.WEIGHT_G:    return { ...out, quantity: value / 1000 };
    case VALUE_KINDS.WEIGHT_10G:  return { ...out, quantity: value / 100 };
    case VALUE_KINDS.PRICE_PAISE: return { ...out, lineTotal: value / 100 };
    case VALUE_KINDS.PRICE_RUPEE: return { ...out, lineTotal: value };
    default: return null;
  }
}

/**
 * The quantity to add, given the parsed label and the product's unit price.
 *
 * A price-embedded label carries a total, not a quantity, so the quantity has
 * to be derived — and a zero or missing unit price makes that division
 * meaningless. Returning null there is deliberate: the till should ask rather
 * than silently add 0 or Infinity of something.
 */
export function quantityFrom(parsed, unitPrice) {
  if (!parsed) return null;
  if (parsed.quantity != null) return parsed.quantity;
  const price = Number(unitPrice || 0);
  if (!(price > 0)) return null;
  // 3dp matches products.stock and product_batches.qty_remaining, so a
  // weighed line cannot carry more precision than the stock it draws down.
  return Math.round((parsed.lineTotal / price) * 1000) / 1000;
}
