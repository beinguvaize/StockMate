import { describe, it, expect } from 'vitest';
import { groupPurchasesIntoBills } from '../../../lib/bills';
import {
  datePresets, lineDeltas, creditDays, decorateBills, filterRegister, tabStats,
  bandRegister, allocatePayment, registerCsv, totals, fmtDate,
} from './register';

const TODAY = '2026-10-22';
const row = (id, bill, date, sup, pt, prod, qty, total, paid = 0, extra = {}) => ({
  id, bill_id: bill, date, created_at: `${date}T10:00:00Z`, supplier_id: sup, supplier_name: sup.toUpperCase(),
  payment_type: pt, linked_product_id: prod, quantity: qty, total_amount: total, paid_amount: paid, ...extra,
});

const purchases = [
  row('a1', 'A', '2026-09-01', 'vtc', 'CREDIT', 'fp', 100, 10000),          // 30d credit -> due 1 Oct: overdue 21d
  row('b1', 'B', '2026-10-10', 'mak', 'CREDIT', 'fp', 100, 10500, 2000),   // 15d -> due 25 Oct: part, in 3d
  row('b2', 'B', '2026-10-10', 'mak', 'CREDIT', 'cv', 10, 1500),
  row('c1', 'C', '2026-10-20', 'rjt', 'CASH', 'cv', 10, 1400, 1400),      // paid
  row('d1', 'D', '2026-10-21', 'vtc', 'CREDIT', 'fp', 50, 5000),           // due 20 Nov: later
];
const suppliers = [{ id: 'vtc', credit_days: 30, gstin: '32AAKFV4417L1ZQ' }, { id: 'mak', credit_days: 15 }, { id: 'rjt' }];
const deltas = lineDeltas(purchases);
const bills = decorateBills(groupPurchasesIntoBills(purchases), {
  suppliers, deltas, today: TODAY, taxRateOf: (p) => (p === 'cv' ? 18 : 5),
  payments: [{ purchase_id: 'b1', date: '2026-10-12', method: 'UPI', amount: 2000 }],
});
const by = (id) => bills.find((b) => b.bill_id === id);

describe('a bill state', () => {
  it('dates the due from terms, then supplier credit days, then 30', () => {
    expect(by('A')).toMatchObject({ credit: 30, dueOn: '2026-10-01', dleft: -21, state: 'over', overdue: 10000 });
    expect(by('B')).toMatchObject({ credit: 15, dueOn: '2026-10-25', dleft: 3, state: 'part', overdue: 0, paidOn: '2026-10-12', paidVia: 'UPI' });
    expect(by('C')).toMatchObject({ credit: 0, state: 'paid', paidOn: '2026-10-20' });
    expect(by('D')).toMatchObject({ dueOn: '2026-11-20', state: 'due' });
    expect(creditDays({ payment_type: 'CREDIT', lines: [{ terms_id: 'T' }] }, { credit_days: 30 }, new Map([['T', { days: 7 }]]))).toBe(7);
    expect(creditDays({ payment_type: 'CREDIT', lines: [{}] }, {}, new Map())).toBe(30);
  });

  it('compares each line with the previous purchase of the item', () => {
    // fp: 100 -> 105 (+5%) -> 100 (-4.76%)
    const b = by('B').lines.find((l) => l.id === 'b1');
    expect(b.delta.prevRate).toBe(100);
    expect(b.delta.pct).toBeCloseTo(5, 5);
    expect(by('B').dearer).toBe(1);                       // exactly 5% counts
    expect(by('A').lines[0].delta).toBeNull();            // first purchase
    expect(by('D').lines[0].delta.pct).toBeCloseTo(-4.76, 2);
    expect(by('D').cheaper).toBe(0);                      // under the 5% hint
  });

  it('backs GST out of the inclusive amount at each item rate', () => {
    // 10500 @5% + 1500 @18%
    expect(by('B').tax).toBeCloseTo(10500 - 10500 / 1.05 + 1500 - 1500 / 1.18, 2);
  });
});

