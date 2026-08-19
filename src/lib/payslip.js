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

import { describePeriod, monthToDate } from './payrollPeriods';

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
export function buildPayslip({ run, item, employee, business, records } = {}) {
  if (!run || !item) return null;

  const basePay    = num(item.basePay);
  const overtime   = num(item.overtime);
  const commission = num(item.commission);
  const bonus      = num(item.bonus);
  const deductions = num(item.deductions);

  // Recomputed rather than trusting the stored netPay, so a slip can never
  // print a total that disagrees with the lines above it. They match on every
  // stored run today; if one ever does not, `discrepancy` says so out loud
  // instead of the paper quietly showing one of two conflicting figures.
  const grossEarnings = basePay + overtime + commission + bonus;
  const netPay        = grossEarnings - deductions;
  const storedNet     = num(item.netPay);
  const discrepancy   = Math.abs(netPay - storedNet) > 0.005 ? storedNet : null;

  const daysWorked = num(item.daysWorked);
  const dailyRate  = num(item.dailyRate);
  const payType    = String(item.payType || '').toUpperCase();

  // Salaried staff carry the workings of their loss of pay; daily staff carry
  // the days-times-rate arithmetic. Either way the base figure on the slip has
  // to be checkable by the person holding it -- a bare number is not.
  const isDaily  = payType === 'DAILY' || payType === 'HOURLY';
  const salary   = num(item.salary);
  const lopDays  = num(item.lopDays);
  const lopAmt   = num(item.lopAmount);

  const earnings = [
    {
      label: isDaily ? 'Basic pay' : 'Salary',
      note: isDaily
        ? (dailyRate > 0
            ? `${daysWorked} day${daysWorked === 1 ? '' : 's'} × ₹${dailyRate.toLocaleString('en-IN')}`
            : null)
        : (lopAmt > 0
            ? `₹${salary.toLocaleString('en-IN')} less ${lopDays} day${lopDays === 1 ? '' : 's'} absent`
            : null),
      amount: basePay,
    },
    { label: 'Overtime',   note: null, amount: overtime },
    { label: 'Commission', note: null, amount: commission },
    { label: 'Bonus',      note: null, amount: bonus },
  ].filter(l => l.amount > 0);

  return {
    employeeName: item.employeeName || 'Employee',
    department: item.department || null,
    payType: item.payType || null,
    phone: employee?.phone || null,
    designation: employee?.designation || employee?.role || null,

    period: describePeriod(run.period),
    periodRaw: run.period || null,
    paidOn: run.processed_at || null,
    // The run id is what ties this paper back to a record, and unlike the
    // employee uuid it is the thing to quote when querying a slip.
    reference: run.id ? String(run.id).split('-')[0].toUpperCase() : null,

    earnings,
    // The month around this slip. Daily wages are paid in many small runs, so
    // a slip for one day is nearly meaningless alone -- the worker wants to see
    // what the month has come to. Only computed for daily wages: a salaried
    // employee is paid once for the month, so a running total would just
    // restate the net.
    monthToDate: isDaily && records ? monthToDate({ run, records, employeeId: item.employeeId }) : null,
    // Present only for salaried staff, and only when pay was actually lost.
    lossOfPay: !isDaily && lopAmt > 0
      ? { days: lopDays, amount: lopAmt, salary, periodDays: num(item.periodDays) }
      : null,
    grossEarnings,
    deductions,
    netPay,
    netPayInWords: amountInWords(netPay),
    discrepancy,

    // A zero slip is a real outcome (no days marked, or no rate set), and it
    // must read as one. Printing an ordinary-looking slip for ₹0 invites the
    // reading that a payment was made.
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
      gstin: business?.gstin || null,
    },
  };
}

export default buildPayslip;
