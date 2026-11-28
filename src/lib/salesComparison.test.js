import { describe, it, expect } from 'vitest';
import {
  minutesOfDay, historyRange, revenueComparison, inComparison, revenueChange,
  periodComparison, inPeriodComparison, sumInPeriodComparison, periodComparisonWords,
} from './salesComparison';

const TZ = 'Asia/Kolkata';
const today = '2026-11-26'; // a Thursday

describe('minutesOfDay', () => {
  it('reads the time in the shop timezone, not UTC', () => {
    // 04:00 UTC is 09:30 in India
    expect(minutesOfDay('2026-11-26T04:00:00Z', TZ)).toBe(9 * 60 + 30);
    // 20:00 UTC is 01:30 the next day in India
    expect(minutesOfDay('2026-11-25T20:00:00Z', TZ)).toBe(90);
  });
  it('null for no timestamp', () => {
    expect(minutesOfDay(null, TZ)).toBeNull();
    expect(minutesOfDay('not a date', TZ)).toBeNull();
  });
});

describe('historyRange', () => {
  it('reads each filter as the list does', () => {
    expect(historyRange('TODAY', today)).toEqual({ start: today, end: today });
    expect(historyRange('7D', today)).toEqual({ start: '2026-11-19', end: today });
    expect(historyRange('30D', today)).toEqual({ start: '2026-10-27', end: today });
    expect(historyRange('ALL', today)).toBeNull();
    expect(historyRange('CUSTOM', today, { from: '2026-11-01', to: '' })).toBeNull();
    expect(historyRange('CUSTOM', today, { from: '2026-11-01', to: '2026-11-10' })).toEqual({ start: '2026-11-01', end: '2026-11-10' });
  });
});

describe('revenueComparison', () => {
  it('today compares with the same weekday last week, same time', () => {
    const c = revenueComparison('TODAY', today, 600);
    expect(c).toEqual({ kind: 'sameTime', date: '2026-11-19', cutoff: 600, label: 'vs last Thursday', detail: '19 Nov, same time' });
  });
  it('a longer window compares with the one of equal length before it', () => {
    const c = revenueComparison('7D', today, 600);
    expect(c.kind).toBe('range');
    expect(c.range).toEqual({ start: '2026-11-11', end: '2026-11-18' });
    expect(c.detail).toBe('11 Nov – 18 Nov');
  });
  it('all time has nothing before it', () => {
    expect(revenueComparison('ALL', today, 600)).toBeNull();
  });
});

describe('inComparison', () => {
  const c = revenueComparison('TODAY', today, 10 * 60); // 10:00 now
  it('counts last Thursday only up to the same time of day', () => {
    expect(inComparison({ date: '2026-11-19', created_at: '2026-11-19T03:00:00Z' }, c, TZ)).toBe(true);  // 08:30
    expect(inComparison({ date: '2026-11-19', created_at: '2026-11-19T06:00:00Z' }, c, TZ)).toBe(false); // 11:30
    expect(inComparison({ date: '2026-11-20', created_at: '2026-11-20T03:00:00Z' }, c, TZ)).toBe(false);
  });
  it('leaves out a sale with no timestamp rather than guessing', () => {
    expect(inComparison({ date: '2026-11-19' }, c, TZ)).toBe(false);
  });
  it('a range window is whole days', () => {
    const r = revenueComparison('7D', today, 0);
    expect(inComparison({ date: '2026-11-11' }, r, TZ)).toBe(true);
    expect(inComparison({ date: '2026-11-19' }, r, TZ)).toBe(false);
  });
});

describe('revenueChange', () => {
  it('amount and percent', () => {
    expect(revenueChange(18420, 16250)).toEqual({ diff: 2170, pct: expect.closeTo(13.35, 1), dir: 1 });
    expect(revenueChange(900, 1000).dir).toBe(-1);
    expect(revenueChange(1000, 1000).dir).toBe(0);
  });
  it('nothing to compare with when the earlier figure is zero', () => {
    expect(revenueChange(500, 0)).toBeNull();
  });
});

describe('Dashboard periods: same time of day', () => {
  const at = (ymd, hhmm) => `${ymd}T${hhmm}:00+05:30`;

  it('today compares with yesterday, cut at this time', () => {
    const c = periodComparison({ start: today, end: today }, today, 10 * 60);
    expect(c).toEqual({ range: { start: '2026-11-25', end: '2026-11-25' }, cutDate: '2026-11-25', cutoff: 600 });
    expect(inPeriodComparison({ date: '2026-11-25', created_at: at('2026-11-25', '09:59') }, c, TZ)).toBe(true);
    expect(inPeriodComparison({ date: '2026-11-25', created_at: at('2026-11-25', '10:01') }, c, TZ)).toBe(false);
  });

  it('a running week cuts only the last day of the window before it', () => {
    const c = periodComparison({ start: '2026-11-23', end: today }, today, 10 * 60);
    expect(c.range).toEqual({ start: '2026-11-19', end: '2026-11-22' });
    expect(c.cutDate).toBe('2026-11-22');
    // An earlier day of the window counts whole, even late in the evening.
    expect(inPeriodComparison({ date: '2026-11-20', created_at: at('2026-11-20', '21:00') }, c, TZ)).toBe(true);
    expect(inPeriodComparison({ date: '2026-11-22', created_at: at('2026-11-22', '21:00') }, c, TZ)).toBe(false);
  });

  it('a fully past range compares whole days', () => {
    const c = periodComparison({ start: '2026-10-01', end: '2026-10-31' }, today, 10 * 60);
    expect(c.cutDate).toBeNull();
    expect(inPeriodComparison({ date: '2026-09-30', created_at: at('2026-09-30', '23:00') }, c, TZ)).toBe(true);
    expect(inPeriodComparison({ date: '2026-09-30' }, c, TZ)).toBe(true);
  });

  it('a row on the cut day with no timestamp is left out, not guessed', () => {
    const c = periodComparison({ start: today, end: today }, today, 10 * 60);
    expect(inPeriodComparison({ date: '2026-11-25' }, c, TZ)).toBe(false);
  });

  it('sums the comparison window', () => {
    const c = periodComparison({ start: today, end: today }, today, 10 * 60);
    const rows = [
      { date: '2026-11-25', created_at: at('2026-11-25', '09:00'), amount: 100 },
      { date: '2026-11-25', created_at: at('2026-11-25', '18:00'), amount: 900 },
      { date: '2026-11-24', created_at: at('2026-11-24', '09:00'), amount: 50 },
    ];
    expect(sumInPeriodComparison(rows, c, TZ, r => r.amount)).toBe(100);
  });

  it('all time has nothing to compare with', () => {
    expect(periodComparison(null, today, 600)).toBeNull();
  });

  it('wording', () => {
    const r = { start: today, end: today };
    expect(periodComparisonWords('Today', r, periodComparison(r, today, 600), 'Today'))
      .toEqual({ short: 'vs yesterday at this time', heading: 'Today, compared with yesterday at this time' });
    const w = { start: '2026-11-23', end: today };
    expect(periodComparisonWords('This Week', w, periodComparison(w, today, 600), 'This week'))
      .toEqual({ short: 'vs previous 4 days at this time', heading: 'This week, compared with 19 Nov – 22 Nov at this time' });
    const past = { start: '2026-10-01', end: '2026-10-31' };
    expect(periodComparisonWords('Last Month', past, periodComparison(past, today, 600), 'Last month').short).toBe('vs previous 31 days');
  });
});
