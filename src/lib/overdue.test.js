import { describe, it, expect } from 'vitest';
import { billDaysOld, clientAgingByBill, agingScaledTo, agingTotal, overdueAmount } from './overdue';

// 26 Nov 2026, noon in the shop's zone (tests run in Asia/Kolkata).
const NOW = new Date(2026, 10, 26, 12).getTime();

describe('billDaysOld (phone _daysSince)', () => {
  it('counts whole days from the bill date, local midnight', () => {
    expect(billDaysOld('2026-11-26', NOW)).toBe(0);
    expect(billDaysOld('2026-11-25', NOW)).toBe(1);
    expect(billDaysOld('2026-10-27', NOW)).toBe(30);
    expect(billDaysOld('2026-10-26', NOW)).toBe(31);
  });
  it('never goes below 0 and reads a missing or bad date as 0', () => {
    expect(billDaysOld('2026-12-01', NOW)).toBe(0);
    expect(billDaysOld(null, NOW)).toBe(0);
    expect(billDaysOld('not a date', NOW)).toBe(0);
  });
});

describe('clientAgingByBill (phone clientAging)', () => {
  const sales = [
    { shopId: 'a', date: '2026-11-20', totalAmount: 100, paidAmount: 0 },    // 6 days
    { shopId: 'a', date: '2026-10-27', totalAmount: 200, paidAmount: 50 },   // 30 days → 0-30
    { shopId: 'a', date: '2026-10-26', totalAmount: 300, paidAmount: 0 },    // 31 days → 31-60
    { shopId: 'a', date: '2026-09-01', totalAmount: 400, paidAmount: 0 },    // 86 days → 60+
    { shopId: 'a', date: '2026-08-01', totalAmount: 500, paidAmount: 0 },    // 117 days → 60+, 90+
    { shopId: 'a', date: '2026-08-01', totalAmount: 900, paidAmount: 0, paymentStatus: 'PAID' },
    { shopId: 'a', date: '2026-08-01', totalAmount: 900, paidAmount: 0, paymentStatus: 'voided' },
    { shopId: 'a', date: '2026-08-01', totalAmount: 900, paidAmount: 0, paymentStatus: 'FAILED' },
    { shopId: 'a', date: '2026-08-01', totalAmount: 900, paidAmount: 0, status: 'VOIDED' },
    { shopId: 'a', date: '2026-08-01', totalAmount: 900, paidAmount: 0, voided_at: '2026-08-02' },
    { shopId: 'a', date: '2026-08-01', totalAmount: 100, paidAmount: 100 },  // nothing unpaid
    { shopId: null, date: '2026-08-01', totalAmount: 900, paidAmount: 0 },
    { shopId: 'b', date: '2026-11-01', totalAmount: 50, paidAmount: 80 },    // overpaid: no bill
  ];
  const aging = clientAgingByBill(sales, NOW);

  it('bands each bill by what is still unpaid on it', () => {
    expect(aging.a).toEqual({ d0to30: 250, d31to60: 300, d60plus: 900, d90plus: 500, unpaidBills: 5, oldestDays: 117 });
    expect(agingTotal(aging.a)).toBe(1450);
  });
  it('leaves out clients with no unpaid bill', () => {
    expect(aging.b).toBeUndefined();
    expect(Object.keys(aging)).toEqual(['a']);
  });
});

describe('agingScaledTo / overdueAmount', () => {
  const a = { d0to30: 200, d31to60: 300, d60plus: 500, d90plus: 100, unpaidBills: 3, oldestDays: 95 };

  it('scales the bands to the balance, keeping proportions', () => {
    const s = agingScaledTo(a, 500);
    expect(s.d0to30).toBe(100);
    expect(s.d31to60).toBe(150);
    expect(s.d60plus).toBe(250);
    expect(s.d90plus).toBe(50);
    expect(s.unpaidBills).toBe(3);
  });
  it('leaves the bands alone when there is nothing to scale to', () => {
    expect(agingScaledTo(a, 0)).toBe(a);
    expect(agingScaledTo(null, 100)).toBeNull();
  });
  it('is the over-30-days part, scaled to the balance', () => {
    expect(overdueAmount(a, 1000)).toBe(800);
    expect(overdueAmount(a, 2000)).toBe(1600);
  });
  it('is 0 when the client owes half a rupee or less, or has no aged bill', () => {
    expect(overdueAmount(a, 0.5)).toBe(0);
    expect(overdueAmount(a, -100)).toBe(0);
    expect(overdueAmount(null, 1000)).toBe(0);
    expect(overdueAmount({ ...a, d31to60: 0, d60plus: 0 }, 1000)).toBe(0);
  });
});
