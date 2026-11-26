/**
 * What each employee has earned, been paid and is still owed for one month.
 *
 * The staff table and the Dashboard's "Salary Pending" used to read two numbers
 * typed by hand on the employee row (days_worked, amount_paid). Nothing kept
 * them in step with attendance or with pay runs, so a run could be processed
 * and the table still showed the old typed figure -- or a minus.
 *
 * Nothing is worked out here. Each row is the pay-run line for the whole month
 * (payRun.js), which is also what the phone's "Still to pay" shows, so the
 * three screens cannot disagree.
 */

import { payRunItem, isDayRate } from './payRun.js';

const pad = (n) => String(n).padStart(2, '0');

/** First and last day of 'YYYY-MM'. */
export function monthWindow(month) {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

/**
 * One row per employee for `month` ('YYYY-MM').
 *
 * `attendance` is { employeeId: { 'YYYY-MM-DD': { status, custom_rate } } } for
 * that month; `records` are the saved pay runs. Every employee passed in gets a
 * row, inactive ones too: someone who left mid-month can still be owed for the
 * days they worked.
 */
export function staffDues({ employees = [], attendance = {}, records = [], month } = {}) {
  const win = monthWindow(month);
  if (!win) return [];
  return (employees || []).map((employee) => {
    const line = payRunItem({
      employee, days: attendance?.[employee.id], from: win.from, to: win.to, records,
    });
    const dayRate = isDayRate(line.payType);
    return {
      employee,
      id: employee.id,
      dayRate,
      payType: line.payType,
      // The figure the employee is paid by: a day's rate, or the salary.
      rate: dayRate ? line.dailyRate : Number(line.salary) || 0,
      daysWorked: dayRate ? line.daysWorked : null,
      absentDays: dayRate ? null : Number(line.lopDays) || 0,
      earned: line.basePay,
      statutory: line.statutoryTotal,
      paid: line.alreadyPaid,
      pending: line.netPay,
    };
  });
}

/** Total still owed across the rows. */
export const totalPending = (rows = []) =>
  rows.reduce((sum, r) => sum + (Number(r.pending) || 0), 0);

export default staffDues;
