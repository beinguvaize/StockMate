import { describe, it, expect } from 'vitest';
import { buildAging, ageBucket, daysUnpaid } from './receivableAging';

const today = '2026-11-04';
const sale = (id, client, date, unpaid) => ({ sale_id: id, client_id: client, client_name: client ? client.toUpperCase() : 'No customer on the bill', phone: '', sale_date: date, unpaid });

describe('ageBucket', () => {
  it('splits on the last day of each bucket', () => {
    expect([0, 30, 31, 60, 61, 90, 91, 120, 121].map(ageBucket))
      .toEqual(['0-30', '0-30', '31-60', '31-60', '61-90', '61-90', '91-120', '91-120', '120+']);
  });
  it('counts whole days across a month end and never goes negative', () => {
    expect(daysUnpaid('2026-10-31', today)).toBe(4);
    expect(daysUnpaid('2026-11-10', today)).toBe(0);
  });
});

describe('buildAging', () => {
  const unpaid = [
    sale('S1', 'a', '2026-11-01', '100.50'),
    sale('S2', 'a', '2026-06-01', '200'),
    sale('S3', 'b', '2026-09-01', 50),
    sale('S4', null, '2026-11-02', 10),
  ];
  const a = buildAging(unpaid, [{ outstanding_balance: 300.5 }, { outstanding_balance: 50 }, { outstanding_balance: -50 }], today);

  it('adds what is left to pay per customer, most owed first', () => {
    expect(a.customers.map((c) => [c.client_name, c.total, c.bills, c.oldest])).toEqual([
      ['A', 300.5, 2, 156], ['B', 50, 1, 64], ['No customer on the bill', 10, 1, 2],
    ]);
  });
  it('puts every rupee in exactly one bucket', () => {
    expect(a.totals).toEqual({ '0-30': 110.5, '31-60': 0, '61-90': 50, '91-120': 0, '120+': 200 });
    expect(a.total).toBe(360.5);
    expect(a.over30).toBe(250);
    expect(a.over90).toBe(200);
  });
  it('states the gap to client balances instead of hiding it', () => {
    expect(a.outstanding).toBe(300.5);
    expect(a.difference).toBe(60);
  });
  it('lists the oldest bills first, and copes with nothing owed', () => {
    expect(a.bills.map((b) => b.sale_id)).toEqual(['S2', 'S3', 'S1', 'S4']);
    expect(buildAging([], [], today)).toMatchObject({ total: 0, difference: 0, customers: [], bills: [] });
  });
});
