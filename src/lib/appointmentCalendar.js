/**
 * The arithmetic behind the appointments calendar.
 *
 * Extracted so a month grid can be checked without opening the page, the same
 * reason reportPeriods.js exists — and it builds on that file rather than
 * re-deriving dates. The trap it documents is exactly the one a hand-rolled
 * calendar falls into: `new Date('2026-08-01')` is UTC midnight while
 * getDate() reads LOCAL, so west of UTC every cell slides back a day. The
 * booking form still had `new Date().toISOString().slice(0,10)` in it.
 *
 * Tests run under a pinned Asia/Kolkata timezone, which is east of UTC and
 * therefore catches the mirror-image fault.
 */

import { iso, parseISO } from './reportPeriods';

/**
 * Local 'YYYY-MM-DD' for a timestamptz string. Never toISOString().
 *
 * The null guard is not defensive noise: `new Date(null)` is the EPOCH, not an
 * Invalid Date, so a row with no start_at silently bucketed under 1970-01-01 —
 * a real date that no NaN check catches. Same shape of fault as the `|| 1`
 * that turned '' into 1 January 1900 in reportPeriods.parseISO.
 */
export const dayOf = (startAt) => {
  if (startAt == null || startAt === '') return '';
  const d = new Date(startAt);
  return Number.isNaN(d.getTime()) ? '' : iso(d);
};

/**
 * Six weeks of 'YYYY-MM-DD', Monday-first, covering the month containing
 * `year`/`month` (month is 0-based, as Date uses).
 *
 * Always 42 cells: a grid that changes height as you page through the year
 * makes the whole page jump. Days outside the month are still real dates, so a
 * booking on the 31st of the previous month renders where it belongs rather
 * than vanishing.
 */
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-0; Indian shops read a week as Monday-first.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) =>
      iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d))
    )
  );
}

/** True when 'YYYY-MM-DD' falls inside the given 0-based month. */
export const inMonth = (dayStr, year, month) => {
  const d = parseISO(dayStr);
  return d.getFullYear() === year && d.getMonth() === month;
};

/** Appointments bucketed by local day, each bucket sorted by start time. */
export function groupByDay(appointments = []) {
  const out = {};
  for (const a of appointments) {
    const k = dayOf(a?.start_at);
    if (!k) continue;
    (out[k] ||= []).push(a);
  }
  for (const k of Object.keys(out)) {
    out[k].sort((x, y) => new Date(x.start_at) - new Date(y.start_at));
  }
  return out;
}

/** Half-open [start, start + duration) in epoch ms. */
const span = (a) => {
  const s = new Date(a?.start_at).getTime();
  const mins = Number(a?.duration_min) || 0;
  return [s, s + mins * 60000];
};

/**
 * Do two bookings collide?
 *
 * Half-open on purpose: a 10:00–10:30 and a 10:30–11:00 back to back do NOT
 * collide, which is how appointments are actually run.
 */
export function overlaps(a, b) {
  const [s1, e1] = span(a);
  const [s2, e2] = span(b);
  if (!Number.isFinite(s1) || !Number.isFinite(s2)) return false;
  return s1 < e2 && s2 < e1;
}

/**
 * Bookings for the same staff member that clash with `candidate`.
 *
 * Only BOOKED and COMPLETED count — a cancelled or no-show slot is free, and
 * treating it as taken would block rebooking the gap it left. An unassigned
 * booking never conflicts: nobody is committed to it yet.
 */
export function findConflicts(candidate, existing = []) {
  const staffId = candidate?.staff_id;
  if (!staffId) return [];
  return existing.filter((a) =>
    a?.id !== candidate?.id &&
    a?.staff_id === staffId &&
    ['BOOKED', 'COMPLETED'].includes(String(a?.status || '').toUpperCase()) &&
    overlaps(candidate, a)
  );
}

/** 'YYYY-MM-DD' + 'HH:MM' → a Date in LOCAL time, ready for the DB. */
export const localDateTime = (dayStr, timeStr) => {
  const d = parseISO(dayStr);
  const [h, m] = String(timeStr || '').split(':').map(Number);
  if (Number.isNaN(d.getTime()) || !Number.isFinite(h) || !Number.isFinite(m)) return new Date(NaN);
  d.setHours(h, m, 0, 0);
  return d;
};
