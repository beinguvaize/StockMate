import { describe, it, expect } from 'vitest';
import { PRICE_CHECK_PCT, lastPurchaseCost, priceCheck, priceCheckMessage, shortDate } from './priceCheck';

const pur = (id, date, quantity, total, extra = {}) => ({
  id, date, created_at: `${date}T10:00:00Z`, linked_product_id: 'P1', quantity, total_amount: total, ...extra,
});
const products = [
  { id: 'P1', name: '10*13 Cover PKT', unit: 'pcs' },
  { id: 'P2', name: 'Box', unit: 'pcs', secondary_unit: 'pkt', conversion_factor: 10 },
];
const line = (total, qty = 100, extra = {}) => ({ key: 'L1', linked_product_id: 'P1', quantity: String(qty), total_amount: String(total), ...extra });

describe('lastPurchaseCost', () => {
  it('takes the newest real purchase, by date then entry time', () => {
    const rows = [
      pur('A', '2026-10-01', 100, 600),
      pur('B', '2026-10-29', 100, 590),
      pur('C', '2026-10-29', 100, 610, { created_at: '2026-10-29T09:00:00Z' }),   // same day, entered earlier
      pur('D', '2026-11-01', 100, 900, { deleted_at: '2026-11-02' }),
      pur('E', '2026-11-02', 100, 900, { status: 'CANCELLED' }),
      pur('F', '2026-11-03', 100, 900, { linked_product_id: 'P2' }),
    ];
    expect(lastPurchaseCost(rows, 'P1')).toEqual({ id: 'B', unitCost: 5.9, date: '2026-10-29' });
  });

  it('can leave rows out', () => {
    const rows = [pur('A', '2026-10-01', 100, 600), pur('B', '2026-10-29', 100, 590)];
    expect(lastPurchaseCost(rows, 'P1', ['B']).id).toBe('A');
  });

  it('is null for an item never bought', () => {
    expect(lastPurchaseCost([pur('A', '2026-10-01', 100, 600)], 'NOPE')).toBeNull();
  });
});

describe('priceCheck', () => {
  const history = [pur('A', '2026-10-01', 100, 600), pur('B', '2026-10-29', 100, 590)];   // last: 5.90

  it('asks about the wrong-product case from the shop', () => {
    const [f] = priceCheck([line(915)], history, products);
    expect(f).toMatchObject({ key: 'L1', name: '10*13 Cover PKT', newCost: 9.15, lastCost: 5.9, direction: 'higher', pct: 55 });
    expect(priceCheckMessage(f, new Date('2026-11-11')))
      .toBe('10*13 Cover PKT: ₹9.15 per unit. Last bought at ₹5.90 on 29 Oct, 55% higher.');
  });

  it('says lower for a drop', () => {
    const [f] = priceCheck([line(400)], history, products);        // 4.00 vs 5.90
    expect(f).toMatchObject({ direction: 'lower', pct: 32 });
  });

  describe('at the edge', () => {
    const last5 = [pur('A', '2026-10-29', 100, 500)];               // 5.00
    it('exactly 20% up or down is not asked about', () => {
      expect(PRICE_CHECK_PCT).toBe(20);
      expect(priceCheck([line(600)], last5, products)).toEqual([]);  // 6.00, +20%
      expect(priceCheck([line(400)], last5, products)).toEqual([]);  // 4.00, -20%
    });
    it('just past 20% is', () => {
      expect(priceCheck([line(601)], last5, products)).toHaveLength(1);   // 6.01
      expect(priceCheck([line(399)], last5, products)).toHaveLength(1);   // 3.99
    });
  });

  it('has nothing to compare with on a first purchase', () => {
    expect(priceCheck([line(915)], [], products)).toEqual([]);
  });

  it('skips a last cost of 0', () => {
    expect(priceCheck([line(915)], [pur('A', '2026-10-29', 100, 0)], products)).toEqual([]);
  });

  it('compares an edited line with the purchase before it, not with itself', () => {
    // B is the line being edited; its own Rs 9.15 must not be the "last" price.
    const rows = [pur('A', '2026-10-01', 100, 590), pur('B', '2026-11-05', 100, 915)];
    const [f] = priceCheck([line(915, 100, { id: 'B' })], rows, products);
    expect(f).toMatchObject({ lastCost: 5.9, lastDate: '2026-10-01', pct: 55 });
    // Without excluding it, the line would match itself and never be asked about.
    expect(priceCheck([line(915)], rows, products)).toEqual([]);
  });

  it('compares a packet line per piece', () => {
    const rows = [pur('A', '2026-10-29', 100, 500, { linked_product_id: 'P2' })];       // 5.00 a piece
    const pkt = { key: 'L2', linked_product_id: 'P2', quantity: '2', total_amount: '100', buyUnit: 'ALT' };
    expect(priceCheck([pkt], rows, products)).toEqual([]);                              // 100 / 20 = 5.00
  });

  it('lists every flagged line in bill order', () => {
    const rows = [...history, pur('X', '2026-10-29', 10, 50, { linked_product_id: 'P2' })];
    const flagged = priceCheck([
      line(915, 100, { key: 'a' }),
      { key: 'b', linked_product_id: 'P2', quantity: '10', total_amount: '52' },       // 5.20 vs 5.00: fine
      { key: 'c', linked_product_id: 'P2', quantity: '10', total_amount: '20' },       // 2.00 vs 5.00
    ], rows, products);
    expect(flagged.map((f) => [f.key, f.direction, f.pct])).toEqual([['a', 'higher', 55], ['c', 'lower', 60]]);
  });
});

describe('shortDate', () => {
  it('adds the year only when it is not this year', () => {
    expect(shortDate('2026-10-29', new Date('2026-11-11'))).toBe('29 Oct');
    expect(shortDate('2025-03-04', new Date('2026-11-11'))).toBe('4 Mar 2025');
  });
});
