import { describe, it, expect } from 'vitest';
import { lineUnitCost, priceChanges, priceKeepingMargin } from './priceChange';

const cover = { id: 'P1', name: '10*13 Cover PKT', unit: 'pkt', costPrice: 7.82, sellingPrice: 8.5 };
const salt = { id: 'P2', name: 'Salt', unit: 'pc', costPrice: 20, sellingPrice: 25, secondary_unit: 'box', conversion_factor: 10 };
const line = (id, quantity, total_amount, extra = {}) => ({ linked_product_id: id, quantity, total_amount, ...extra });

describe('priceChanges', () => {
  it('flags an increase, with the margin it leaves', () => {
    const [c] = priceChanges([line('P1', 100, 915)], [cover]);
    expect(c).toMatchObject({ direction: 'UP', oldCost: 7.82, newCost: 9.15, pct: 17.01, marginAfter: -7.65, sellsAtLoss: true });
  });

  it('flags a decrease', () => {
    const [c] = priceChanges([line('P1', 100, 700)], [cover]);
    expect(c).toMatchObject({ direction: 'DOWN', newCost: 7, sellsAtLoss: false });
  });

  it('stays quiet when the price is unchanged', () => {
    expect(priceChanges([line('P1', 100, 782)], [cover])).toEqual([]);
  });

  it('compares a packet purchase per piece, not per packet', () => {
    // 3 boxes of 10 at Rs 200 a box = Rs 20 a piece: no change.
    expect(priceChanges([line('P2', 3, 600, { buyUnit: 'ALT' })], [salt])).toEqual([]);
    expect(lineUnitCost(line('P2', 3, 660, { buyUnit: 'ALT' }), salt)).toBe(22);
  });

  it('says nothing about a first purchase or an incomplete line', () => {
    expect(priceChanges([line('P1', 0, 900), line('P1', 10, '')], [cover])).toEqual([]);
    expect(priceChanges([line('P1', 10, 90)], [{ ...cover, costPrice: 0 }])).toEqual([]);
  });

  it('judges a product on several lines by its dearest line, and lists increases first', () => {
    const out = priceChanges([line('P1', 10, 80), line('P1', 10, 95), line('P2', 1, 15)], [cover, salt]);
    expect(out.map((c) => [c.productId, c.direction, c.newCost])).toEqual([['P1', 'UP', 9.5], ['P2', 'DOWN', 15]]);
  });
});

describe('priceKeepingMargin', () => {
  it('keeps the old margin, rounded up to 50 paise', () => {
    // Salt: 20 -> 22 cost, 20 % margin at Rs 25 -> 27.50.
    const [c] = priceChanges([line('P2', 1, 22)], [salt]);
    expect(priceKeepingMargin(c)).toBe(27.5);
  });

  it('has nothing to keep when there was no margin', () => {
    expect(priceKeepingMargin({ sellingPrice: 0, marginBefore: null, newCost: 5 })).toBeNull();
  });
});
