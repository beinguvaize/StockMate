import { describe, it, expect } from 'vitest';
import {
  reorderOf, statusOf, isLowFixed, filterProducts, inventoryKpis, stockBarParts, initials, avatarTone,
  productPill, classifyMovement, filterMovements, dayMonth, priceListCounts, bulkEditPatch, applyEach, formSteps,
} from './inventoryView';

const P = (o) => ({ id: o.id || o.name, name: 'Item', stock: 0, costPrice: 0, sellingPrice: 0, ...o });

describe('row state', () => {
  it('reads the reorder level from any of its names', () => {
    expect(reorderOf({ lowStockThreshold: '8' })).toBe(8);
    expect(reorderOf({ low_stock_threshold: 4 })).toBe(4);
    expect(reorderOf({})).toBe(0);
  });
  it('uses the reorder level, and 5 when there is none', () => {
    expect(statusOf(0, 10)).toBe('crit');
    expect(statusOf(-2, 10)).toBe('crit');
    expect(statusOf(8, 10)).toBe('low');
    expect(statusOf(8, 0)).toBe('ok');
    expect(statusOf(5, 0)).toBe('low');
  });
  it('the tiles keep the fixed 1 to 5 rule', () => {
    expect(isLowFixed(0)).toBe(false);
    expect(isLowFixed(5)).toBe(true);
    expect(isLowFixed('6')).toBe(false);
  });
  it('the panel pill follows the row rule', () => {
    expect(productPill({ lowStockThreshold: 8 }, 4)).toEqual({ tone: 'warn', label: 'Low · 4 left' });
    expect(productPill({ lowStockThreshold: 8 }, 0).tone).toBe('bad');
    expect(productPill({ lowStockThreshold: 2 }, 4)).toEqual({ tone: 'good', label: 'In stock' });
    expect(productPill({}, 0, { service: true }).label).toBe('Service');
  });
});

describe('filterProducts', () => {
  const list = [
    P({ name: 'Rice 1 kg', sku: 'RICE-1', category: 'Staples', stock: 30 }),
    P({ name: 'Salt 1 kg', sku: 'SALT-1', category: 'Staples', stock: 3 }),
    P({ name: 'Oil 1 L', category: 'Oil', stock: 0, barcode: '890123' }),
    P({ name: 'Repair hour', product_type: 'SERVICE', stock: 0 }),
  ];
  it('searches name, SKU, category and barcode', () => {
    expect(filterProducts(list, { query: 'salt' }).map((p) => p.name)).toEqual(['Salt 1 kg']);
    expect(filterProducts(list, { query: '890123' }).map((p) => p.name)).toEqual(['Oil 1 L']);
    expect(filterProducts(list, { query: 'staples' })).toHaveLength(2);
  });
  it('Low is 1 to 5 and Out is exactly 0, and a service is in neither', () => {
    expect(filterProducts(list, { stock: 'LOW' }).map((p) => p.name)).toEqual(['Salt 1 kg']);
    expect(filterProducts(list, { stock: 'OUT' }).map((p) => p.name)).toEqual(['Oil 1 L']);
  });
  it('filters by type and category', () => {
    expect(filterProducts(list, { type: 'SERVICE' })).toHaveLength(1);
    expect(filterProducts(list, { category: 'Oil' })).toHaveLength(1);
  });
});

describe('inventoryKpis', () => {
  it('values retail over sellable stock only and counts in, low and out', () => {
    const k = inventoryKpis([
      P({ stock: 10, costPrice: 10, sellingPrice: 15, category: 'A' }),
      P({ stock: 2, costPrice: 5, sellingPrice: 8, category: 'A' }),
      P({ stock: 0, costPrice: 5, sellingPrice: 8, category: 'B' }),
      P({ stock: 4, costPrice: 20, sellingPrice: 0, product_type: 'RAW' }),
      P({ stock: 0, sellingPrice: 300, product_type: 'SERVICE' }),
    ]);
    expect(k.stockValue).toBe(100 + 10 + 80);
    expect(k.retailValue).toBe(150 + 16);
    expect(k.rawValue).toBe(80);
    expect(k.marginValue).toBe(166 - 110);
    expect([k.inCount, k.lowStock, k.outOfStock]).toEqual([1, 1, 1]);
    expect(k.totalUnits).toBe(12);
    expect(k.uniqueCats).toBe(2);
  });
  it('splits the bar by share', () => {
    expect(stockBarParts({ inCount: 2, lowStock: 1, outOfStock: 1 })).toEqual({ in: 50, low: 25, out: 25 });
    expect(stockBarParts({})).toBeNull();
  });
});

