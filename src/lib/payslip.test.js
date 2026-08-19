import { describe, it, expect } from 'vitest';
import { buildPayslip, amountInWords } from './payslip';

/**
 * A payslip is handed to a person as the record of their wage, so a wrong
 * figure on it is a wrong figure in someone's hand. These use the real shape
 * of `payroll.items` as stored by processPayroll.
 */

const run = {
  id: '186379e2-515c-40c8-b0f6-a0afca4e2e5f',
  period: '2026-08-17/2026-08-17',
  processed_at: '2026-08-17T11:55:00Z',
};

const akbar = {
  employeeId: 'f221935c-738d-4130-b2b9-7975ba3ca301',
  employeeName: 'Akbar', department: 'Management', payType: 'DAILY',
  dailyRate: 900, daysWorked: 1, hoursWorked: 160,
  basePay: 900, overtime: 0, commission: 0, bonus: 0, deductions: 0, netPay: 900,
};

describe('amountInWords', () => {
  it('uses Indian numbering, not millions', () => {
    expect(amountInWords(125000)).toBe('One Lakh Twenty Five Thousand Rupees Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
  });

  it('handles the figures this shop actually pays', () => {
    expect(amountInWords(900)).toBe('Nine Hundred Rupees Only');
    expect(amountInWords(1800)).toBe('One Thousand Eight Hundred Rupees Only');
    expect(amountInWords(25777)).toBe('Twenty Five Thousand Seven Hundred Seventy Seven Rupees Only');
  });

  it('says zero rather than an empty string', () => {
    // An empty words line next to a 0 figure reads as a printing fault.
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });

  it('does not invent paise', () => {
    expect(amountInWords(900.75)).toBe('Nine Hundred Rupees Only');
  });
});

describe('buildPayslip', () => {
  it('prints the run as it was frozen, not as recomputed today', () => {
    const s = buildPayslip({ run, item: akbar });
    expect(s.netPay).toBe(900);
    expect(s.grossEarnings).toBe(900);
    expect(s.netPayInWords).toBe('Nine Hundred Rupees Only');
    expect(s.period).toBe('17 Aug');
  });

  it('shows the arithmetic behind a daily wage', () => {
    // "1 day x 900" is checkable by the person holding the slip; "900" is not.
    const s = buildPayslip({ run, item: akbar });
    expect(s.earnings[0].note).toBe('1 day × ₹900.00');
    expect(buildPayslip({ run, item: { ...akbar, daysWorked: 3, basePay: 2700 } })
      .earnings[0].note).toBe('3 days × ₹900.00');
  });

  it('omits earnings lines that are zero', () => {
    // A slip listing Overtime 0, Commission 0, Bonus 0 buries the one real line.
    const s = buildPayslip({ run, item: akbar });
    expect(s.earnings.map(e => e.label)).toEqual(['Basic pay']);
  });

  it('keeps the extras that are non-zero, and nets deductions off', () => {
    const s = buildPayslip({ run, item: { ...akbar, overtime: 200, bonus: 100, deductions: 50 } });
    expect(s.earnings.map(e => e.label)).toEqual(['Basic pay', 'Overtime', 'Bonus']);
    expect(s.grossEarnings).toBe(1200);
    expect(s.netPay).toBe(1150);
  });

  it('never prints hoursWorked, which is the constant 160 on every run', () => {
    const s = buildPayslip({ run, item: akbar });
    expect(JSON.stringify(s)).not.toContain('160');
  });

  it('marks a nil slip and says why, instead of looking like a payment', () => {
    // Parthipan: marked days but no rate. This is a real stored row.
    const noRate = { ...akbar, employeeName: 'Parthipan', dailyRate: 0, daysWorked: 2,
                     basePay: 0, netPay: 0 };
    const s = buildPayslip({ run, item: noRate });
    expect(s.isNil).toBe(true);
    expect(s.nilReason).toMatch(/no daily rate/i);

    const noDays = { ...akbar, dailyRate: 900, daysWorked: 0, basePay: 0, netPay: 0 };
    expect(buildPayslip({ run, item: noDays }).nilReason).toMatch(/no days/i);
  });

  it('surfaces a stored net that disagrees with its own lines', () => {
    // The paper must not silently show one of two conflicting figures.
    const bad = { ...akbar, netPay: 5000 };
    const s = buildPayslip({ run, item: bad });
    expect(s.netPay).toBe(900);
    expect(s.discrepancy).toBe(5000);
  });

  it('is quiet when the stored net agrees', () => {
    expect(buildPayslip({ run, item: akbar }).discrepancy).toBeNull();
  });

  it('renders a whole-month period as a month, not a range', () => {
    expect(buildPayslip({ run: { ...run, period: '2026-08' }, item: akbar }).period)
      .toBe('August 2026');
  });

  it('returns null rather than a blank slip when there is nothing to print', () => {
    expect(buildPayslip({ run, item: null })).toBeNull();
    expect(buildPayslip({})).toBeNull();
  });
});

describe('a whole run of slips', () => {
  // "Print all" maps the run's items through the same buildPayslip. These
  // assert the batch behaves, using the real 17 Aug run: two paid, one nil.
  const items = [
    akbar,
    { ...akbar, employeeId: 'b2', employeeName: 'Nadirsha', department: 'Delivery' },
    { ...akbar, employeeId: 'b3', employeeName: 'Parthipan', department: 'Warehouse',
      dailyRate: 0, daysWorked: 0, basePay: 0, netPay: 0 },
  ];

  it('builds one slip per employee, in run order', () => {
    const slips = items.map(item => buildPayslip({ run, item }));
    expect(slips.map(s => s.employeeName)).toEqual(['Akbar', 'Nadirsha', 'Parthipan']);
  });

  it('keeps the nil employee as a slip rather than dropping them', () => {
    // Dropping them would make the printed stack disagree with the run, and
    // a nil slip is itself the record that nothing was owed.
    const slips = items.map(item => buildPayslip({ run, item }));
    expect(slips).toHaveLength(3);
    expect(slips.filter(s => s.isNil)).toHaveLength(1);
  });

  it('slips sum to the run total', () => {
    // The stack handed out must equal what the run says it paid.
    const total = items
      .map(item => buildPayslip({ run, item }).netPay)
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(1800);
  });

  it('gives every slip the same period and reference', () => {
    const slips = items.map(item => buildPayslip({ run, item }));
    expect(new Set(slips.map(s => s.period)).size).toBe(1);
    expect(new Set(slips.map(s => s.reference)).size).toBe(1);
  });
});

describe('salaried slips', () => {
  const salaried = {
    employeeId: 'm1', employeeName: 'Suresh', department: 'Management',
    payType: 'MONTHLY', dailyRate: 0, daysWorked: null,
    salary: 31000, periodDays: 31, lopDays: 2, lopAmount: 2000,
    basePay: 29000, overtime: 0, commission: 0, bonus: 0, deductions: 0, netPay: 29000,
  };
  const monthRun = { ...run, period: '2026-08' };

  it('labels the line Salary, not Basic pay', () => {
    const s = buildPayslip({ run: monthRun, item: salaried });
    expect(s.earnings[0].label).toBe('Salary');
  });

  it('keeps gross at the CONTRACT salary and puts the loss in deductions', () => {
    // The employee's question is "my salary is 31,000, why is this 28,000?".
    // Both figures must be on the page with the arithmetic between them.
    const s = buildPayslip({ run: monthRun, item: salaried });
    expect(s.earnings[0].amount).toBe(31000);
    expect(s.grossEarnings).toBe(31000);
    expect(s.deductionLines.map(l => l.label)).toContain('Loss of pay');
    expect(s.deductionLines.find(l => l.label === 'Loss of pay').amount).toBe(2000);
    expect(s.netPay).toBe(29000);
  });

  it('shows the per-day rate the loss was charged at', () => {
    const s = buildPayslip({ run: monthRun, item: salaried });
    expect(s.deductionLines.find(l => l.label === 'Loss of pay').note)
      .toBe('2 days absent × ₹1,000.00');
  });

  it('has no loss-of-pay line when none was lost', () => {
    const clean = { ...salaried, lopDays: 0, lopAmount: 0, basePay: 31000, netPay: 31000 };
    const s = buildPayslip({ run: monthRun, item: clean });
    expect(s.deductionLines).toHaveLength(0);
    expect(s.lossOfPay).toBeNull();
    expect(s.grossEarnings).toBe(31000);
    expect(s.netPay).toBe(31000);
  });

  it('totals always reconcile: gross − deductions = net', () => {
    // The invariant that makes the slip self-checking, whatever the lines are.
    for (const item of [salaried,
                        { ...salaried, overtime: 500, bonus: 250 },
                        { ...salaried, lopDays: 0, lopAmount: 0 },
                        akbar]) {
      const s = buildPayslip({ run: monthRun, item });
      expect(s.grossEarnings - s.deductions).toBe(s.netPay);
    }
  });

  it('explains a fully-absent month rather than just showing zero', () => {
    const gone = { ...salaried, lopDays: 31, lopAmount: 31000, basePay: 0, netPay: 0 };
    const s = buildPayslip({ run: monthRun, item: gone });
    expect(s.isNil).toBe(true);
    expect(s.nilReason).toMatch(/fully lost/i);
  });

  it('still shows days × rate for daily staff', () => {
    expect(buildPayslip({ run, item: akbar }).earnings[0].label).toBe('Basic pay');
  });
});

describe('month to date on a daily slip', () => {
  const AK = 'f221935c-738d-4130-b2b9-7975ba3ca301';
  const records = [
    { id: 'r1', period: '2026-08-01/2026-08-08', processed_at: '2026-08-08T11:55:00Z',
      items: [{ ...akbar, basePay: 3600, netPay: 3600, daysWorked: 4 }] },
    { id: 'r2', period: '2026-08-10/2026-08-10', processed_at: '2026-08-11T09:00:00Z',
      items: [akbar] },
    { id: 'r3', period: '2026-08-13/2026-08-13', processed_at: '2026-08-15T09:00:00Z',
      items: [akbar] },
    { id: 'r4', period: '2026-08-15/2026-08-15', processed_at: '2026-08-15T09:00:00Z',
      items: [akbar] },
    { id: 'r5', period: '2026-08-17/2026-08-17', processed_at: '2026-08-17T10:00:00Z',
      items: [akbar] },
  ];

  it('carries the real August running total', () => {
    const s = buildPayslip({ run: records[4], item: akbar, records });
    expect(s.monthToDate.priorAmount).toBe(6300);
    expect(s.monthToDate.totalAmount).toBe(7200);
    expect(s.monthToDate.totalDays).toBe(8);
  });

  it('the slip net is this run only, never the month total', () => {
    // The figure handed over today must not become the month's running sum.
    const s = buildPayslip({ run: records[4], item: akbar, records });
    expect(s.netPay).toBe(900);
    expect(s.monthToDate.thisAmount).toBe(900);
  });

  it('is absent when the run history was not supplied', () => {
    // Printing a month total of zero would be a lie; absent is honest.
    expect(buildPayslip({ run: records[4], item: akbar }).monthToDate).toBeNull();
  });

  it('is not computed for salaried staff', () => {
    // They are paid once for the month; a running total would restate the net.
    const salaried = { ...akbar, payType: 'MONTHLY', salary: 31000, lopDays: 0, lopAmount: 0 };
    expect(buildPayslip({ run: records[4], item: salaried, records }).monthToDate).toBeNull();
  });
});

describe('already-paid netting', () => {
  it('appears as a deduction so the slip still reconciles', () => {
    // The run nets prior payment off an overlapping window. If the slip did not
    // show it, gross minus deductions would not reach the printed net.
    const item = { ...akbar, basePay: 3600, daysWorked: 4, alreadyPaid: 900, netPay: 2700 };
    const s = buildPayslip({ run, item });
    expect(s.deductionLines.map(l => l.label)).toContain('Already paid this period');
    expect(s.grossEarnings).toBe(3600);
    expect(s.deductions).toBe(900);
    expect(s.netPay).toBe(2700);
    expect(s.discrepancy).toBeNull();
  });

  it('is absent when nothing was paid earlier for this window', () => {
    expect(buildPayslip({ run, item: akbar }).deductionLines).toHaveLength(0);
  });
});
