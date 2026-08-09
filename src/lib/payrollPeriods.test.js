import { describe, it, expect } from 'vitest';
import {
  parsePeriod, overlaps, findOverlapping, describePeriod, monthIsPaid,
} from './payrollPeriods';

/**
 * The defect these pin: the same window could be paid twice. FUTURE DISPO's
 * 2026-08-01/2026-08-08 run had already posted ₹7,200 of Salary expenses while
 * the screen still offered to process August.
 */

const run = (o) => ({ id: 'p1', period: '2026-08-01/2026-08-08', total_net: 7200, deleted_at: null, ...o });

describe('parsePeriod — the two shapes a period is stored in', () => {
  it('reads a date range', () => {
    expect(parsePeriod('2026-08-01/2026-08-08'))
      .toEqual({ from: '2026-08-01', to: '2026-08-08' });
  });

  it('expands a month to its real last day', () => {
    expect(parsePeriod('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(parsePeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(parsePeriod('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('straightens a reversed range instead of reporting no overlap', () => {
    expect(parsePeriod('2026-08-08/2026-08-01'))
      .toEqual({ from: '2026-08-01', to: '2026-08-08' });
  });

  it('returns null for anything it cannot read, never a guess', () => {
    // null must mean "unknown" at the call site, not "safe to pay again".
    for (const bad of ['', null, undefined, 'August', '2026-13', '2026-08-01/']) {
      expect(parsePeriod(bad)).toBeNull();
    }
  });
});

describe('overlaps', () => {
  const aug1to8 = { from: '2026-08-01', to: '2026-08-08' };

  it('catches a month against a range inside it — no shared string prefix', () => {
    // '2026-08' vs '2026-08-01/2026-08-08': a string compare sees nothing.
    expect(overlaps(parsePeriod('2026-08'), aug1to8)).toBe(true);
  });

  it('is inclusive at the boundary — one shared day is an overlap', () => {
    expect(overlaps(aug1to8, parsePeriod('2026-07-25/2026-08-01'))).toBe(true);
    expect(overlaps(aug1to8, parsePeriod('2026-08-08/2026-08-15'))).toBe(true);
  });

  it('does not fire on periods that merely touch end to end', () => {
    expect(overlaps(aug1to8, parsePeriod('2026-07-24/2026-07-31'))).toBe(false);
    expect(overlaps(aug1to8, parsePeriod('2026-08-09/2026-08-16'))).toBe(false);
  });

  it('catches a range wholly inside another', () => {
    expect(overlaps(aug1to8, parsePeriod('2026-08-03/2026-08-05'))).toBe(true);
  });

  it('is false when either side is unknown', () => {
    expect(overlaps(null, aug1to8)).toBe(false);
    expect(overlaps(aug1to8, null)).toBe(false);
  });
});

describe('findOverlapping', () => {
  it('finds the run that already paid these dates', () => {
    const hits = findOverlapping('2026-08-01/2026-08-08', [run()]);
    expect(hits).toHaveLength(1);
    expect(hits[0].total_net).toBe(7200);
  });

  it('catches processing the whole month after a week of it was paid', () => {
    // The live case: August is offered as a fresh run after 1-8 Aug was paid.
    expect(findOverlapping('2026-08', [run()])).toHaveLength(1);
  });

  it('ignores a reversed run — a deleted payout is not a reason to block', () => {
    expect(findOverlapping('2026-08', [run({ deleted_at: '2026-08-09T00:00:00Z' })])).toEqual([]);
  });

  it('lets a genuinely later period through', () => {
    expect(findOverlapping('2026-09', [run()])).toEqual([]);
  });

  it('excludes the run being edited', () => {
    expect(findOverlapping('2026-08', [run()], { excludeId: 'p1' })).toEqual([]);
  });

  it('treats an unreadable stored period as overlapping, not as clear', () => {
    // Better to ask about an unrelated payout than to pay one twice.
    expect(findOverlapping('2026-08', [run({ period: 'August 2026' })])).toHaveLength(1);
  });

  it('returns nothing when the requested period is itself unreadable', () => {
    expect(findOverlapping('', [run()])).toEqual([]);
  });
});

describe('monthIsPaid — whether the grid should show a processed state', () => {
  it('is not paid when only part of the month was run', () => {
    // 1-8 Aug does not cover August, so the CTA must still offer to process.
    expect(monthIsPaid(2026, 8, [run()])).toBeNull();
  });

  it('is paid when a run covers the whole month', () => {
    expect(monthIsPaid(2026, 8, [run({ period: '2026-08' })])).toBeTruthy();
    expect(monthIsPaid(2026, 8, [run({ period: '2026-07-15/2026-09-15' })])).toBeTruthy();
  });

  it('ignores a reversed run', () => {
    expect(monthIsPaid(2026, 8, [run({ period: '2026-08', deleted_at: 'x' })])).toBeNull();
  });
});

describe('describePeriod', () => {
  it('names a range the way the warning reads it out', () => {
    expect(describePeriod('2026-08-01/2026-08-08')).toBe('1 Aug – 8 Aug');
  });

  it('names a month', () => {
    expect(describePeriod('2026-08')).toBe('August 2026');
  });

  it('collapses a single-day range', () => {
    expect(describePeriod('2026-08-08/2026-08-08')).toBe('8 Aug');
  });

  it('returns unreadable input unchanged rather than printing NaN', () => {
    expect(describePeriod('whenever')).toBe('whenever');
  });
});
