/**
 * Resolving a scan, without reading the catalogue to do it.
 * ==========================================================================
 *
 * What this replaces, at InvoiceBuilder.jsx:425-442:
 *
 *   products.find(p => p.barcode && p.barcode.toLowerCase() === q.toLowerCase())
 *   products.find(p => p.sku     && p.sku.toLowerCase()     === q.toLowerCase())
 *
 * Two linear passes over the whole catalogue, each lowercasing BOTH sides on
 * every candidate, run once per scan. At 151 products nobody notices. At
 * 50,000 it is 100,000 string allocations between the beep and the line
 * appearing, on a counter PC, while the next customer waits.
 *
 * The fix is not a faster loop, it is not looping: build the lookup once when
 * the catalogue changes and then answer each scan with a Map hit.
 *
 * WHY THIS IS A PURE FUNCTION OVER AN ARRAY AND NOT A DATABASE CALL
 *
 * The local IndexedDB catalogue (offline/db.js) has exactly these indexes and
 * will serve this once the rollout reaches a tenant. But the array is already
 * in memory on every surface, today, for every tenant — so building a Map from
 * it costs one pass per catalogue change and fixes the scan for everyone
 * immediately, rollout or not. The two are the same shape on purpose: moving a
 * caller to the database later is changing where `resolve` reads from, not
 * what it means.
 *
 * It also fixes a real miss, not only a slow one. See BARCODE FORMS below.
 */

import { barcodeKeys, skuNorm } from '../offline/normalise.js';

/**
 * Build the lookup for one catalogue.
 *
 * BARCODE FORMS. A product entered with a 13-digit EAN does not match the
 * 12-digit UPC-A its label actually carries; they differ by one leading zero.
 * The old exact-string compare therefore reported "not in the catalog" for an
 * item sitting on the shelf, which to a cashier is indistinguishable from the
 * catalogue truncation that was fixed separately. Every form a product answers
 * to is indexed, via the same normalise.js rules the local database uses, so
 * the two cannot disagree about what a scan means.
 *
 * FIRST ENTRY WINS on a duplicate code. Two products sharing a barcode is a
 * data problem that wants fixing in inventory, and silently preferring the
 * later one would make which product gets sold depend on catalogue ordering.
 * Duplicates are returned so a caller can say so out loud.
 */
export function buildCatalogIndex(products = []) {
  const byBarcode = new Map();
  const bySku = new Map();
  const byId = new Map();
  const duplicateCodes = new Set();

  for (const p of products) {
    if (!p?.id) continue;
    byId.set(p.id, p);

    for (const key of barcodeKeys(p.barcode)) {
      if (byBarcode.has(key)) duplicateCodes.add(key);
      else byBarcode.set(key, p);
    }

    const sku = skuNorm(p.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, p);
  }

  return { byBarcode, bySku, byId, duplicateCodes, size: products.length };
}

/**
 * Resolve what the scanner (or the cashier) just typed.
 *
 * Barcode before SKU, because that is the order of frequency at a counter and
 * because a scanner emits a barcode. Returns null rather than throwing on a
 * miss: "not found" is an ordinary outcome at a till and the caller has a
 * better message for it than this file does.
 */
export function resolveScan(index, code) {
  if (!index || !code) return null;
  const keys = barcodeKeys(code);
  for (const key of keys) {
    const hit = index.byBarcode.get(key);
    if (hit) return hit;
  }
  const sku = skuNorm(code);
  if (sku) {
    const hit = index.bySku.get(sku);
    if (hit) return hit;
  }
  return null;
}

/**
 * The weighing-scale PLU, matched against barcode OR sku.
 *
 * Shops put the PLU in whichever field they already use, which is why this
 * looks in both. Separate from resolveScan because the code it is given is NOT
 * what was scanned: it is the item part extracted from a scale label, and
 * keeping the two apart stops a future change to one quietly altering the
 * other.
 */
export function resolvePlu(index, itemCode) {
  if (!index || !itemCode) return null;
  const code = String(itemCode);
  const byBarcode = index.byBarcode.get(skuNorm(code));
  if (byBarcode) return byBarcode;
  return index.bySku.get(skuNorm(code)) || null;
}
