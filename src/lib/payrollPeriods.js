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
      // Cash plus any staff advance taken back from the line: both settled pay.
      const net = paidOnLine(item);
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

  // A MONTHLY slip's run is synthetic: it stands for several real runs and is
  // not itself in `records`. Without this the real run sharing its processed_at
  // matched neither "this run" nor "before it" and was dropped, so a month that
  // paid 7,200 reported 6,300. The same fault was fixed in yearToDate; this
  // copy was missed because monthToDate was not feeding a monthly slip then.
  const own = new Set([String(run.id), ...(run.sourceRunIds || []).map(String)]);

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
    // What the line settled: cash (netPay) plus any staff advance taken back
    // from it (advanceRecovered). Counting the cash alone lost the recovered
    // part from the month's total.
    const net = paidOnLine(item);
    const days = Number(item.daysWorked || 0);

    if (own.has(String(r.id))) {
      thisAmount += net; thisDays += days;
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

/**
 * The Indian financial year containing a date: 1 April to 31 March.
 *
 * Not the calendar year. Every payroll figure that gets reported -- Form 16,
 * Form 24Q, the employee's own return -- is measured against this window, so a
 * year-to-date on a payslip that ran January to December would be the wrong
 * number for every purpose it exists to serve.
 */
export function financialYear(dateISO) {
  const d = parseISO(dateISO);
  if (Number.isNaN(d.getTime())) return null;
  // January, February and March belong to the year that STARTED the previous April.
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
  };
}

/**
 * What this employee has been paid so far in the financial year this run falls
 * in, split into what came before this run and what this run pays.
 *
 * Shares its "before" rule with monthToDate: (processed_at, id), because two
 * runs can be processed on the same day and a date-only comparison would count
 * both or neither.
 */
export function yearToDate({ run, records = [], employeeId } = {}) {
  if (!run || !employeeId) return null;
  const window = parsePeriod(run.period);
  if (!window) return null;

  const fy = financialYear(window.to);
  if (!fy) return null;

  // A MONTHLY slip's run is synthetic -- it stands for several real runs and is
  // not itself in `records`. Without this, the real run that shares its
  // processed_at matched neither "this run" nor "before it" and was dropped,
  // making year-to-date come out LOWER than the month it was printed on.
  const own = new Set([String(run.id), ...(run.sourceRunIds || []).map(String)]);

  const isBefore = (r) => {
    const a = String(r.processed_at || '');
    const b = String(run.processed_at || '');
    if (a !== b) return a < b;
    return String(r.id || '') < String(run.id || '');
  };

  let priorAmount = 0, priorDays = 0, thisAmount = 0, thisDays = 0;
  let grossEarnings = 0, deductions = 0, runs = 0;

  for (const r of records || []) {
    if (!r || r.deleted_at) continue;
    const w = parsePeriod(r.period);
    // A run belongs to the year its period ENDS in, matching where
    // processPayroll dates the salary expense.
    if (!w || w.to < fy.from || w.to > fy.to) continue;

    const item = (r.items || []).find(i => i.employeeId === employeeId);
    if (!item) continue;

    const net = paidOnLine(item);   // cash + advance taken back, as monthToDate
    const days = Number(item.daysWorked || 0);
    const gross = Number(item.basePay || 0) + Number(item.overtime || 0)
                + Number(item.commission || 0) + Number(item.bonus || 0);
    const ded = Number(item.deductions || 0) + Number(item.lopAmount || 0)
              + Number(item.alreadyPaid || 0);

    const isThis = own.has(String(r.id));
    if (isThis) { thisAmount += net; thisDays += days; }
    else if (isBefore(r)) { priorAmount += net; priorDays += days; }
    else continue;   // a later run is not "to date"

    if (net > 0 || isThis) runs += 1;
    grossEarnings += gross;
    deductions += ded;
  }

  return {
    year: fy.label, from: fy.from, to: fy.to,
    runs, priorAmount, priorDays, thisAmount, thisDays,
    grossEarnings, deductions,
    totalAmount: priorAmount + thisAmount,
    totalDays: priorDays + thisDays,
  };
}

