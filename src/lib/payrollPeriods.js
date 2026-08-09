/**
 * Whether a pay run's period has already been paid.
 *
 * Nothing stopped the same window being processed twice. August 2026 was run
 * for 2026-08-01/2026-08-08 at ₹7,200, and the attendance grid still showed
 * ₹7,200 payable under a button reading PROCESS AUGUST PAYROLL. A second press
 * would have inserted a second run and two more Salary expenses — and because
 * trg_expenses_post_ledger turns each expense into a money-OUT, the phantom
 * payout reaches DayBook, the P&L and the cash account balance.
 *
 * Periods are stored in two shapes, which is why this cannot be a string
 * compare: 'YYYY-MM' for a whole month, 'YYYY-MM-DD/YYYY-MM-DD' for a range.
 * '2026-08' and '2026-08-01/2026-08-08' overlap completely and share no prefix
 * a comparison would catch.
 */

import { iso, parseISO } from './reportPeriods';

/**
 * A stored period as { from, to }, or null if it is neither shape.
 *
 * Returns null rather than guessing: a period that cannot be read must not
 * silently become "no overlap", which would wave through the exact double
 * payment this exists to stop. Callers treat null as unknown, not as safe.
 */
export function parsePeriod(period) {
  const s = String(period || '').trim();

  if (s.includes('/')) {
    const [from, to] = s.split('/');
    const f = parseISO(from), t = parseISO(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return null;
    // Tolerate a reversed range rather than reporting no overlap for one.
    return t < f ? { from: iso(t), to: iso(f) } : { from: iso(f), to: iso(t) };
  }

  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    // Day 0 of the next month is the last day of this one, leap years included.
    return { from: iso(new Date(y, mo - 1, 1)), to: iso(new Date(y, mo, 0)) };
  }

  return null;
}

/** Do two { from, to } windows share any day? Inclusive at both ends. */
export function overlaps(a, b) {
  if (!a || !b) return false;
  return a.from <= b.to && b.from <= a.to;
}

/**
 * The runs already covering any part of `period`.
 *
 * Deleted runs are ignored — a reversed payout is not a reason to block. A run
 * whose own period cannot be parsed is treated as overlapping: better to ask
 * about a payout that turns out to be unrelated than to pay one twice.
 */
export function findOverlapping(period, records = [], { excludeId } = {}) {
  const target = parsePeriod(period);
  if (!target) return [];

  return (records || [])
    .filter(r => r && !r.deleted_at && r.id !== excludeId)
    .filter(r => {
      const p = parsePeriod(r.period);
      return p === null ? true : overlaps(target, p);
    });
}

/** '2026-08-01/2026-08-08' → '1 Aug – 8 Aug'; '2026-08' → 'August 2026'. */
export function describePeriod(period) {
  const s = String(period || '').trim();
  const p = parsePeriod(s);
  if (!p) return s;

  if (!s.includes('/')) {
    return parseISO(p.from).toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  const fmt = (d) => {
    const x = parseISO(d);
    return `${x.getDate()} ${x.toLocaleString('default', { month: 'short' })}`;
  };
  return p.from === p.to ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`;
}

/** Is every day of the given month covered by one already-processed run? */
export function monthIsPaid(year, month1to12, records = []) {
  const target = parsePeriod(`${year}-${String(month1to12).padStart(2, '0')}`);
  if (!target) return null;

  return (records || [])
    .filter(r => r && !r.deleted_at)
    .find(r => {
      const p = parsePeriod(r.period);
      return p && p.from <= target.from && p.to >= target.to;
    }) || null;
}
