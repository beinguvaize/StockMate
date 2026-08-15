import { describe, it, expect } from 'vitest';
import { receivedOnDay, receivableOnDay, settledLater, carriedOpening } from './dayBook';

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

describe('carriedOpening — a day nobody opened', () => {
  // The live shape: 1 Aug closed and counted at 33,564; nothing opened after.
  const closed1Aug = { date: '2026-08-01', is_closed: true,
                       closing_balance: 31769, physical_cash: 33564 };

  it('carries from the last COUNTED day, not the computed close', () => {
    // The count is what was really in the tin. Using closing_balance would
    // start every later day 1,795 short.
    const r = carriedOpening('2026-08-02', [closed1Aug], {});
    expect(r.opening).toBeCloseTo(33564, 2);
    expect(r.from).toBe('2026-08-01');
    expect(r.counted).toBe(true);
  });

  it('replays the days in between, which is the whole point', () => {
    // 10 Aug on the live tenant: nothing was opened after 1 Aug, but cash moved
    // on the 2nd, 5th and 7th. Inheriting "yesterday" would miss all of it.
    const net = {
      '2026-08-02': -12500,
      '2026-08-05': -32047,
      '2026-08-07': -14400,
    };
    const r = carriedOpening('2026-08-10', [closed1Aug], net);
    expect(r.opening).toBeCloseTo(33564 - 12500 - 32047 - 14400, 2);
  });

  it('excludes the target day itself', () => {
    // The day being viewed has its own cash-in/out applied on top; counting it
    // here as well would double it.
    const r = carriedOpening('2026-08-05', [closed1Aug], { '2026-08-05': -32047 });
    expect(r.opening).toBeCloseTo(33564, 2);
  });

  it('ignores days at or before the anchor', () => {
    const r = carriedOpening('2026-08-03', [closed1Aug], { '2026-08-01': -999 });
    expect(r.opening).toBeCloseTo(33564, 2);
  });

  it('ignores days that are still open, however recent', () => {
    // 3 Aug has a row with closing_balance 0 because it was never closed.
    // Treating that as the anchor would carry a zero forward.
    const open3Aug = { date: '2026-08-03', is_closed: false,
                       closing_balance: 0, physical_cash: null };
    const r = carriedOpening('2026-08-10', [closed1Aug, open3Aug], {});
    expect(r.from).toBe('2026-08-01');
    expect(r.opening).toBeCloseTo(33564, 2);
  });

  it('falls back to the computed close when a day was closed without a count', () => {
    const noCount = { date: '2026-06-26', is_closed: true,
                      closing_balance: 48477.45, physical_cash: null };
    const r = carriedOpening('2026-06-27', [noCount], {});
    expect(r.opening).toBeCloseTo(48477.45, 2);
    expect(r.counted).toBe(false);
  });

  it('returns null when nothing has ever been closed', () => {
    // Better to keep the old behaviour than invent a position from nothing.
    expect(carriedOpening('2026-08-10', [], {})).toBeNull();
    expect(carriedOpening('2026-08-10', [{ date: '2026-08-01', is_closed: false }], {})).toBeNull();
  });

  it('returns null on a bad date rather than guessing', () => {
    expect(carriedOpening('', [closed1Aug], {})).toBeNull();
  });
});