describe('tabs and filters', () => {
  it('counts every tab over the filtered set, with overdue as its own figure', () => {
    const s = tabStats(bills);
    expect(s.due).toMatchObject({ count: 3, due: 25000, overdue: 10000 });
    expect(s.over).toMatchObject({ count: 1, due: 10000 });
    expect(s.part).toMatchObject({ count: 1, due: 10000 });
    expect(s.paid).toMatchObject({ count: 1, total: 1400, due: 0 });
    expect(s.all.count).toBe(4);
  });

  it('filters by range, supplier, terms and search across bill no, supplier and items', () => {
    const range = { from: '2026-10-01', to: '2026-10-31' };
    expect(filterRegister(bills, { range }).length).toBe(3);
    expect(filterRegister(bills, { suppliers: ['vtc'] }).map((b) => b.bill_id)).toEqual(['A', 'D']);
    expect(filterRegister(bills, { terms: ['CASH'] }).map((b) => b.bill_id)).toEqual(['C']);
    expect(filterRegister(bills, { q: 'cover', productNameOf: (p) => (p === 'cv' ? '10*13 Cover PKT' : 'Plate') }).map((b) => b.bill_id).sort()).toEqual(['B', 'C']);
  });
});

describe('bands', () => {
  it('puts overdue first under due status, then due in 7 days, then later', () => {
    const bands = bandRegister(bills.filter((b) => b.state !== 'paid'), { group: 'status', sort: 'dueon', today: TODAY });
    expect(bands.map((b) => [b.label, b.count, b.due, b.overdue])).toEqual([
      ['Overdue', 1, 10000, 10000], ['Due in 7 days', 1, 10000, 0], ['Due later', 1, 5000, 0],
    ]);
  });

  it('bands by week, newest first, and suppliers by most owed', () => {
    expect(bandRegister(bills, { group: 'week', sort: 'new', today: TODAY }).map((b) => [b.label, b.count]))
      .toEqual([['This week', 2], ['Week of 5 Oct', 1], ['Week of 31 Aug', 1]]);
    expect(bandRegister(bills, { group: 'supplier', sort: 'new', today: TODAY }).map((b) => [b.key, b.due]))
      .toEqual([['vtc', 15000], ['mak', 10000], ['rjt', 0]]);
  });

  it('subtotals add up to the total', () => {
    const bands = bandRegister(bills, { group: 'month', sort: 'new', today: TODAY });
    expect(bands.reduce((s, b) => s + b.total, 0)).toBe(totals(bills).total);
  });
});

describe('paying', () => {
  it('fills a bill’s lines oldest first and never past what a line owes', () => {
    expect(allocatePayment(by('B').lines, 10000)).toEqual([{ purchaseId: 'b1', amount: 8500 }, { purchaseId: 'b2', amount: 1500 }]);
    expect(allocatePayment(by('B').lines, 3000)).toEqual([{ purchaseId: 'b1', amount: 3000 }]);
    expect(allocatePayment(by('B').lines, 99999).reduce((s, a) => s + a.amount, 0)).toBe(10000);
  });
});

describe('dates and export', () => {
  it('works out FY presets in Indian financial years', () => {
    const p = Object.fromEntries(datePresets(TODAY).map((x) => [x.id, x]));
    expect(p.fy).toMatchObject({ from: '2026-04-01', to: TODAY, sub: '2026–27' });
    expect(p.lfy).toMatchObject({ from: '2025-04-01', to: '2026-03-31' });
    expect(p.q.from).toBe('2026-10-01');
    expect(p.lq).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(p.lmonth).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    const jan = Object.fromEntries(datePresets('2027-01-15').map((x) => [x.id, x]));
    expect(jan.fy.from).toBe('2026-04-01');
    expect(jan.lq).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(jan.lmonth).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    expect(fmtDate('2026-10-20', { weekday: true })).toBe('Tue, 20 Oct 2026');
  });

  it('exports the shown bills with the GST split, quoting commas', () => {
    const csv = registerCsv([by('B')], { productNameOf: (p) => (p === 'cv' ? 'Cover, 10*13' : 'Plate'), voucherNoOf: () => 'PV/2026-27/b1' }).split('\n');
    expect(csv[0]).toMatch(/^Supplier bill no,Voucher no,Bill date/);
    expect(csv[1]).toContain('"Plate x 100; Cover, 10*13 x 10"');
    expect(csv[1]).toContain('Part paid');
    expect(csv[1]).toMatch(/,12000\.00,2000\.00,10000\.00$/);
  });
});
