import { describe, it, expect } from 'vitest';
import { rankTopSelling } from './topSelling';

const sale = (items, over = {}) => ({ id: Math.random().toString(36), items, ...over });
const line = (id, name, quantity, rate) => ({ id, name, quantity, rate });

describe('rankTopSelling', () => {
  const sales = [
    sale([line('a', 'Item A', 2, 100), line('b', 'Item B', 10, 5)]),
    sale([line('a', 'Item A', 1, 100), line('c', 'Item C', 1, 250)]),
    sale([line('b', 'Item B', 50, 5)], { status: 'VOIDED' }),
    sale([line('c', 'Item C', 9, 250)], { voided_at: '2026-11-26T10:00:00Z' }),
  ];

  it('ranks by value (quantity × rate), countable sales only', () => {
    const r = rankTopSelling(sales);
    expect(r.rows.map(x => [x.name, x.qty, x.value])).toEqual([
      ['Item A', 3, 300], ['Item C', 1, 250], ['Item B', 10, 50],
    ]);
    expect(r.rows.map(x => x.rank)).toEqual([1, 2, 3]);
    expect(r.itemCount).toBe(3);
    expect(r.totalValue).toBe(600);
  });

  it('can rank by quantity instead', () => {
    expect(rankTopSelling(sales, { by: 'quantity' }).rows.map(x => x.name)).toEqual(['Item B', 'Item A', 'Item C']);
  });

  it('limits the rows and sizes bars against the top row', () => {
    const r = rankTopSelling(sales, { limit: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].share).toBe(100);
    expect(r.rows[1].share).toBeCloseTo(250 / 300 * 100);
    expect(r.shownValue).toBe(550);
  });

  it('nothing sold is an empty list', () => {
    expect(rankTopSelling([])).toMatchObject({ rows: [], itemCount: 0, totalValue: 0 });
  });

  it('keys a line with no product id by its name', () => {
    const r = rankTopSelling([sale([{ name: 'Loose item', quantity: 2, rate: 10 }]), sale([{ name: 'Loose item', quantity: 1, rate: 10 }])]);
    expect(r.rows).toEqual([expect.objectContaining({ name: 'Loose item', qty: 3, value: 30 })]);
  });
});
