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

describe('a monthly slip for a daily wage', () => {
  const AK = 'f221935c-738d-4130-b2b9-7975ba3ca301';
  const rec = (id, period, at, net, days) => ({ id, period, processed_at: at,
    items: [{ ...akbar, basePay: net, netPay: net, daysWorked: days }] });
  const records = [
    rec('r1', '2026-08-01/2026-08-08', '2026-08-08T11:55:00Z', 3600, 4),
    rec('r2', '2026-08-10/2026-08-10', '2026-08-11T09:00:00Z', 900, 1),
    rec('r3', '2026-08-13/2026-08-13', '2026-08-15T09:00:00Z', 900, 1),
    rec('r4', '2026-08-15/2026-08-15', '2026-08-15T09:00:00Z', 900, 1),
    rec('r5', '2026-08-17/2026-08-17', '2026-08-17T10:00:00Z', 900, 1),
  ];
  // What monthlyPayItem produces: the month collapsed into one item.
  const monthRun = { id: '2026-08:' + AK, period: '2026-08', processed_at: '2026-08-17T10:00:00Z' };
  const monthItem = { ...akbar, basePay: 7200, netPay: 7200, daysWorked: 8 };
  const payments = [
    { id: 'r1', label: '1 Aug – 8 Aug', amount: 3600, days: 4 },
    { id: 'r2', label: '10 Aug', amount: 900, days: 1 },
    { id: 'r3', label: '13 Aug', amount: 900, days: 1 },
    { id: 'r4', label: '15 Aug', amount: 900, days: 1 },
    { id: 'r5', label: '17 Aug', amount: 900, days: 1 },
  ];

  it('states the month, not a single day', () => {
    const s = buildPayslip({ run: monthRun, item: monthItem, payments });
    expect(s.period).toBe('August 2026');
    expect(s.netPay).toBe(7200);
    expect(s.earnings[0].note).toBe('8 days × ₹900.00');
  });

  it('lists the payments that made up the month, summing to the net', () => {
    const s = buildPayslip({ run: monthRun, item: monthItem, payments });
    expect(s.payments).toHaveLength(5);
    expect(s.payments.reduce((t, p) => t + p.amount, 0)).toBe(s.netPay);
  });

  it('carries a financial-year total when the history is supplied', () => {
    const s = buildPayslip({ run: records[4], item: akbar, records });
    expect(s.yearToDate.year).toBe('2026-27');
    expect(s.yearToDate.totalAmount).toBe(7200);
  });

  it('has no year-to-date when the history was not supplied', () => {
    // Printing a year total of zero would misstate what someone has earned.
    expect(buildPayslip({ run: monthRun, item: monthItem }).yearToDate).toBeNull();
  });
});

describe('deposit details', () => {
  it('names how it was paid', () => {
    const s = buildPayslip({ run, item: akbar, payment: { mode: 'CASH' } });
    expect(s.deposit.modeLabel).toBe('Paid in cash');
  });

  it('does not name a company account for a cash payment', () => {
    // "From Company Cash" adds nothing that "Paid in cash" has not said.
    const s = buildPayslip({ run, item: akbar, payment: { mode: 'CASH', accountName: 'Company Cash' } });
    expect(s.deposit.fromAccount).toBeNull();
  });

  it('does name the account for a bank or UPI payment', () => {
    const s = buildPayslip({ run, item: akbar, payment: { mode: 'BANK', accountName: 'Company UBI' } });
    expect(s.deposit.modeLabel).toBe('Paid by bank');
    expect(s.deposit.fromAccount).toBe('Company UBI');
  });

  it('masks the employee account — a slip can be lost or photographed', () => {
    const s = buildPayslip({ run, item: akbar, payment: { mode: 'BANK' },
                             employee: { bank_account: '685201010050171' } });
    expect(s.deposit.toAccount).toBe('•••• 0171');
    expect(JSON.stringify(s)).not.toContain('685201010050171');
  });

  it('stays absent rather than guessing when nothing is recorded', () => {
    // Every live run today records the method on its expense, but a slip that
    // invented "Paid in cash" would be asserting something it does not know.
    expect(buildPayslip({ run, item: akbar }).deposit).toBeNull();
  });

  it('still renders the deposit account when the mode is unknown', () => {
    const s = buildPayslip({ run, item: akbar, employee: { bank_account: '1234567890' } });
    expect(s.deposit.toAccount).toBe('•••• 7890');
    expect(s.deposit.modeLabel).toBeNull();
  });
});

