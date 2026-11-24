/**
 * Lookup keys for the local catalogue, computed once at write time.
 * ==========================================================================
 *
 * IndexedDB has no case-insensitive collation and no LIKE. An index can only
 * answer questions about the exact bytes stored in it. That is the whole
 * reason the POS today resolves a scan by walking the products array and
 * lowercasing BOTH sides of every comparison (InvoiceBuilder.jsx:425-427) --
 * there was nowhere to put a comparable key.
 *
 * So the keys are materialised: `barcode_keys`, `sku_norm` and `name_tokens`
 * are derived when a product is cached and indexed directly. A scan becomes
 * one index lookup instead of a scan of 50,000 rows with a toLowerCase per
 * candidate.
 *
 * These are pure functions on purpose. The rules below -- what a leading zero
 * means, where a name splits -- are the kind of thing that is argued about
 * once and then has to stay decided, and that argument is much easier to have
 * against a test than against a till.
 */

/** Trim, collapse inner whitespace, lowercase. The base for every key here. */
export const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Every form of a barcode that should resolve to this product.
 *
 * A scanner does not always emit what the catalogue stores. The common case in
 * Indian retail is UPC-A: the label carries 12 digits, the product was entered
 * with the 13-digit EAN form, and those differ by exactly one leading zero.
 * Matching only the stored string means the item "is not in the system" while
 * it is sitting on the shelf -- the same user-visible failure as the catalogue
 * truncation, from a different cause.
 *
 * Rather than guess which form is canonical, index both: the normalised string
 * and, for an all-digit code, the zero-stripped form. A multiEntry index over
 * the array makes either one a hit. Returned sorted and deduped so the index
 * contents are stable regardless of input order.
 */
export function barcodeKeys(raw) {
  const base = norm(raw).replace(/\s/g, '');
  if (!base) return [];
  const keys = new Set([base]);
  if (/^\d+$/.test(base)) {
    const stripped = base.replace(/^0+/, '');
    // Guard the all-zeros case: '0000' must not become '' and match everything.
    if (stripped) keys.add(stripped);
  }
  return [...keys].sort();
}

/** SKUs are compared whole, so one normalised form is enough. */
export const skuNorm = (raw) => norm(raw).replace(/\s/g, '');

/**
 * Searchable tokens from a product name.
 *
 * Split on anything that is not a letter or digit, so "Tata Salt 1kg" yields
 * ['tata', 'salt', '1kg'] and a cashier typing "salt" finds it -- an index on
 * the whole name could only answer prefix-of-the-whole-name, which is not how
 * anyone searches a shop.
 *
 * Single characters are dropped: they match a large fraction of the catalogue
 * and cost index space for a query nobody can use the results of. Digits are
 * kept, because "1kg" and "500" are exactly what gets typed.
 */
export function nameTokens(raw) {
  const text = norm(raw);
  if (!text) return [];
  const tokens = new Set();
  for (const t of text.split(/[^a-z0-9]+/)) {
    if (t.length > 1) tokens.add(t);
  }
  return [...tokens].sort();
}

/**
 * The derived fields for one cached product row.
 *
 * Returns ONLY the derived keys, so the caller decides how to merge them and
 * nothing here can quietly drop a column off a product.
 */
export function productKeys(row) {
  return {
    barcode_keys: barcodeKeys(row?.barcode),
    sku_norm: skuNorm(row?.sku),
    name_tokens: nameTokens(row?.name),
  };
}

/**
 * The prefix range for a token search, as an IndexedDB key range.
 *
 * '￿' is above every character that can appear in a normalised token, so
 * [token, token + '￿'] covers exactly the keys starting with it.
 * Expressed here rather than at the call sites so the trick is written down
 * once with its reason.
 */
export function prefixRange(token, IDBKeyRangeImpl) {
  const t = norm(token);
  if (!t) return null;
  const KR = IDBKeyRangeImpl || (typeof IDBKeyRange !== 'undefined' ? IDBKeyRange : null);
  if (!KR) return null;
  return KR.bound(t, t + '￿');
}
