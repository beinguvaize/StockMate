/**
 * One employee's line of a pay run, in the shape a payslip prints.
 *
 * A payslip is handed to a person as the record of what they were paid, so it
 * has to be derivable from what was actually stored at the time of the run --
 * never recomputed from today's attendance or today's rates. `payroll.items`
 * already froze every figure when the run was processed; this reads that and
 * nothing else. If an employee's daily rate changes next month, last month's
 * slip must not change with it.
 *
 * Two things in the stored item are deliberately NOT printed:
 *
 *  · `hoursWorked` is the constant 160 on every item ever written, including
 *    an employee who worked no days at all. It is not a measurement, so
 *    printing it would put a made-up number on a wage document.
 *  · `employeeId` is an internal uuid and means nothing to the person holding
 *    the paper.
 */

import { describePeriod, monthToDate, yearToDate } from './payrollPeriods';
import { statutoryDeductions } from './statutory';

/** Rupees, Indian grouping, always two decimals -- it is a money document. */
export const money = (v) => `₹${(Number(v) || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const under100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);

/**
 * Rupees in words, Indian numbering (lakh / crore, not million).
 *
 * A wage slip is a document someone may have to contest, and figures in words
 * are the convention here precisely because a digit cannot be added to them
 * afterwards. Paise are dropped: every stored netPay is whole rupees, and
 * inventing a paise line would imply a precision the run never had.
 */
export function amountInWords(value) {
  const n = Math.floor(Math.abs(num(value)));
  if (n === 0) return 'Zero Rupees Only';

  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  if (crore) parts.push(`${under100(crore)} Crore`);
  if (lakh) parts.push(`${under100(lakh)} Lakh`);
  if (thousand) parts.push(`${under100(thousand)} Thousand`);
  if (rest) {
    const hundred = Math.floor(rest / 100);
    if (hundred) parts.push(`${ONES[hundred]} Hundred`);
    if (rest % 100) parts.push(under100(rest % 100));
  }
  return `${parts.join(' ')} Rupees Only`;
}

/**
 * `run` is a payrollRecord (camelCase, from toPayrollRecord), `item` one entry
 * of its items array, `employee` the optional employees row for contact detail
 * the run did not freeze.
 */
export function buildPayslip({ run, item, employee, business, records, payment,
                              payments, statutoryConfig } = {}) {
  if (!run || !item) return null;

  const basePay     = num(item.basePay);
  const overtime    = num(item.overtime);
  const commission  = num(item.commission);
  const bonus       = num(item.bonus);
  const deductions  = num(item.deductions);
  const alreadyPaid = num(item.alreadyPaid);

  const daysWorked = num(item.daysWorked);
  const dailyRate  = num(item.dailyRate);
  const payType    = String(item.payType || '').toUpperCase();

  const isDaily    = payType === 'DAILY' || payType === 'HOURLY';
  const salary     = num(item.salary);
  const lopDays    = num(item.lopDays);
  const lopAmt     = num(item.lopAmount);
  const periodLen  = num(item.periodDays);
  // Per-day is the salary over the PAY CYCLE -- 7 days for a weekly wage, the
  // month's length for a monthly one -- not over whatever window was run.
  // Dividing by the period would print "1,000 a day" for a weekly employee paid
  // 7,000 across a 31-day run, when the true rate is 1,000 and the period buys
  // 31 of them, not 7.
  const cycleLen   = num(item.cycleDays) || periodLen;
  const perDay     = cycleLen > 0 ? salary / cycleLen : 0;

  // Loss of pay is shown as a DEDUCTION rather than folded into the salary
  // line, so gross reads the figure on the employee's contract. "Salary 31,000,
  // less 2,500 lost" is checkable; a bare 28,500 makes them do the subtraction
  // themselves to find out whether it is right.
  const earnings = [
    {
      label: isDaily ? 'Basic pay' : 'Salary',
      // The base figure has to be checkable by the person holding the slip.
      // A bare number is not.
      note: isDaily
        ? (dailyRate > 0 ? `${daysWorked} day${daysWorked === 1 ? '' : 's'} × ${money(dailyRate)}` : null)
        : (perDay > 0 ? `${periodLen} days × ${money(perDay)}` : null),
      amount: isDaily ? basePay : (salary > 0 ? salary : basePay),
    },
    { label: 'Overtime',   note: null, amount: overtime },
    { label: 'Commission', note: null, amount: commission },
    { label: 'Bonus',      note: null, amount: bonus },
  ].filter(l => l.amount > 0);

  // Statutory deductions come first: they are the ones the employee is most
  // likely to be checking, and the ones reported to the department.
  const statLines = statutoryDeductions({
    gross: basePay + overtime + commission + bonus,
    basic: basePay,
    config: statutoryConfig,
  });

  const deductionLines = [
    ...statLines,
    lopAmt > 0 ? {
      label: 'Loss of pay',
      note: perDay > 0
        ? `${lopDays} day${lopDays === 1 ? '' : 's'} absent × ${money(perDay)}`
        : `${lopDays} day${lopDays === 1 ? '' : 's'} absent`,
      amount: lopAmt,
    } : null,
    // Money already handed over for a window this run overlaps. The run nets it
    // off, so it has to appear here too -- otherwise gross minus deductions
    // does not reach the figure printed at the bottom of the slip.
    alreadyPaid > 0 ? { label: 'Already paid this period', note: null, amount: alreadyPaid } : null,
    deductions > 0  ? { label: 'Deductions', note: null, amount: deductions } : null,
  ].filter(Boolean);

  // Totals come from the printed lines, so the slip can never show a total that
  // disagrees with what is above it. If the run's own netPay disagrees with
  // that, `discrepancy` says so out loud rather than quietly picking one.
  const grossEarnings   = earnings.reduce((t, l) => t + l.amount, 0);
  const totalDeductions = deductionLines.reduce((t, l) => t + l.amount, 0);
  const netPay          = grossEarnings - totalDeductions;
  const storedNet       = num(item.netPay);
  const discrepancy     = Math.abs(netPay - storedNet) > 0.005 ? storedNet : null;

  return {
    employeeName: item.employeeName || 'Employee',
    department: item.department || null,
    payType: item.payType || null,
    phone: employee?.phone || null,
    designation: employee?.position || employee?.role || null,
    // The employee number, which is what a person quotes when querying a slip.
    // The uuid is not that -- it means nothing to them and does not belong on a
    // document that leaves the office.
    employeeCode: employee?.employee_code || null,
    joinedOn: employee?.joining_date || null,
    employmentType: employee?.employment_type || null,

    period: describePeriod(run.period),
    periodRaw: run.period || null,
    paidOn: run.processed_at || null,
    reference: run.id ? String(run.id).split('-')[0].toUpperCase() : null,

    // Where the money went. The pay run itself records none of this -- the
    // method and the account live on the salary EXPENSE the run creates, which
    // is why the caller resolves it and passes it in. Rendered only when known:
    // a slip claiming a payment mode it is guessing at is worse than one that
    // stays quiet about it.
    deposit: buildDeposit(payment, employee),

    // Statutory identifiers, each rendered only when the record holds one. A
    // row of dashes would imply this business operates a PF or ESI scheme it
    // does not. Aadhaar is deliberately NOT among them: it is on the employee
    // record, but printing a national identity number on a wage slip that gets
    // photographed and filed openly is a risk with no payroll purpose.
    statutory: [
      ['PAN', employee?.pan],
      ['PF A/C', employee?.pf_account],
      ['ESI No', employee?.esi_no],
    ].filter(([, v]) => String(v || '').trim())
     .map(([k, v]) => ({ label: k, value: String(v).trim() })),

    payBasis: isDaily
      ? (dailyRate > 0 ? `Daily · ${money(dailyRate)}` : 'Daily wage')
      : (salary > 0 ? `Monthly · ${money(salary)}` : 'Monthly salary'),

    earnings,
    deductionLines,
    grossEarnings,
    deductions: totalDeductions,
    netPay,
    netPayInWords: amountInWords(netPay),
    discrepancy,

    // The month around this slip. Daily wages are paid in many small runs, so a
    // slip for one day is nearly meaningless alone. Not computed for salaried
    // staff -- they are paid once for the month, so it would restate the net.
    // The individual payments that made up this month. A monthly slip for a
    // daily wage is a summary of several handovers, and the worker needs to see
    // which days each one covered.
    payments: payments || (isDaily && records
      ? monthToDate({ run, records, employeeId: item.employeeId })?.payments || null
      : null),

    // Financial year to date -- April to March, the window every payroll return
    // is measured against.
    yearToDate: records ? yearToDate({ run, records, employeeId: item.employeeId }) : null,

    // Attendance is the salaried equivalent of that block: what was paid of
    // what the period held.
    attendance: !isDaily && periodLen > 0
      ? { paidDays: Math.max(0, periodLen - lopDays), periodDays: periodLen, lopDays }
      : null,

    lossOfPay: !isDaily && lopAmt > 0
      ? { days: lopDays, amount: lopAmt, salary, periodDays: periodLen }
      : null,

    isNil: netPay <= 0,
    nilReason: netPay > 0 ? null
      : !isDaily && lopAmt > 0 ? 'The whole period was marked absent, so the salary is fully lost.'
      : !isDaily              ? 'No salary is set for this employee.'
      : daysWorked <= 0       ? 'No days were marked for this period.'
      : dailyRate <= 0        ? 'No daily rate is set for this employee, so the marked days are worth nothing.'
      : 'Nothing was payable for this period.',

    business: {
      name: business?.businessName || business?.name || 'Business',
      address: business?.address || null,
      phone: business?.phone || null,
      gstin: business?.gst_no || business?.gstin || null,
    },
  };
}

/**
 * The deposit block. `payment` is { mode, accountName } for the run, resolved
 * from the linked salary expense; `employee.bank_account` is the account the
 * money was deposited INTO, when the employee record holds one.
 */
function buildDeposit(payment, employee) {
  const mode = payment?.mode ? String(payment.mode).toUpperCase() : null;
  const acct = String(employee?.bank_account || '').trim();
  if (!mode && !acct) return null;

  return {
    mode,
    // "Paid in cash" reads better than "Paid by CASH".
    modeLabel: mode === 'CASH' ? 'Paid in cash'
      : mode === 'UPI' ? 'Paid by UPI'
      : mode ? `Paid by ${mode.toLowerCase()}` : null,
    // The company account the money left. Only meaningful for a bank movement:
    // naming a cash box adds nothing the mode has not already said.
    fromAccount: mode && mode !== 'CASH' ? (payment?.accountName || null) : null,
    // Never print a full account number on a document that leaves the office.
    toAccount: acct ? maskAccount(acct) : null,
  };
}

/** Last four digits only. A payslip can be lost, photographed or filed openly. */
export function maskAccount(value) {
  const digits = String(value || '').replace(/\s+/g, '');
  if (!digits) return null;
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

export default buildPayslip;
