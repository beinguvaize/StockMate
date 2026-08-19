/**
 * What a salaried employee is actually paid for a period.
 *
 * Before this, a MONTHLY or WEEKLY employee was paid `employees.salary` flat --
 * the pay run never consulted attendance for them, so someone absent the whole
 * month was paid in full. That was not a policy decision, it was the `else`
 * branch of a check written for daily wages.
 *
 * THE RULE THAT MATTERS: only a day explicitly marked ABSENT (or HALF_DAY)
 * causes loss of pay. An UNMARKED day is paid.
 *
 * That asymmetry is deliberate and is the whole safety of this file. Salaried
 * staff are usually not on the attendance grid at all -- nobody ticks the
 * manager in each morning -- so treating "no mark" as "absent" would read an
 * empty grid as a full month of absence and pay a manager zero. Absence has to
 * be asserted, never inferred.
 *
 * The per-day rate is the salary divided by the CALENDAR days in the period,
 * which is the common Indian practice and the one that makes a month of
 * absences come to exactly the salary. Dividing by working days instead would
 * make each absence cost more than a day's pay.
 */

import { parseISO } from './reportPeriods';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Weight of a day AGAINST the employee. Present and OT cost nothing. */
const LOP_WEIGHT = { ABSENT: 1, HALF_DAY: 0.5, PRESENT: 0, OT: 0 };

/** Calendar days in [from, to], inclusive. */
export function periodDays(from, to) {
  const a = parseISO(from);
  const b = parseISO(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const days = Math.round((b - a) / 86400000) + 1;
  return days > 0 ? days : 0;
}

/**
 * Days lost in [from, to] for one employee.
 * `days` is that employee's slice of the attendance map: { 'YYYY-MM-DD': {status} }.
 */
export function lopDays(days = {}, from, to) {
  return Object.entries(days || {}).reduce((sum, [d, a]) => {
    if (d < from || d > to) return sum;
    return sum + (LOP_WEIGHT[a?.status] || 0);
  }, 0);
}

/**
 * Salary for the period, less loss of pay.
 * Returns the workings too, because a slip that shows only the net figure
 * gives the employee nothing to check.
 */
export function monthlyBasePay({ salary, from, to, days } = {}) {
  const gross = num(salary);
  const total = periodDays(from, to);
  const lost = lopDays(days, from, to);

  if (gross <= 0 || total <= 0) {
    return { salary: gross, periodDays: total, lopDays: lost, perDay: 0, lopAmount: 0, basePay: gross > 0 ? gross : 0 };
  }

  const perDay = gross / total;
  // Never let rounding push LOP past the salary itself -- more days can be
  // marked absent than the period holds if a period is edited after marking.
  const lopAmount = Math.min(gross, Math.round(perDay * lost));

  return {
    salary: gross,
    periodDays: total,
    lopDays: lost,
    perDay,
    lopAmount,
    basePay: Math.max(0, gross - lopAmount),
  };
}

export default monthlyBasePay;