describe('employee identity', () => {
  it('prints the employee code, not the uuid', () => {
    const s = buildPayslip({ run, item: akbar,
      employee: { id: 'f221935c-738d-4130-b2b9-7975ba3ca301', employee_code: 'EMP-001' } });
    expect(s.employeeCode).toBe('EMP-001');
    expect(JSON.stringify(s)).not.toContain('f221935c');
  });

  it('leaves the code out rather than inventing one', () => {
    expect(buildPayslip({ run, item: akbar }).employeeCode).toBeNull();
  });

  it('lists only the statutory ids the record actually holds', () => {
    const s = buildPayslip({ run, item: akbar,
      employee: { pan: 'ABCDE1234F', pf_account: '', esi_no: '  ' } });
    expect(s.statutory).toEqual([{ label: 'PAN', value: 'ABCDE1234F' }]);
  });

  it('is empty when none are set, so no row of dashes implies a PF scheme', () => {
    // All four live employees are in exactly this state.
    expect(buildPayslip({ run, item: akbar, employee: {} }).statutory).toEqual([]);
  });

  it('never prints Aadhaar, even when the record holds one', () => {
    // A national identity number has no payroll purpose and the slip is
    // photographed, filed openly and handed across a counter.
    const s = buildPayslip({ run, item: akbar,
      employee: { aadhaar: '123412341234', pan: 'ABCDE1234F' } });
    expect(JSON.stringify(s)).not.toContain('123412341234');
    expect(s.statutory.map(x => x.label)).not.toContain('Aadhaar');
  });
});

describe('statutory deductions come from the run, not from the slip', () => {
  /**
   * The run computes them, stores them on the item, and writes a salary expense
   * of exactly netPay. If the slip recomputed instead of rendering, it could
   * print a figure the ledger never saw -- the slip would contradict the books
   * it exists to evidence.
   */
  const withStatutory = {
    ...akbar,
    basePay: 20000, netPay: 18104,
    statutoryLines: [
      { label: 'Provident fund', note: '12% of 15,000', amount: 1800, statutory: true },
      { label: 'ESI', note: '0.75% of gross', amount: 150, statutory: true },
      { label: 'Professional tax', note: 'Kerala · 300 half-yearly', amount: 50, statutory: true },
    ],
    statutoryTotal: 2000,
  };

  it('prints the lines the run stored', () => {
    const s = buildPayslip({ run, item: withStatutory });
    expect(s.deductionLines.map(l => l.label))
      .toEqual(['Provident fund', 'ESI', 'Professional tax']);
    expect(s.deductions).toBe(2000);
  });

  it('reconciles: gross − deductions = net, and matches what the run recorded', () => {
    const s = buildPayslip({ run, item: withStatutory });
    expect(s.grossEarnings).toBe(20000);
    expect(s.netPay).toBe(18000);
    // The stored net is 18,104 here on purpose: it does NOT agree, and the slip
    // must say so rather than quietly showing one of two figures.
    expect(s.discrepancy).toBe(18104);
  });

  it('is silent when the run and the lines agree', () => {
    const s = buildPayslip({ run, item: { ...withStatutory, netPay: 18000 } });
    expect(s.discrepancy).toBeNull();
    expect(s.grossEarnings - s.deductions).toBe(s.netPay);
  });

  it('shows no statutory lines for an employee not configured for any', () => {
    // Every live employee is in this state: EPF is compulsory at 20 staff and
    // ESI at 10, and the largest tenant here has three.
    const s = buildPayslip({ run, item: akbar });
    expect(s.deductionLines).toHaveLength(0);
    expect(s.netPay).toBe(900);
  });

  it('cannot invent a deduction the run did not record', () => {
    // No statutoryLines on the item means none on the paper, whatever the
    // employee's configuration happens to say today.
    const s = buildPayslip({ run, item: { ...akbar, basePay: 50000, netPay: 50000 } });
    expect(s.deductionLines).toHaveLength(0);
    expect(s.netPay).toBe(50000);
  });
});
