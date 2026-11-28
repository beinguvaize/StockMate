import { describe, it, expect } from 'vitest';
import {
  periodRange, comparisonRange, sumInRange, deltaPct, deltaTone, formatDelta,
  comparisonWords, setupSteps, isNewShop, addDays,
} from './dashboardFigures';

describe('periodRange', () => {
  const today = '2026-11-26'; // a Thursday

  it('covers each preset in business dates', () => {
    expect(periodRange('Today', today)).toEqual({ start: today, end: today });
    expect(periodRange('This Week', today)).toEqual({ start: '2026-11-23', end: today });
    expect(periodRange('This Month', today)).toEqual({ start: '2026-11-01', end: today });
    expect(periodRange('Last Month', today)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(periodRange('All Time', today)).toBeNull();
  });

  it('counts Sunday as the end of the week, not its start', () => {
    expect(periodRange('This Week', '2026-11-29')).toEqual({ start: '2026-11-23', end: '2026-11-29' });
    expect(periodRange('This Week', '2026-11-23')).toEqual({ start: '2026-11-23', end: '2026-11-23' });
  });

  it('last month across a year end and a short February', () => {
    expect(periodRange('Last Month', '2027-01-05')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    expect(periodRange('Last Month', '2027-03-31')).toEqual({ start: '2027-02-01', end: '2027-02-28' });
  });

  it('a custom range needs both dates and is put in order', () => {
    expect(periodRange('Custom Range', today, { start: '2026-11-01', end: '' })).toBeNull();
    expect(periodRange('Custom Range', today, { start: '2026-11-10', end: '2026-11-02' }))
      .toEqual({ start: '2026-11-02', end: '2026-11-10' });
  });
});

describe('comparisonRange: the previous period of equal length', () => {
  it('today compares with yesterday', () => {
    expect(comparisonRange({ start: '2026-11-26', end: '2026-11-26' })).toEqual({ start: '2026-11-25', end: '2026-11-25' });
  });
  it('the first day of a month compares with the last day of the one before', () => {
    expect(comparisonRange({ start: '2026-12-01', end: '2026-12-01' })).toEqual({ start: '2026-11-30', end: '2026-11-30' });
  });
  it('week so far compares with the same number of days before it', () => {
    expect(comparisonRange({ start: '2026-11-23', end: '2026-11-26' })).toEqual({ start: '2026-11-19', end: '2026-11-22' });
  });
  it('month to date is not compared with a whole month', () => {
    const p = comparisonRange({ start: '2026-11-01', end: '2026-11-26' });
    expect(p).toEqual({ start: '2026-10-06', end: '2026-10-31' });
  });
  it('a 31-day month compares with the 31 days before it', () => {
    expect(comparisonRange({ start: '2026-10-01', end: '2026-10-31' })).toEqual({ start: '2026-08-31', end: '2026-09-30' });
  });
  it('all time has nothing to compare with', () => {
    expect(comparisonRange(null)).toBeNull();
  });
});

describe('sumInRange', () => {
  const rows = [
    { date: '2026-11-25', amount: 100 },
    { date: '2026-11-26T09:30:00', amount: 40 },
    { date: '2026-11-26', amount: '60' },
    { date: null, amount: 999 },
  ];
  it('sums rows dated inside the window', () => {
    expect(sumInRange(rows, { start: '2026-11-26', end: '2026-11-26' }, r => r.amount)).toBe(100);
    expect(sumInRange(rows, { start: '2026-11-25', end: '2026-11-25' }, r => r.amount)).toBe(100);
  });
  it('all time sums everything', () => {
    expect(sumInRange(rows, null, r => r.amount)).toBe(1199);
  });
});

describe('comparison maths', () => {
  it('percent change against the prior period', () => {
    expect(deltaPct(112, 100)).toBeCloseTo(12);
    expect(deltaPct(92, 100)).toBeCloseTo(-8);
  });
  it('nothing to compare with when the prior period is zero', () => {
    expect(deltaPct(500, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });
  it('a loss turning into a smaller loss is an improvement', () => {
    expect(deltaPct(-50, -100)).toBeCloseTo(50);
  });
  it('formats with a real minus sign', () => {
    expect(formatDelta(12.44)).toBe('+12.4%');
    expect(formatDelta(-8)).toBe('−8.0%');
    expect(formatDelta(0)).toBe('0.0%');
    expect(formatDelta(null)).toBe('—');
  });
});

describe('deltaTone: pill colour', () => {
  it('sales and profit: up is green, down is red', () => {
    expect(deltaTone('income', 12)).toBe('good');
    expect(deltaTone('income', -3)).toBe('bad');
  });
  it('expenses: DOWN is green, up is red', () => {
    expect(deltaTone('cost', -8)).toBe('good');
    expect(deltaTone('cost', 8)).toBe('bad');
  });
  it('purchases are always grey', () => {
    expect(deltaTone('neutral', 22.5)).toBe('neutral');
    expect(deltaTone('neutral', -22.5)).toBe('neutral');
  });
  it('no change or nothing to compare with is grey', () => {
    expect(deltaTone('income', 0)).toBe('neutral');
    expect(deltaTone('cost', null)).toBe('neutral');
  });
});

describe('comparisonWords', () => {
  it('today reads "vs yesterday"', () => {
    const r = { start: '2026-11-26', end: '2026-11-26' };
    expect(comparisonWords('Today', r, comparisonRange(r), 'Today'))
      .toEqual({ short: 'vs yesterday', heading: 'Today, compared with yesterday' });
  });
  it('a longer period names the days it is compared with', () => {
    const r = { start: '2026-11-23', end: '2026-11-26' };
    expect(comparisonWords('This Week', r, comparisonRange(r), 'This week'))
      .toEqual({ short: 'vs previous 4 days', heading: 'This week, compared with 19 Nov – 22 Nov' });
  });
  it('all time has no comparison', () => {
    expect(comparisonWords('All Time', null, null, 'All time')).toEqual({ short: null, heading: 'All time' });
  });
});

describe('setupSteps', () => {
  it('a brand-new shop has nothing done and the first step next', () => {
    const s = setupSteps({});
    expect(s.done).toBe(0);
    expect(s.total).toBe(5);
    expect(s.steps[0]).toMatchObject({ key: 'products', done: false, next: true });
    expect(s.steps.filter(x => x.next)).toHaveLength(1);
  });

  it('ticks each step from real data', () => {
    const s = setupSteps({
      products: [{ id: 'p1', stock: 0 }],
      inventoryBalances: [{ product_id: 'p1', quantity: 4 }],
      businessProfile: { gst_no: '' },
      salesCount: 0,
      usersCount: 1,
    });
    expect(s.steps.map(x => [x.key, x.done])).toEqual([
      ['products', true], ['stock', true], ['gst', false], ['sale', false], ['staff', false],
    ]);
    expect(s.done).toBe(2);
    expect(s.steps.find(x => x.next).key).toBe('gst');
  });

  it('opening stock counts from the product when there is no stock row', () => {
    expect(setupSteps({ products: [{ id: 'p1', stock: 3 }] }).steps[1].done).toBe(true);
    expect(setupSteps({ products: [{ id: 'p1', stock: 0 }], inventoryBalances: [{ quantity: 0 }] }).steps[1].done).toBe(false);
  });

  it('a GST number of spaces is not GST details', () => {
    expect(setupSteps({ businessProfile: { gst_no: '   ' } }).steps[2].done).toBe(false);
    expect(setupSteps({ businessProfile: { gst_no: '29ABCDE1234F1Z5' } }).steps[2].done).toBe(true);
  });

  it('the owner alone is not staff', () => {
    expect(setupSteps({ usersCount: 1 }).steps[4].done).toBe(false);
    expect(setupSteps({ usersCount: 2 }).steps[4].done).toBe(true);
  });

  it('complete when every step is done', () => {
    const s = setupSteps({ products: [{ stock: 1 }], businessProfile: { gst_no: 'X' }, salesCount: 3, usersCount: 2 });
    expect(s.complete).toBe(true);
    expect(s.steps.some(x => x.next)).toBe(false);
  });
});

describe('isNewShop', () => {
  const today = '2026-11-26';
  it('no sale yet is a new shop', () => {
    expect(isNewShop([], today)).toBe(true);
  });
  it('a first sale within 30 days is still new; older is not', () => {
    expect(isNewShop([{ date: addDays(today, -10) }], today)).toBe(true);
    expect(isNewShop([{ date: addDays(today, -5) }, { date: addDays(today, -45) }], today)).toBe(false);
  });
});
