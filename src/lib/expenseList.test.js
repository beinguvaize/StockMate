import { describe, it, expect } from 'vitest';
import {
  periodWindow, filterExpenses, summarize, categoryTotals, pageOf, windowWords, spanWords,
  sameDatesLastMonth, monthToDateComparison, lastSixMonths, shortAmount, csvRows, toCsv, expenseDay, inWindow,
} from './expenseList';

const ex = (id, date, amount, more = {}) => ({ id, date, amount, category: 'Other', note: `Note ${id}`, ...more });

describe('periodWindow: the rules the page has always used', () => {
  const today = '2026-11-26'; // a Thursday
  it('today, yesterday', () => {
    expect(periodWindow('today', today)).toEqual({ from: today, to: today });
    expect(periodWindow('yesterday', today)).toEqual({ from: '2026-11-25', to: '2026-11-25' });
    expect(periodWindow('yesterday', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' });
  });
  it('this week starts on Monday; a Sunday is the last day of its week', () => {
    expect(periodWindow('week', today)).toEqual({ from: '2026-11-23', to: today });
    expect(periodWindow('week', '2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(periodWindow('week', '2026-11-23')).toEqual({ from: '2026-11-23', to: '2026-11-23' });
  });
  it('this month, last month (across a year end)', () => {
    expect(periodWindow('month', today)).toEqual({ from: '2026-11-01', to: today });
    expect(periodWindow('lastmonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodWindow('lastmonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(periodWindow('lastmonth', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('range keeps either side open when blank; all is unbounded', () => {
    expect(periodWindow('range', today, { from: '2026-10-02', to: '' })).toEqual({ from: '2026-10-02', to: null });
    expect(periodWindow('all', today)).toEqual({ from: null, to: null });
  });
});

describe('filterExpenses', () => {
  const rows = [
    ex('a', '2026-11-26', 340, { category: 'Tea and snacks', note: 'Tea' }),
    ex('b', '2026-11-20', 7500, { category: 'Salary' }),
    ex('c', '2026-10-31', 1000, { category: 'Rent' }),
    ex('d', '2026-11-05T10:00:00Z', 18000, { category: 'Rent', note: 'Shop rent' }),
    null,
  ];
  const win = { from: '2026-11-01', to: '2026-11-26' };
  it('keeps the window, newest first', () => {
    expect(filterExpenses(rows, { win }).map((r) => r.id)).toEqual(['a', 'b', 'd']);
  });
  it('searches the note and the category, any case', () => {
    expect(filterExpenses(rows, { win, query: 'RENT' }).map((r) => r.id)).toEqual(['d']);
    expect(filterExpenses(rows, { win, query: 'tea' }).map((r) => r.id)).toEqual(['a']);
  });
  it('filters by category; a row with none is Other', () => {
    expect(filterExpenses([...rows, ex('e', '2026-11-02', 5, { category: null })], { win, category: 'Other' }).map((r) => r.id)).toEqual(['e']);
  });
  it('sorts by amount either way', () => {
    expect(filterExpenses(rows, { win, sortKey: 'amount', sortDir: 'desc' }).map((r) => r.id)).toEqual(['d', 'b', 'a']);
    expect(filterExpenses(rows, { win, sortKey: 'amount', sortDir: 'asc' }).map((r) => r.id)).toEqual(['a', 'b', 'd']);
  });
  it('a row without a date only shows when nothing bounds the start', () => {
    expect(inWindow({ date: null }, { from: null, to: null })).toBe(true);
    expect(inWindow({ date: null }, win)).toBe(false);
  });
});

describe('summarize and categoryTotals', () => {
  it('spent, entries, average; ITC only from rows with a vendor GSTIN (as today)', () => {
    const s = summarize([
      ex('a', '2026-11-01', 600, { gst_amount: 91.53, vendor_gstin: 'GSTINX' }),
      ex('b', '2026-11-01', 400, { gst_amount: 61.02, vendor_gstin: null }),
    ]);
    expect(s).toEqual({ spent: 1000, entries: 2, avg: 500, itc: 91.53 });
    expect(summarize([])).toEqual({ spent: 0, entries: 0, avg: 0, itc: 0 });
  });
  it('per category, biggest first', () => {
    expect(categoryTotals([ex('a', 'x', 5, { category: 'A' }), ex('b', 'x', 9, { category: 'B' }), ex('c', 'x', 6, { category: 'A' })]))
      .toEqual([['A', 11], ['B', 9]]);
  });
});

describe('pageOf', () => {
  const list = Array.from({ length: 120 }, (_, i) => i);
  it('pages of 50 and clamps the page', () => {
    expect(pageOf(list, 0)).toMatchObject({ shown: 50, pages: 3, total: 120, hasPrev: false, hasNext: true });
    expect(pageOf(list, 2)).toMatchObject({ shown: 20, page: 2, hasNext: false });
    expect(pageOf(list, 9).page).toBe(2);
    expect(pageOf([], 0)).toMatchObject({ shown: 0, pages: 1, total: 0 });
  });
});

describe('words', () => {
  it('window and span', () => {
    expect(windowWords({ from: '2026-11-01', to: '2026-11-26' })).toBe('1 Nov to 26 Nov');
    expect(windowWords({ from: '2026-11-01', to: '2026-11-26' }, { year: true })).toBe('1 Nov 2026 to 26 Nov 2026');
    expect(windowWords({ from: '2026-10-02', to: '2026-10-02' })).toBe('2 Oct');
    expect(windowWords({ from: null, to: null })).toBe('All time');
    expect(spanWords('2026-11-01', '2026-11-26')).toBe('1 to 26 Nov');
    expect(spanWords('2026-10-28', '2026-11-03')).toBe('28 Oct to 3 Nov');
    expect(spanWords('2026-11-01', '2026-11-01')).toBe('1 Nov');
  });
  it('short amounts for the bars', () => {
    expect(shortAmount(115700)).toBe('115.7k');
    expect(shortAmount(84020)).toBe('84.0k');
    expect(shortAmount(840)).toBe('840');
  });
});

describe('vs last month: the same dates, shop-local', () => {
  it('the 1st to today\'s date last month', () => {
    expect(sameDatesLastMonth('2026-11-26')).toEqual({ from: '2026-10-01', to: '2026-10-26' });
    expect(sameDatesLastMonth('2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-05' });
  });
  it('stops at the end of a shorter month', () => {
    expect(sameDatesLastMonth('2026-12-31')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(sameDatesLastMonth('2026-03-30')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(sameDatesLastMonth('2028-03-31')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('sums both windows over the same filters and gives the change', () => {
    const rows = [
      ex('a', '2026-11-03', 1000, { category: 'Rent' }),
      ex('b', '2026-11-20', 500),
      ex('c', '2026-10-10', 800, { category: 'Rent' }),
      ex('d', '2026-10-27', 9999),       // after today's date last month: not compared
      ex('e', '2026-10-26', 200),
      ex('f', '2026-11-27', 7777),       // after today: not in this month so far
    ];
    const all = monthToDateComparison(rows, '2026-11-26');
    expect(all).toMatchObject({ now: 1500, before: 1000, diff: 500, dir: 1, nowSpan: '1 to 26 Nov', beforeSpan: '1 to 26 Oct' });
    expect(all.pct).toBeCloseTo(50);
    const rent = monthToDateComparison(rows, '2026-11-26', { category: 'Rent' });
    expect(rent).toMatchObject({ now: 1000, before: 800, dir: 1 });
    const down = monthToDateComparison([ex('x', '2026-11-02', 100), ex('y', '2026-10-02', 400)], '2026-11-26');
    expect(down).toMatchObject({ diff: -300, dir: -1 });
    expect(down.pct).toBeCloseTo(-75);
  });
  it('nothing last month: no percentage', () => {
    expect(monthToDateComparison([ex('a', '2026-11-03', 1000)], '2026-11-26')).toMatchObject({ now: 1000, before: 0, diff: null, pct: null, dir: null });
  });
  it('a timestamp is read as a day in the shop\'s timezone', () => {
    // 20:00 UTC on 31 Oct is 1:30 am on 1 Nov in India.
    expect(expenseDay('2026-10-31T20:00:00Z')).toBe('2026-10-31'); // a string date-part is taken as written
    expect(expenseDay(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11-01');
  });
});

describe('lastSixMonths', () => {
  it('six calendar months, oldest first, this one up to today', () => {
    const rows = [
      ex('a', '2026-11-26', 100), ex('b', '2026-11-27', 999), ex('c', '2026-06-30', 50),
      ex('d', '2026-05-31', 70), ex('e', '2026-09-15', 25, { category: 'Rent' }),
    ];
    const m = lastSixMonths(rows, '2026-11-26');
    expect(m.map((x) => x.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
    expect(m.map((x) => x.total)).toEqual([50, 0, 0, 25, 0, 100]);
    expect(m[5]).toMatchObject({ current: true, from: '2026-11-01', to: '2026-11-26' });
    expect(m[0]).toMatchObject({ from: '2026-06-01', to: '2026-06-30' });
    expect(lastSixMonths(rows, '2026-11-26', { category: 'Rent' }).map((x) => x.total)).toEqual([0, 0, 0, 25, 0, 0]);
  });
  it('crosses a year end', () => {
    expect(lastSixMonths([], '2027-02-10').map((x) => x.ym)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('CSV', () => {
  it('the columns the page has always exported, quoted where needed', () => {
    const csv = toCsv(csvRows([ex('a', '2026-11-26', '600', { note: 'Bags, 500 "pcs"', gst_rate: 18, gst_amount: 91.53, vendor_gstin: 'G1', payment_method: 'UPI' })]));
    expect(csv.split('\n')[0]).toBe('Date,Description,Category,PaidVia,Amount,GST_Rate,ITC_Amount,Vendor_GSTIN');
    expect(csv.split('\n')[1]).toBe('2026-11-26,"Bags, 500 ""pcs""",Other,UPI,600,18,91.53,G1');
    expect(toCsv([])).toBe('');
  });
});