describe('avatars', () => {
  it('takes two initials', () => {
    expect(initials('Aashirvaad Atta 5 kg')).toBe('AA');
    expect(initials('Toor')).toBe('TO');
    expect(initials('')).toBe('?');
  });
  it('gives the same tint to the same key', () => {
    expect(avatarTone('Staples')).toBe(avatarTone('Staples'));
    expect(avatarTone('x')).toBeGreaterThanOrEqual(1);
    expect(avatarTone('x')).toBeLessThanOrEqual(6);
  });
});

describe('stock history', () => {
  it('tells adjustments and transfers apart by the reason', () => {
    expect(classifyMovement({ type: 'OUT', reason: 'Manual adjustment: damaged' })).toBe('ADJUST');
    expect(classifyMovement({ type: 'IN', reason: 'Transfer from godown' })).toBe('TRANSFER');
    expect(classifyMovement({ type: 'OUT', reason: 'Sale SAL-1' })).toBe('OUT');
    expect(classifyMovement({ type: 'IN', reason: 'Purchase PUR-1' })).toBe('IN');
  });
  it('searches product and reason, and filters by type', () => {
    const log = [
      { product_id: 'p1', type: 'OUT', reason: 'Sale SAL-1' },
      { product_id: 'p2', type: 'IN', reason: 'Purchase PUR-1' },
    ];
    const nameOf = (id) => ({ p1: 'Rice', p2: 'Salt' }[id]);
    expect(filterMovements(log, { query: 'rice', nameOf })).toHaveLength(1);
    expect(filterMovements(log, { query: 'pur-1', nameOf })).toHaveLength(1);
    expect(filterMovements(log, { type: 'IN', nameOf })).toHaveLength(1);
  });
  it('shows the day in the shop time zone', () => {
    expect(dayMonth('2026-11-08')).toBe('08 Nov');
    // 20:00 UTC on the 25th is already the 26th in Kolkata.
    expect(dayMonth('2026-11-25T20:00:00Z')).toBe('26 Nov');
    expect(dayMonth(null)).toBe('—');
  });
});

describe('priceListCounts', () => {
  it('counts distinct products per tier', () => {
    const c = priceListCounts([
      { tier: 'WHOLESALE', product_id: 'a', min_qty: 1 },
      { tier: 'WHOLESALE', product_id: 'a', min_qty: 10 },
      { tier: 'WHOLESALE', product_id: 'b', min_qty: 1 },
      { tier: 'DISTRIBUTOR', product_id: 'a', min_qty: 1 },
    ]);
    expect(c).toEqual({ WHOLESALE: 2, DISTRIBUTOR: 1, total: 3 });
  });
});

describe('bulkEditPatch (moved unchanged)', () => {
  const blank = { category: '', pricePct: '', sellPrice: '', reorder: '', gstRate: '' };
  it('leaves blank fields alone', () => {
    expect(bulkEditPatch({ sellingPrice: 100 }, blank)).toEqual({});
  });
  it('applies a percentage rounded to paise', () => {
    expect(bulkEditPatch({ sellingPrice: 99.99 }, { ...blank, pricePct: '5' })).toEqual({ sellingPrice: 104.99 });
    expect(bulkEditPatch({ sellingPrice: 100 }, { ...blank, pricePct: '-10' })).toEqual({ sellingPrice: 90 });
  });
  it('sets category, reorder level, a fixed price and GST, never stock or cost', () => {
    const u = bulkEditPatch({ sellingPrice: 50, stock: 3, costPrice: 40 }, { category: 'Oil', pricePct: '', sellPrice: '60', reorder: '0', gstRate: '18' });
    expect(u).toEqual({ category: 'Oil', sellingPrice: 60, lowStockThreshold: 0, taxRate: 18 });
  });
});

describe('applyEach', () => {
  it('keeps each failure with its reason and carries on', async () => {
    const r = await applyEach([1, 2, 3], async (n) => {
      if (n === 2) return { error: new Error('permission denied') };
      if (n === 3) throw new Error('Failed to fetch');
      return { error: null };
    });
    expect(r.done).toEqual([1]);
    expect(r.failed.map((f) => [f.item, f.error.message])).toEqual([[2, 'permission denied'], [3, 'Failed to fetch']]);
  });
});

describe('formSteps', () => {
  it('marks details, pricing and photo', () => {
    const s = formSteps({ name: 'Rice', sku: 'R-1' }, { pricingError: null, hasPhoto: false });
    expect(s.map((x) => x.state)).toEqual(['done', 'done', 'done', 'optional']);
    const t = formSteps({ name: '', sku: '' }, { pricingError: 'Cost price is required', hasPhoto: true });
    expect(t.map((x) => x.state)).toEqual(['todo', 'todo', 'done', 'done']);
  });
});
