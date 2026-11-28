import { describe, it, expect } from 'vitest';
import { minutesOfDay, historyRange, revenueComparison, inComparison, revenueChange } from './salesComparison';

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
