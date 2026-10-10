import { describe, it, expect } from 'vitest';
import { buildCatalogIndex, resolveScan, resolvePlu } from './catalog.js';

/**
 * What happens between the beep and the line appearing.
 * ==========================================================================
 *
 * The behaviour being replaced is two `products.find()` passes with a
 * `toLowerCase()` on both sides of every comparison. These tests pin what the
 * till must still do, plus the two things it could not do before: resolve a
 * UPC label against an EAN product, and answer in constant time.
 */

const CATALOGUE = [
  { id: 'P1', name: 'Tata Salt 1kg', barcode: '8901234567890', sku: 'SKU-1' },
  { id: 'P2', name: 'Amul Butter', barcode: '0012345678905', sku: 'sku-2' },
  { id: 'P3', name: 'Loose rice', barcode: null, sku: 'RICE' },
  { id: 'P4', name: 'Weighed item', barcode: '21', sku: 'PLU-21' },
];

const idx = () => buildCatalogIndex(CATALOGUE);

describe('resolving a scan', () => {
  it('finds a product by its exact barcode', () => {
    expect(resolveScan(idx(), '8901234567890')?.id).toBe('P1');
  });

  it('ignores case and surrounding whitespace, as the old scan did', () => {
    expect(resolveScan(idx(), '  SKU-1 ')?.id).toBe('P1');
    expect(resolveScan(idx(), 'sku-2')?.id).toBe('P2');
    expect(resolveScan(idx(), 'SKU-2')?.id).toBe('P2');
  });

  it('resolves a 12-digit UPC label against a 13-digit EAN product', () => {
    // The label on the butter reads 12345678905; the product was entered as
    // 0012345678905. The old exact compare missed it and told the cashier the
    // item was not in the catalog while it sat on the shelf.
    expect(resolveScan(idx(), '12345678905')?.id).toBe('P2');
  });

  it('prefers a barcode over a SKU when a code could be either', () => {
    // A scanner emits barcodes; that is the order of frequency at a counter.
    const index = buildCatalogIndex([
      { id: 'A', name: 'Barcode owner', barcode: '555', sku: 'other' },
      { id: 'B', name: 'Sku owner', barcode: '999', sku: '555' },
    ]);
    expect(resolveScan(index, '555')?.id).toBe('A');
  });

  it('returns null on a miss rather than throwing', () => {
    // "Not found" is an ordinary outcome at a till; the caller has a better
    // message for it than this file does.
    expect(resolveScan(idx(), 'nothing-like-this')).toBeNull();
    expect(resolveScan(idx(), '')).toBeNull();
    expect(resolveScan(null, '123')).toBeNull();
  });

  it('does not match a product that has no barcode on an empty scan', () => {
    // P3 has barcode null. A key of '' would make it answer to any blank code.
    const index = idx();
    expect(index.byBarcode.has('')).toBe(false);
  });
});

describe('duplicate codes', () => {
  it('keeps the first product and reports the clash', () => {
    // Two products sharing a barcode is a data problem to fix in inventory.
    // Preferring the later one would make which product gets SOLD depend on
    // catalogue ordering, which is the worst of the available behaviours.
    const index = buildCatalogIndex([
      { id: 'FIRST', name: 'First', barcode: '777' },
      { id: 'SECOND', name: 'Second', barcode: '777' },
    ]);
    expect(resolveScan(index, '777')?.id).toBe('FIRST');
    expect([...index.duplicateCodes]).toContain('777');
  });
});

describe('the weighing-scale PLU', () => {
  it('matches the item code against barcode or sku', () => {
    expect(resolvePlu(idx(), '21')?.id).toBe('P4');
    expect(resolvePlu(idx(), 'PLU-21')?.id).toBe('P4');
    expect(resolvePlu(idx(), 'RICE')?.id).toBe('P3');
  });

  it('returns null for an unknown PLU', () => {
    expect(resolvePlu(idx(), '9999')).toBeNull();
    expect(resolvePlu(idx(), '')).toBeNull();
  });
});

describe('cost', () => {
  it('answers a scan without touching the number of products', () => {
    // The point of the change. Build once, then every scan is a Map hit --
    // so resolving against 50,000 products must not be meaningfully slower
    // than against 50, and must not allocate per candidate.
    const big = Array.from({ length: 50_000 }, (_, i) => ({
      id: `P${i}`, name: `Product ${i}`,
      barcode: String(8900000000000 + i), sku: `SKU-${i}`,
    }));
    const index = buildCatalogIndex(big);

    expect(index.size).toBe(50_000);
    expect(resolveScan(index, '8900000049999')?.id).toBe('P49999');
    expect(resolveScan(index, 'sku-49999')?.id).toBe('P49999');

    // A scan of the LAST product is the worst case for the old linear find.
    const t0 = performance.now();
    for (let i = 0; i < 1000; i += 1) resolveScan(index, '8900000049999');
    const perScan = (performance.now() - t0) / 1000;
    // Deliberately loose: this is a shape assertion, not a benchmark. A
    // regression to a linear scan over 50k would be ~1000x this.
    expect(perScan).toBeLessThan(0.5);
  });
});
