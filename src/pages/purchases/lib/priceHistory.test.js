import { describe, it, expect } from 'vitest';
import { priceHistory } from './priceHistory';

const pur = (id, date, supplier, quantity, total, extra = {}) => ({
  id, date, supplier_id: supplier, supplier_name: supplier, linked_product_id: 'P1', quantity, total_amount: total, ...extra,
});

describe('priceHistory', () => {
  const purchases = [
    pur('A', '2026-05-01', 'Madeena', 100, 782),       // 7.82
    pur('B', '2026-06-10', 'Vtc', 100, 900),           // 9.00
    pur('C', '2026-07-02', 'Madeena', 50, 457.5),      // 9.15
    pur('D', '2026-07-03', 'Madeena', 10, 70, { deleted_at: '2026-07-04' }),
    pur('E', '2026-07-05', 'Vtc', 10, 70, { status: 'CANCELLED' }),
    pur('F', '2026-07-06', 'Vtc', 10, 70, { linked_product_id: 'P2' }),
  ];
  const h = priceHistory(purchases, 'P1');

  it('lists only real purchases of the item, newest first, each against the one before', () => {
    expect(h.rows.map((r) => [r.id, r.unitCost, r.change, r.pct])).toEqual([
      ['C', 9.15, 0.15, 1.67],
      ['B', 9, 1.18, 15.09],
      ['A', 7.82, null, null],
    ]);
  });

  it('sums up the range, averaging by quantity', () => {
    // (782 + 900 + 457.5) / 250
    expect(h.stats).toEqual({ last: 9.15, lowest: 7.82, highest: 9.15, average: 8.56, count: 3, firstDate: '2026-05-01', lastDate: '2026-07-02' });
  });

  it("ranks suppliers by their latest price and marks the cheapest", () => {
    expect(h.suppliers.map((s) => [s.supplierName, s.lastCost, s.count, !!s.cheapest]))
      .toEqual([['Vtc', 9, 1, true], ['Madeena', 9.15, 2, false]]);
  });

  it('has nothing to say about an item never bought', () => {
    expect(priceHistory(purchases, 'NOPE')).toEqual({ rows: [], stats: null, suppliers: [] });
  });

  it('does not call a lone supplier the cheapest', () => {
    expect(priceHistory([purchases[0]], 'P1').suppliers[0].cheapest).toBeUndefined();
  });
});
