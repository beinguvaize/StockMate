/**
 * One pay run, worked out in one place.
 *
 * This is the calculation the Payroll page used to hold inside a component
 * (buildPayRunItems and four attendance helpers). It lives here, free of React,
 * so the web page, the phone and the server function all cost a run with the
 * same code instead of three copies that drift.
 *
 * The rules, as the owner approved them on the phone mockup (23-26 Nov 2026).
 * They are web's existing rules plus three additions:
 *
 *   Pay type belongs to the employee: MONTHLY salary, WEEKLY salary, DAILY rate.
 *   Period belongs to the run: any window [from, to] -- a month, a week, or
 *   custom dates down to a single day.
 *
 *   Salaried (MONTHLY / WEEKLY): full pay for the window, less only days MARKED
 *   Absent (one day) or Half day (half). Unmarked days, Leave and Sick are paid.
 *   See monthlyPay.js for why absence is never inferred.
 *
 *   Day rate (DAILY): paid for days worked. Present pays the day's rate, Half
 *   day pays half. Leave, Sick and Absent pay nothing. A day can carry its own
 *   rate.
 *
 *   Already paid: whatever earlier runs paid for the days in this window is
 *   taken off, so running twice does not pay twice.
 *
 *   NEW  Sick is its own mark, counted apart from Leave.
 *   NEW  Paid leave allowed per month (salaried staff): a count and a warning
 *        when it is exceeded. It never changes pay -- the owner decides.
 *   NEW  Staff set to On leave are listed but left out of the run unless the
 *        owner switches them in.
 */

import { salariedBasePay } from './monthlyPay.js';
import { paidForWindow } from './payrollPeriods.js';
import { statutoryDeductions } from './statutory.js';

const up = (v) => String(v || '').toUpperCase();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Every mark the attendance grid can hold, in the order the phone shows them. */
export const ATTENDANCE_MARKS = ['PRESENT', 'HALF_DAY', 'LEAVE', 'SICK', 'ABSENT'];

/** What a day is worth to someone paid by the day. Unlisted marks are worth 0. */
export const WORKED_WEIGHT = { PRESENT: 1, HALF_DAY: 0.5, OT: 1 };

/** DAILY (and the retired HOURLY) are paid for days worked, not a salary. */
export const isDayRate = (payType) => ['DAILY', 'HOURLY'].includes(up(payType));

/** Staff who are still employed: paid in a run, or listed as on leave. */
export const isOnLeave = (employee) => up(employee?.status) === 'ON_LEAVE';
export const isActive = (employee) => up(employee?.status) === 'ACTIVE';

const inWindow = (day, from, to) => day >= from && day <= to;

/**
 * How many of each mark one employee has in [from, to].
 * `days` is that employee's slice of the attendance map:
 * { 'YYYY-MM-DD': { status, custom_rate } }.
 */
export function markCounts(days = {}, from, to) {
  const out = { present: 0, halfDay: 0, leave: 0, sick: 0, absent: 0, worked: 0 };
  for (const [day, a] of Object.entries(days || {})) {
    if (!inWindow(day, from, to)) continue;
    const s = up(a?.status);
    if (s === 'PRESENT' || s === 'OT') out.present += 1;
    else if (s === 'HALF_DAY') out.halfDay += 1;
    else if (s === 'LEAVE') out.leave += 1;
    else if (s === 'SICK') out.sick += 1;
    else if (s === 'ABSENT') out.absent += 1;
    out.worked += WORKED_WEIGHT[s] || 0;
  }
  return out;
}

/** Day-rate wage for [from, to]: each worked day at its own rate if it has one. */
export function dayRateWage(days = {}, defaultRate, from, to) {
  let total = 0;
  for (const [day, a] of Object.entries(days || {})) {
    if (!inWindow(day, from, to)) continue;
    const weight = WORKED_WEIGHT[up(a?.status)] || 0;
    const rate = a?.custom_rate != null ? num(a.custom_rate) : num(defaultRate);
    total += weight * rate;
  }
  return total;
}

