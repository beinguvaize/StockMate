import { describe, it, expect } from 'vitest';
import {
  dayOf, monthMatrix, inMonth, groupByDay, overlaps, findConflicts, localDateTime,
} from './appointmentCalendar';
import { iso } from './reportPeriods';

// Tests run under a pinned Asia/Kolkata timezone (vitest config), which is
// UTC+5:30 — the side of UTC where toISOString() reports the WRONG local day
// for anything before 05:30. That is the fault these tests exist to catch.

describe('dayOf', () => {
  it('reports the local day, not the UTC one', () => {
    // 01:00 IST on 15 Sep is 19:30 UTC on 14 Sep. toISOString() would say the
    // 14th and the booking would render on the wrong calendar cell.
    expect(dayOf('2026-09-15T01:00:00+05:30')).toBe('2026-09-15');
  });

  it('returns empty for junk rather than a plausible date', () => {
    expect(dayOf('not a date')).toBe('');
    expect(dayOf(null)).toBe('');
  });
});

describe('monthMatrix', () => {
  it('is always six weeks of seven days', () => {
    // A grid that changes height as you page through the year makes the page jump.
    for (const m of [0, 1, 5, 11]) {
      const grid = monthMatrix(2026, m);
      expect(grid).toHaveLength(6);
      expect(grid.flat()).toHaveLength(42);
    }
  });

  it('starts on Monday', () => {
    // 1 Sep 2026 is a Tuesday, so the grid opens on Monday 31 Aug.
    expect(monthMatrix(2026, 8)[0][0]).toBe('2026-08-31');
  });

  it('starts on the 1st when the month already begins on a Monday', () => {
    // 1 Jun 2026 is a Monday — no leading days from May.
    expect(monthMatrix(2026, 5)[0][0]).toBe('2026-06-01');
  });

  it('contains every day of the month, in order, with no gaps', () => {
    const grid = monthMatrix(2026, 1).flat(); // February 2026
    const days = grid.filter(d => inMonth(d, 2026, 1));
    expect(days[0]).toBe('2026-02-01');
    expect(days.at(-1)).toBe('2026-02-28');
    expect(days).toHaveLength(28);
    // consecutive, no duplicates
    expect(new Set(grid).size).toBe(42);
  });

  it('handles a leap February', () => {
    const days = monthMatrix(2028, 1).flat().filter(d => inMonth(d, 2028, 1));
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe('2028-02-29');
  });

  it('rolls the year at December and January', () => {
    expect(monthMatrix(2026, 11).flat()).toContain('2027-01-01');
    expect(monthMatrix(2026, 0).flat()).toContain('2025-12-31');
  });
});

describe('groupByDay', () => {
  const appts = [
    { id: 'b', start_at: '2026-09-15T14:00:00+05:30' },
    { id: 'a', start_at: '2026-09-15T09:00:00+05:30' },
    { id: 'c', start_at: '2026-09-16T09:00:00+05:30' },
  ];

  it('buckets by local day and sorts each bucket by time', () => {
    const g = groupByDay(appts);
    expect(Object.keys(g).sort()).toEqual(['2026-09-15', '2026-09-16']);
    expect(g['2026-09-15'].map(a => a.id)).toEqual(['a', 'b']);
  });

  it('drops rows with an unusable start rather than bucketing them under ""', () => {
    expect(groupByDay([{ id: 'x', start_at: null }])).toEqual({});
  });
});

describe('overlaps', () => {
  const at = (t, mins) => ({ start_at: `2026-09-15T${t}:00+05:30`, duration_min: mins });

  it('is half-open, so back-to-back bookings do not collide', () => {
    // 10:00-10:30 then 10:30-11:00 is how a salon actually runs.
    expect(overlaps(at('10:00', 30), at('10:30', 30))).toBe(false);
  });

  it('catches a real clash from either direction', () => {
    expect(overlaps(at('10:00', 60), at('10:30', 30))).toBe(true);
    expect(overlaps(at('10:30', 30), at('10:00', 60))).toBe(true);
  });

  it('treats a zero-length booking as colliding with nothing', () => {
    expect(overlaps(at('10:00', 0), at('10:00', 30))).toBe(false);
  });
});

describe('findConflicts', () => {
  const base = { staff_id: 'S1', start_at: '2026-09-15T10:00:00+05:30', duration_min: 60, status: 'BOOKED' };

  it('finds a clash for the same staff member', () => {
    const other = { id: '2', ...base, start_at: '2026-09-15T10:30:00+05:30', duration_min: 30 };
    expect(findConflicts({ id: '1', ...base }, [other]).map(a => a.id)).toEqual(['2']);
  });

  it('ignores a different staff member', () => {
    const other = { id: '2', ...base, staff_id: 'S2' };
    expect(findConflicts({ id: '1', ...base }, [other])).toEqual([]);
  });

  it('ignores cancelled and no-show slots', () => {
    // That slot is free again; treating it as taken would block rebooking it.
    const cancelled = { id: '2', ...base, status: 'CANCELLED' };
    const noshow = { id: '3', ...base, status: 'NOSHOW' };
    expect(findConflicts({ id: '1', ...base }, [cancelled, noshow])).toEqual([]);
  });

  it('never conflicts with itself when editing', () => {
    const self = { id: '1', ...base };
    expect(findConflicts(self, [self])).toEqual([]);
  });

  it('returns nothing when nobody is assigned', () => {
    const unassigned = { ...base, staff_id: null };
    expect(findConflicts(unassigned, [{ id: '2', ...base }])).toEqual([]);
  });
});

describe('localDateTime', () => {
  it('round-trips through iso in local time', () => {
    const d = localDateTime('2026-09-15', '09:30');
    expect(iso(d)).toBe('2026-09-15');
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it('keeps an early-morning slot on the right day', () => {
    // 00:30 IST is the previous day in UTC — the case that moved a booking.
    expect(iso(localDateTime('2026-09-15', '00:30'))).toBe('2026-09-15');
  });

  it('returns an invalid date for junk rather than guessing', () => {
    expect(Number.isNaN(localDateTime('', '10:00').getTime())).toBe(true);
    expect(Number.isNaN(localDateTime('2026-09-15', '').getTime())).toBe(true);
  });
});
