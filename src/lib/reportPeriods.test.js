import { describe, it, expect } from 'vitest';
import { iso, parseISO, priorRange, shiftMonths, compareRange, shortDate } from './reportPeriods';

/**
 * These caught two real defects before they shipped, both invisible on the
 * developer's screen and both wrong on the shop's:
 *
 *  · UTC-vs-local parsing shifted every comparison window back a day west of
 *    UTC, and `toISOString()` returned yesterday before 05:30 in Kerala
 *  · stepping back a month from the 31st landed in the wrong month entirely
 */

describe('MOM — the same dates in the previous month', () => {
  it('1–8 Aug compares against 1–8 Jul', () => {
    expect(compareRange('2026-08-01', '2026-08-08', 'MOM'))
      .toEqual({ from: '2026-07-01', to: '2026-07-08' });
  });

  it('clamps to the end of a shorter month instead of overflowing into it', () => {
    // new Date(2026, 2, 31) stepped back a month is 3 MARCH, so an unclamped
    // version would have compared March against March.
    expect(shiftMonths('2026-03-31', 1)).toBe('2026-02-28');
    expect(shiftMonths('2026-01-31', 1)).toBe('2025-12-31');
  });

  it('keeps 29 February in a leap year', () => {
    expect(shiftMonths('2028-03-29', 1)).toBe('2028-02-29');
  });

  it('crosses the year boundary', () => {
    expect(shiftMonths('2026-01-15', 1)).toBe('2025-12-15');
  });
});

describe('YOY — the same dates last year', () => {
  it('shifts a full year', () => {
    expect(compareRange('2026-08-01', '2026-08-08', 'YOY'))
      .toEqual({ from: '2025-08-01', to: '2025-08-08' });
  });

  it('clamps a leap day onto a non-leap year', () => {
    expect(shiftMonths('2028-02-29', 12)).toBe('2027-02-28');
  });
});

describe('PREV — the equal-length period immediately before', () => {
  it('gives the 8 days ending the day before the range starts', () => {
    // Verified against the live P&L: 24–31 Jul returns revenue 91,195, which
    // is exactly what the Prior column showed for 1–8 Aug.
    expect(compareRange('2026-08-01', '2026-08-08', 'PREV'))
      .toEqual({ from: '2026-07-24', to: '2026-07-31' });
  });

  it('matches day count, not calendar month', () => {
    // The reason this is the default: "This Month" ends TODAY, so comparing a
    // part-month against a whole one made every Δ look like a collapse.
    expect(priorRange('2026-03-01', '2026-03-31'))
      .toEqual({ from: '2026-01-29', to: '2026-02-28' });
  });

  it('handles a single day', () => {
    expect(priorRange('2026-08-08', '2026-08-08'))
      .toEqual({ from: '2026-08-07', to: '2026-08-07' });
  });

  it('is the fallback for an unknown basis', () => {
    expect(compareRange('2026-08-01', '2026-08-08', 'NONSENSE'))
      .toEqual(compareRange('2026-08-01', '2026-08-08', 'PREV'));
  });
});

describe('dates are local, never UTC', () => {
  it('iso round-trips through parseISO', () => {
    for (const s of ['2026-08-01', '2026-01-01', '2026-12-31', '2028-02-29']) {
      expect(iso(parseISO(s))).toBe(s);
    }
  });

  it('iso does not shift a local midnight into the previous day', () => {
    // toISOString() on a local midnight converts to UTC first — east of UTC
    // that lands on the day before, which is how "today" became yesterday.
    expect(iso(new Date(2026, 7, 1))).toBe('2026-08-01');
    expect(iso(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('parseISO reads the day the string says', () => {
    const d = parseISO('2026-08-01');
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 8, 1]);
  });
});

describe('shortDate', () => {
  it('names the compared window', () => {
    expect(shortDate('2026-07-24')).toBe('24 Jul');
  });

  it('returns bad input unchanged rather than printing NaN', () => {
    expect(shortDate('')).toBe('');
  });
});