/**
 * Every run of one month for one employee, collapsed into a single pay item.
 *
 * A payslip is a MONTHLY document even when the wage is daily. This shop pays
 * daily staff in many small runs -- August alone holds five, of one to four
 * days each -- and handing someone five separate slips for one month is not a
 * wage record they can use for rent, a loan or a visa. One slip per employee
 * per month, with the individual payments listed inside it.
 *
 * Returns a `run` and an `item` in exactly the shape buildPayslip already
 * takes, so the whole slip -- earnings lines, deductions, words, nil handling --
 * is reused rather than written a second time for the monthly case.
 */
export function monthlyPayItem({ year, month1to12, employeeId, records = [] } = {}) {
  if (!year || !month1to12 || !employeeId) return null;

  const runs = runsPaidInMonth(year, month1to12, records)
    .filter(r => (r.items || []).some(i => i.employeeId === employeeId))
    .sort((a, b) => String(a.processed_at || '').localeCompare(String(b.processed_at || '')));

  if (runs.length === 0) return null;

  const acc = {
    basePay: 0, overtime: 0, commission: 0, bonus: 0,
    deductions: 0, alreadyPaid: 0, lopAmount: 0, lopDays: 0,
    daysWorked: 0, netPay: 0, advanceRecovered: 0,
  };
  const payments = [];
  let shape = null;

  for (const r of runs) {
    const it = (r.items || []).find(i => i.employeeId === employeeId);
    if (!it) continue;
    shape = shape || it;

    for (const k of Object.keys(acc)) acc[k] += Number(it[k] || 0);

    // A zero line is not a payment and does not belong in a list of them.
    if (paidOnLine(it) > 0) {
      payments.push({
        id: r.id,
        period: r.period,
        label: describePeriod(r.period),
        paidOn: r.processed_at || null,
        amount: paidOnLine(it),
        days: Number(it.daysWorked || 0),
      });
    }
  }

  const last = runs[runs.length - 1];
  const mm = String(month1to12).padStart(2, '0');

  return {
    // The month itself is the period. Its id carries the employee so two
    // employees' monthly slips are never keyed the same.
    run: {
      id: `${year}-${mm}:${employeeId}`,
      period: `${year}-${mm}`,
      processed_at: last.processed_at || null,
      // The runs behind it, so a caller can still reach the detail.
      sourceRunIds: runs.map(r => r.id),
    },
    item: {
      ...acc,
      employeeId,
      employeeName: shape?.employeeName || null,
      department: shape?.department || null,
      payType: shape?.payType || null,
      // A rate only means anything if it did not change during the month.
      dailyRate: new Set(runs.map(r => (r.items || [])
        .find(i => i.employeeId === employeeId)?.dailyRate)).size === 1
        ? Number(shape?.dailyRate || 0) : 0,
      salary: Number(shape?.salary || 0) || null,
      periodDays: Number(shape?.periodDays || 0) || null,
    },
    payments,
    runCount: runs.length,
  };
}

/**
 * Which lines need the operator to confirm they mean to pay overlapping days
 * a SECOND time -- decided PER EMPLOYEE.
 *
 * Overlapping dates alone are not the question. The run already nets prior
 * payment off each line -- a person's month shows 8,100 earned, 7,200 already
 * paid, 900 to pay -- so a monthly run after a month of weekly ones overlaps
 * every one of them while paying nobody twice.
 *
 * Nor is "some earlier run overlaps these dates" enough on its own. After one
 * person (or a chosen few) is paid for a month, the run for everyone else
 * overlaps that payment while paying none of THEM twice; asking the owner to
 * agree to "pay these dates again" there was a false warning.
 *
 * A line needs confirmation only when THAT person has a paid line in an
 * overlapping run, this line would hand over money (netPay > 0), and none of
 * the earlier payment was netted off it (alreadyPaid is 0). A re-run of an
 * identical period nets to zero and is stopped by "nothing to pay" first.
 *
 * Returns one entry per line, in order:
 *   { employeeId, alreadyPaidRunIds, needsConfirmation }
 * alreadyPaidRunIds are the overlapping runs that paid this person.
 */