/** First and last day of the calendar month a date falls in. */
function monthOf(dateISO) {
  const [y, m] = String(dateISO).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/**
 * Paid leave used against the month's allowance.
 *
 * Counted over the whole calendar month the run ENDS in, not just the run's
 * window: "2 days a month" is a monthly promise, and a week-long run that saw
 * only one of three leave days would never warn. `allowed` of 0 or less means
 * no allowance is set, so nothing is ever "exceeded".
 */
export function leaveUse({ days = {}, to, allowed } = {}) {
  const limit = Math.max(0, Math.floor(num(allowed)));
  if (!to) return { used: 0, allowed: limit, exceeded: false, over: 0 };
  const month = monthOf(to);
  const used = markCounts(days, month.from, month.to).leave;
  const over = limit > 0 ? Math.max(0, used - limit) : 0;
  return { used, allowed: limit, exceeded: over > 0, over };
}

/** Net pay from a line's parts. One formula for every pay type. */
export function netOf(item) {
  // statutoryTotal must stay in this sum: leaving it out once meant editing a
  // bonus silently added the statutory deduction back to the payout.
  const net = num(item.basePay) + num(item.overtime) + num(item.commission)
            + num(item.bonus) - num(item.deductions) - num(item.alreadyPaid)
            - num(item.statutoryTotal);
  return Math.max(0, Math.round(net));
}

/**
 * One employee's line in a run.
 *
 * `records` are the earlier pay runs (for "already paid"); `adjust` carries the
 * owner's bonus / deductions / overtime / commission for this line.
 */
export function payRunItem({ employee, days = {}, from, to, records = [], adjust = {} } = {}) {
  const emp = employee || {};
  const payType = emp.pay_type || emp.payType;
  const dayRate = isDayRate(payType);
  const counts = markCounts(days, from, to);

  const salaried = dayRate ? null : salariedBasePay({
    salary: num(emp.salary) || num(emp.basePay),
    payType,
    from, to, days,
  });
  const basePay = dayRate
    ? Math.round(dayRateWage(days, emp.daily_rate ?? emp.dailyRate, from, to))
    : salaried.basePay;

  const alreadyPaid = paidForWindow({ from, to, employeeId: emp.id, records });

  // Worked out in the run, not when a slip is printed: the run writes a salary
  // expense of exactly netPay and that expense posts to the ledger.
  const statutoryLines = statutoryDeductions({
    gross: basePay,
    basic: basePay,
    config: {
      epf: !!emp.epf_enabled,
      epfOnFullWage: !!emp.epf_on_full_wage,
      esi: !!emp.esi_enabled,
      professionalTaxState: emp.professional_tax_state || null,
      tdsMonthly: num(emp.tds_monthly),
    },
  });
  const statutoryTotal = Math.round(statutoryLines.reduce((t, l) => t + l.amount, 0));

  // Leave allowance applies to salaried staff: day-rate staff are simply not
  // paid for a day off, so there is nothing to allow.
  const leave = dayRate
    ? { used: counts.leave, allowed: 0, exceeded: false, over: 0 }
    : leaveUse({ days, to, allowed: emp.paid_leave_per_month ?? emp.paidLeavePerMonth });

  const item = {
    employeeId:   emp.id,
    employeeName: emp.name,
    department:   emp.department,
    payType,
    daysWorked:   dayRate ? counts.worked : null,
    dailyRate:    num(emp.daily_rate ?? emp.dailyRate),
    basePay,
    salary:       salaried ? salaried.salary : null,
    lopDays:      salaried ? salaried.lopDays : null,
    lopAmount:    salaried ? salaried.lopAmount : null,
    periodDays:   salaried ? salaried.periodDays : null,
    cycleDays:    salaried ? salaried.cycleDays : null,
    alreadyPaid,
    statutoryLines,
    statutoryTotal,
    // The three additions. Counts only; none of them changes basePay.
    leaveDays:     counts.leave,
    sickDays:      counts.sick,
    leaveUsed:     leave.used,
    leaveAllowed:  leave.allowed,
    leaveExceeded: leave.exceeded,
    onLeave:       isOnLeave(emp),
    overtime:     num(adjust.overtime),
    commission:   num(adjust.commission),
    bonus:        num(adjust.bonus),
    deductions:   num(adjust.deductions),
  };
  item.netPay = netOf(item);
  return item;
}

/** Totals a run stores beside its lines. */
export function payRunTotals(items = []) {
  const sum = (k) => items.reduce((t, i) => t + num(i[k]), 0);
  return {
    totalBase: sum('basePay'),
    totalNet: sum('netPay'),
    totalOvertime: sum('overtime'),
    totalCommission: sum('commission'),
    totalBonus: sum('bonus'),
    totalDeductions: sum('deductions'),
  };
}

/**
 * What a run will take back from one person's staff advances. A PREVIEW: the
 * database works the real figure out again when the run is saved
 * (process_payroll_run), under a lock, and ignores any figure a client sends.
 *
 * `balance` is that person's row of staff_advance_balances:
 *   outstanding  what is still owed
 *   due_per_run  sum over open advances of min(fixed amount per run, what is
 *                left on that advance)
 * The take is never more than is owed and never more than `netPay` (net pay
 * does not go below 0; the rest waits for the next run). `skip` takes nothing
 * this run; `recoverAll` takes everything owed.
 */
export function planAdvanceRecovery({ netPay, balance, skip = false, recoverAll = false } = {}) {
  const outstanding = Math.max(0, num(balance?.outstanding));
  if (skip || outstanding <= 0) return { outstanding, planned: 0 };
  const due = recoverAll ? outstanding : Math.min(outstanding, Math.max(0, num(balance?.due_per_run)));
  const planned = Math.max(0, Math.min(due, num(netPay)));
  return { outstanding, planned: Math.round(planned * 100) / 100 };
}

/**
 * The whole run for a window.
 *
 * `items` are the lines that will be paid: every ACTIVE employee, plus any
 * ON_LEAVE employee whose id is in `includeOnLeave`. `held` are the on-leave
 * staff left out -- costed the same way, so the screen can show what switching
 * one in would add. Inactive staff appear in neither.
 *
 * `attendance` is { employeeId: { 'YYYY-MM-DD': { status, custom_rate } } }.
 * `adjustments` is { employeeId: { bonus, deductions, overtime, commission } }.
 *
 * `advances` (optional) is { employeeId: staff_advance_balances row }. When it
 * is given, every line also carries advanceOutstanding and advancePlanned.
 * netPay is NOT reduced by the advance: it stays what the person earned, which
 * is what process_payroll_run expects to be sent and takes the recovery from.
 */
export function buildPayRun({
  employees = [], attendance = {}, records = [], from, to,
  includeOnLeave = [], adjustments = {},
  advances = null, skipAdvance = [], recoverAll = [],
} = {}) {
  const switchedIn = new Set(includeOnLeave || []);
  const skip = new Set(skipAdvance || []);
  const all = new Set(recoverAll || []);
  const line = (emp) => {
    const item = payRunItem({
      employee: emp, days: attendance[emp.id], from, to, records,
      adjust: adjustments[emp.id],
    });
    if (advances) {
      const plan = planAdvanceRecovery({
        netPay: item.netPay, balance: advances[emp.id],
        skip: skip.has(emp.id), recoverAll: all.has(emp.id),
      });
      item.advanceOutstanding = plan.outstanding;
      item.advancePlanned = plan.planned;
    }
    return item;
  };

  const items = [];
  const held = [];
  for (const emp of employees || []) {
    if (isActive(emp)) items.push(line(emp));
    else if (isOnLeave(emp)) (switchedIn.has(emp.id) ? items : held).push(line(emp));
  }
  return { from, to, items, held, ...payRunTotals(items) };
}

export default buildPayRun;
