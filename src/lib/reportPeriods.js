/**
 * The window a report's "Prior" column compares against.
 *
 * Extracted from FinancialReport.jsx so the date arithmetic can be tested. It
 * could only be checked by opening the P&L and reading it, and the arithmetic
 * here decides whether a Δ says trade grew or collapsed.
 *
 * Two traps live in this file, both found by testing rather than by reading:
 *
 *  · `new Date('2026-08-01')` is UTC midnight by spec, while getDate() and
 *    friends read LOCAL. West of UTC the two disagree and every derived window
 *    slides back a day. `toISOString().slice(0,10)` is the same fault in
 *    reverse: east of UTC it returned yesterday's date before 05:30 IST.
 *    So every date here is parsed and formatted from local components.
 *
 *  · Stepping back a month overflows. `new Date(2026, 2, 31)` moved back one
 *    month is 3 March, not 28 February — March would have been compared
 *    against itself.
 */

/** Local calendar date as 'YYYY-MM-DD'. Never toISOString(). */
export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * First and last day of the calendar month containing `d`, as 'YYYY-MM-DD'.
 *
 * The plan-limit code built this window inline as
 * `new Date(y, m, 1).toISOString().split('T')[0]`, which is the second trap
 * named above: east of UTC, local midnight on the 1st is 18:30 on the last day
 * of the PREVIOUS month, so in IST the window ran 31 Jul – 30 Aug for August.
 * The invoice cap then counted the previous month's last day and missed the
 * current month's, blocking a tenant on the 1st and letting one past the cap
 * on the 31st.
 */
export function monthBounds(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  // Day 0 of the next month is the last day of this one, which is also what
  // keeps February and the 30-day months right without a table of lengths.
  return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
}

/**
 * Parse 'YYYY-MM-DD' as a LOCAL date, so it round-trips through `iso`.
 *
 * Malformed input returns an Invalid Date rather than a plausible-looking one.
 * Coercing the parts with `|| 1` turned '' into 1 January 1900 — a real date
 * that no guard would catch and that would have been printed as "1 Jan".
 */
export const parseISO = (s) => {
  const parts = String(s).split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return new Date(NaN);
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
};

/** The equal-length period immediately before [from, to]. */
export function priorRange(from, to) {
  const f = parseISO(from), t = parseISO(to);
  const days = Math.round((t - f) / 86400000) + 1;
  const pTo = new Date(f); pTo.setDate(pTo.getDate() - 1);
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - days + 1);
  return { from: iso(pFrom), to: iso(pTo) };
}

/** Shift back whole months, keeping the day and clamping to the month's end. */
export function shiftMonths(dateStr, back) {
  const d = parseISO(dateStr);
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const lastDay = new Date(y, m - back + 1, 0).getDate();
  return iso(new Date(y, m - back, Math.min(day, lastDay)));
}

/**
 * PREV is the honest default while a period is still open — 1–8 Aug against
 * the 8 days ending 31 Jul. The calendar bases answer a different question:
 * whether the same stretch of the month, or of the year, beat itself. Trade is
 * seasonal and the first week of a month does not resemble the last, so no one
 * basis is right for every question.
 */
export const COMPARE = [
  { id: 'PREV', label: 'Previous period', shortLabel: 'prev. period' },
  { id: 'MOM', label: 'Same dates, last month', shortLabel: 'same dates last month' },
  { id: 'YOY', label: 'Same dates, last year', shortLabel: 'same dates last year' },
];

export function compareRange(from, to, basis) {
  if (basis === 'MOM') return { from: shiftMonths(from, 1), to: shiftMonths(to, 1) };
  if (basis === 'YOY') return { from: shiftMonths(from, 12), to: shiftMonths(to, 12) };
  return priorRange(from, to);
}

/** '2026-07-24' → '24 Jul', for naming the compared window in the header. */
export function shortDate(s) {
  const d = parseISO(s);
  return Number.isNaN(d.getTime()) ? s
    : `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
}
