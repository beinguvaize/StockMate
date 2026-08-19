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

/**
 * The runs whose payout landed in this month.
 *
 * Attributed by the period's END date, which is exactly where `processPayroll`
 * dates the salary expense — so what the grid calls "already paid this month"
 * is the same money the month's P&L shows under Salary. Attributing by start,
 * or by any overlap, would let a run spanning a month boundary be counted in
 * two months at once.
 */
export function runsPaidInMonth(year, month1to12, records = []) {
  const key = `${year}-${String(month1to12).padStart(2, '0')}`;
  return (records || [])
    .filter(r => r && !r.deleted_at)
    .filter(r => {
      const p = parsePeriod(r.period);
      return p ? p.to.slice(0, 7) === key : false;
    });
}

/**
 * How much each employee has already been paid for this month → Map id → info.
 *
 * The grid showed a month-to-date wage and nothing else, so a month already
 * paid still read as ₹7,200 owing. This is what makes the difference visible.
 *
 * Days are NOT tracked per run — an item records `daysWorked`, not which days —
 * so this reports amounts and the windows they covered, and never claims a
 * particular cell was paid. If days were added inside a window after it was
 * paid, the wage will exceed the amount and the remainder shows as due, which
 * is the truthful answer.
 */
export function paidByEmployeeInMonth(year, month1to12, records = []) {
  const out = new Map();
  for (const r of runsPaidInMonth(year, month1to12, records)) {
    const window = parsePeriod(r.period);
    for (const item of r.items || []) {
      const id = item.employeeId;
      const net = Number(item.netPay || 0);
      if (!id || net <= 0) continue;   // a zero item is not a payment
      const prev = out.get(id) || { amount: 0, runs: [] };
      prev.amount += net;
      prev.runs.push({ id: r.id, period: r.period, window, amount: net, processed_at: r.processed_at });
      out.set(id, prev);
    }
  }
  return out;
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

/**
 * What this employee has been paid so far in the month this run belongs to,
 * split into what came BEFORE this run and what this run itself pays.
 *
 * Daily wages here are paid in many small runs -- August alone holds five, of
 * one to four days each -- so a slip for a single day is nearly meaningless on
 * its own. "900" tells the worker nothing; "900 today, 6,300 already this
 * month, 7,200 for 8 days so far" is the thing they actually want to check.
 *
 * "Before" is decided on (processed_at, id), not processed_at alone: two runs
 * were processed on 15 Aug 2026, and a date-only comparison would either count
 * both as prior or neither, depending on sort stability. The id is the
 * tie-break so a slip always agrees with itself.
 *
 * This is NOT `alreadyPaid` on the run item. That figure only exists to stop an
 * OVERLAPPING window being paid twice, and it is null on every run here because
 * the periods are disjoint. This is the month's running total, overlap or not.
 */
export function monthToDate({ run, records = [], employeeId } = {}) {
  if (!run || !employeeId) return null;
  const window = parsePeriod(run.period);
  if (!window) return null;

  // Runs are attributed to the month their period ENDS in, matching where
  // processPayroll dates the salary expense.
  const end = parseISO(window.to);
  const year = end.getFullYear();
  const month = end.getMonth() + 1;

  const isBefore = (r) => {
    const a = String(r.processed_at || '');
    const b = String(run.processed_at || '');
    if (a !== b) return a < b;
    return String(r.id || '') < String(run.id || '');
  };

  const lineFor = (r) => (r.items || []).find(i => i.employeeId === employeeId);

  let priorAmount = 0, priorDays = 0;
  let thisAmount = 0, thisDays = 0;
  const payments = [];

  for (const r of runsPaidInMonth(year, month, records)) {
    const item = lineFor(r);
    if (!item) continue;
    const net = Number(item.netPay || 0);
    const days = Number(item.daysWorked || 0);

    if (String(r.id) === String(run.id)) {
      thisAmount = net; thisDays = days;
    } else if (isBefore(r)) {
      priorAmount += net;
      priorDays += days;
      // A zero line is not a payment and does not belong in a list of them.
      if (net > 0) {
        payments.push({
          id: r.id,
          period: r.period,
          // What the money was FOR reads better on a slip than when it was
          // keyed in -- two of these runs were processed on the same day.
          label: describePeriod(r.period),
          paidOn: r.processed_at || null,
          amount: net,
          days,
        });
      }
    }
  }

  // Oldest first, so the list reads down the month.
  payments.sort((a, b) => String(a.paidOn || '').localeCompare(String(b.paidOn || '')));

  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    priorRuns: payments.length, priorAmount, priorDays,
    thisAmount, thisDays,
    payments,
    totalAmount: priorAmount + thisAmount,
    totalDays: priorDays + thisDays,
  };
}