export function overlapConfirmations(items = [], overlappingRuns = []) {
  const runs = (overlappingRuns || []).filter(Boolean);
  return (items || []).map((i) => {
    const id = String(i?.employeeId ?? '');
    const runIds = runs
      .filter((r) => (r.items || []).some((x) => String(x?.employeeId ?? '') === id && paidOnLine(x) > 0))
      .map((r) => r.id);
    return {
      employeeId: i?.employeeId,
      alreadyPaidRunIds: runIds,
      needsConfirmation: runIds.length > 0 && Number(i?.netPay || 0) > 0 && !(Number(i?.alreadyPaid || 0) > 0),
    };
  });
}

/**
 * Does this run need the operator to confirm anything? True when any line
 * does (overlapConfirmations). The released phone pays every line it shows,
 * so "any line" is still the right answer for it; the web, which can pay a
 * chosen few, reads each line's own needsConfirmation.
 *
 * `overlappingRuns` must carry their items (as findOverlapping returns them):
 * a run with no items paid nobody and asks about nobody.
 */
export function needsOverlapConfirmation(items = [], overlappingRuns = []) {
  if (!overlappingRuns || overlappingRuns.length === 0) return false;
  return overlapConfirmations(items, overlappingRuns).some((c) => c.needsConfirmation);
}

/**
 * What this employee has already been paid FOR THE DAYS IN A GIVEN WINDOW.
 *
 * Not the same as what they were paid this month. A monthly run covers the
 * whole month, so the month's total happens to be the right figure there; a
 * custom or weekly run does not. Subtracting a month of payments from five
 * days of earnings wipes the payout out: Akbar earned 1,800 for 17-21 Aug, had
 * 7,200 subtracted for the month, and the run offered zero while the screen
 * beside it correctly said 900 was still due.
 *
 * A prior run that only PARTLY overlaps is pro-rated by the days shared with
 * the window. A run covering 1-8 Aug overlapping a 5-10 Aug window paid for
 * four of its eight days inside that window, so half of it counts.
 *
 * A day-rate line is only ever pay for days already worked, so an earlier run
 * stops counting at the day it was processed. Without that, a whole-month run
 * made mid-month was spread over the days still to come, and every single-day
 * run for the rest of the month offered a little less than the day's rate.
 */
const SHOP_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The shop's calendar day a run was processed on, or null if unreadable. */
function processedDay(stamp) {
  if (!stamp) return null;
  const d = new Date(stamp);
  return Number.isNaN(d.getTime()) ? null : SHOP_DAY.format(d);
}

/**
 * What one saved pay line settled for its days: cash paid plus the staff
 * advance taken back from it. Lines saved before advances existed have no
 * advanceRecovered, so this is their netPay, exactly as before.
 */
export function paidOnLine(item) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return n(item?.netPay) + Math.max(0, n(item?.advanceRecovered));
}

export function paidForWindow({ from, to, employeeId, records = [] } = {}) {
  if (!from || !to || !employeeId) return 0;
  const wFrom = parseISO(from), wTo = parseISO(to);
  if (Number.isNaN(wFrom.getTime()) || Number.isNaN(wTo.getTime())) return 0;

  const dayCount = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000) + 1;

  let total = 0;
  for (const r of records || []) {
    if (!r || r.deleted_at) continue;
    const p = parsePeriod(r.period);
    if (!p) continue;

    const item = (r.items || []).find(i => i.employeeId === employeeId);
    // What that run paid FOR these days: the cash (netPay) plus any staff
    // advance it took back (advanceRecovered). The recovered part was earned
    // and settled against the advance; leaving it out would pay it again here.
    const net = paidOnLine(item);
    if (net <= 0) continue;

    // Day-rate pay covers nothing after the day the run was made. Only ever
    // shortens the period, and never to before it starts, so a run dated ahead
    // of its own processing still counts for the days it names.
    let pTo = p.to;
    if (['DAILY', 'HOURLY'].includes(String(item.payType || '').toUpperCase())) {
      const done = processedDay(r.processed_at);
      if (done && done >= p.from && done < pTo) pTo = done;
    }

    // Intersection of the prior run's period with this window.
    const lo = p.from > from ? p.from : from;
    const hi = pTo    < to   ? pTo    : to;
    if (lo > hi) continue;

    const runDays = dayCount(p.from, pTo);
    const shared  = dayCount(lo, hi);
    if (runDays <= 0 || shared <= 0) continue;

    // Fully inside the window: the whole payment was for these days.
    total += shared >= runDays ? net : net * (shared / runDays);
  }
  return Math.round(total);
}
