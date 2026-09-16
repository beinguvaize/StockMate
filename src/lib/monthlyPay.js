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
 * The per-day rate is the salary divided by the calendar days in the PAY CYCLE
 * -- 7 for a weekly wage, the length of the month for a monthly one -- and pay
 * is that rate times the days actually covered.
 *
 * Dividing by the cycle rather than by the period is the whole fix for WEEKLY.
 * Both types used to be paid `salary` flat for whatever window was run, so a
 * weekly employee run over August was handed ONE week's pay for the month, and
 * a monthly employee run over a single week was handed a whole month's. Neither
 * was noticed because every employee in every tenant is still DAILY.
 *
 * Calendar days, not working days: it is the common Indian practice, and it
 * makes a fully absent month come to exactly the salary rather than more.
 */

import { parseISO } from './reportPeriods';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Days in one pay cycle, which is what the stored salary buys. */
export function cycleDays(payType, to) {
  if (String(payType || '').toUpperCase() === 'WEEKLY') return 7;
  // A monthly salary buys the month the period ends in, so February costs the
  // same as March and a day is worth slightly more in the shorter month.
  const end = parseISO(to);
  if (Number.isNaN(end.getTime())) return 30;
  return new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
}

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
export function salariedBasePay({ salary, payType = 'MONTHLY', from, to, days } = {}) {
  const gross = num(salary);
  const total = periodDays(from, to);
  const lost = lopDays(days, from, to);
  const cycle = cycleDays(payType, to);

  if (gross <= 0 || total <= 0 || cycle <= 0) {
    return { salary: gross, payType, periodDays: total, cycleDays: cycle,
             lopDays: lost, perDay: 0, lopAmount: 0, basePay: 0 };
  }

  const perDay = gross / cycle;
  // Days actually covered, after absence. Never negative: more days can be
  // marked absent than the period holds if a period is shortened after marking.
  const payable = Math.max(0, total - lost);
  const basePay = Math.round(perDay * payable);
  // Reported as the money the absence cost, which is what a slip shows.
  const lopAmount = Math.min(Math.round(perDay * total), Math.round(perDay * lost));

  return {
    salary: gross, payType,
    periodDays: total, cycleDays: cycle, lopDays: lost,
    perDay, lopAmount, basePay,
  };
}

export default salariedBasePay;
