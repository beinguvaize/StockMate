import { describe, it, expect } from 'vitest';
import { receivedOnDay, receivableOnDay, settledLater } from './dayBook';

/**
 * The defect these pin: paidAmount is a running total, so money a customer
 * handed over in August was being reported as cash taken in July.
 */

const sale = (o) => ({
  date: '2026-07-11', updated_at: '2026-07-11T10:00:00Z',
  totalAmount: 1000, paidAmount: 0,
  paymentMethod: 'CREDIT', paymentStatus: 'PENDING', ...o,
});

describe('receivedOnDay — a credit sale settled later', () => {
  it('puts nothing in the drawer on the day of the sale', () => {
    // SAL-C81614F2: rung up 11 Jul, paidAmount written 1 Aug. The DayBook
    // reported Rs 15,000 of cash on 11 July that arrived three weeks later.
    const s = sale({ totalAmount: 5670, paidAmount: 5670,
                     paymentStatus: 'PAID', updated_at: '2026-08-01T13:11:41Z' });
    expect(receivedOnDay(s)).toBe(0);
  });

  it('leaves the whole amount receivable on that day', () => {
    const s = sale({ totalAmount: 5670, paidAmount: 5670,
                     paymentStatus: 'PAID', updated_at: '2026-08-01T13:11:41Z' });
    expect(receivableOnDay(s)).toBeCloseTo(5670, 2);
  });

  it('applies to a part settlement too', () => {
    const s = sale({ totalAmount: 1000, paidAmount: 400,
                     paymentStatus: 'PARTIAL', updated_at: '2026-07-30T09:00:00Z' });
    expect(receivedOnDay(s)).toBe(0);
    expect(receivableOnDay(s)).toBeCloseTo(1000, 2);
  });
});

describe('receivedOnDay — money genuinely taken at the counter', () => {
  it('counts a same-day part payment on a credit sale', () => {
    // The reason the rule is a date comparison and not "ignore credit sales":
    // a cashier taking Rs 200 down must still show in the day's takings.
    const s = sale({ totalAmount: 1000, paidAmount: 200, paymentStatus: 'PARTIAL' });
    expect(receivedOnDay(s)).toBeCloseTo(200, 2);
    expect(receivableOnDay(s)).toBeCloseTo(800, 2);
  });

  it('counts a same-day credit sale settled in full', () => {
    const s = sale({ totalAmount: 1000, paidAmount: 1000, paymentStatus: 'PAID' });
    expect(receivedOnDay(s)).toBeCloseTo(1000, 2);
  });

  it('counts a cash sale in full', () => {
    const s = sale({ paymentMethod: 'CASH', paymentStatus: 'PAID', paidAmount: 1000 });
    expect(receivedOnDay(s)).toBeCloseTo(1000, 2);
  });

  it('counts a part-paid cash sale at what was handed over', () => {
    const s = sale({ paymentMethod: 'CASH', paymentStatus: 'PARTIAL',
                     totalAmount: 320, paidAmount: 200 });
    expect(receivedOnDay(s)).toBeCloseTo(200, 2);
    expect(receivableOnDay(s)).toBeCloseTo(120, 2);
  });

  it('treats an old cash sale with no paidAmount as fully received', () => {
    // Predates paidAmount being tracked; a cash sale with no figure was taken.
    const s = sale({ paymentMethod: 'CASH', paymentStatus: 'PENDING', paidAmount: null });
    expect(receivedOnDay(s)).toBeCloseTo(1000, 2);
  });

  it('does NOT assume a credit sale with no paidAmount was received', () => {
    const s = sale({ paidAmount: null });
    expect(receivedOnDay(s)).toBe(0);
  });

  it('a non-credit sale settled later still counts — only credit is deferred', () => {
    // A cash sale's money was taken at the counter whatever was edited after.
    const s = sale({ paymentMethod: 'CASH', paymentStatus: 'PAID',
                     paidAmount: 1000, updated_at: '2026-08-01T00:00:00Z' });
    expect(receivedOnDay(s)).toBeCloseTo(1000, 2);
  });
});

describe('settledLater', () => {
  it('compares dates, not times — a later edit the same day is not a settlement', () => {
    expect(settledLater({ date: '2026-07-11', updated_at: '2026-07-11T23:59:59Z' })).toBe(false);
    expect(settledLater({ date: '2026-07-11', updated_at: '2026-07-12T00:00:01Z' })).toBe(true);
  });

  it('is false when either date is missing, so nothing is dropped on bad data', () => {
    expect(settledLater({ date: '2026-07-11' })).toBe(false);
    expect(settledLater({ updated_at: '2026-08-01' })).toBe(false);
    expect(settledLater({})).toBe(false);
  });
});

describe('never reports more received than the sale is worth', () => {
  it('caps at the total', () => {
    const s = sale({ paymentMethod: 'CASH', totalAmount: 100, paidAmount: 500,
                     paymentStatus: 'PARTIAL' });
    expect(receivedOnDay(s)).toBeCloseTo(100, 2);
    expect(receivableOnDay(s)).toBe(0);
  });

  it('never reports a negative receivable', () => {
    const s = sale({ paymentMethod: 'CASH', totalAmount: 100, paidAmount: 500,
                     paymentStatus: 'PAID' });
    expect(receivableOnDay(s)).toBeGreaterThanOrEqual(0);
  });
});
