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
    expect(s.earnings[0].note).toBe('1 day × ₹900');
    expect(buildPayslip({ run, item: { ...akbar, daysWorked: 3, basePay: 2700 } })
      .earnings[0].note).toBe('3 days × ₹900');
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

  it('shows what was lost, so a reduced salary is not unexplained', () => {
    const s = buildPayslip({ run: monthRun, item: salaried });
    expect(s.earnings[0].note).toBe('₹31,000 less 2 days absent');
    expect(s.lossOfPay).toEqual({ days: 2, amount: 2000, salary: 31000, periodDays: 31 });
    expect(s.netPay).toBe(29000);
  });

  it('says nothing about loss of pay when none was lost', () => {
    // The common case: salaried staff are not on the attendance grid at all.
    const clean = { ...salaried, lopDays: 0, lopAmount: 0, basePay: 31000, netPay: 31000 };
    const s = buildPayslip({ run: monthRun, item: clean });
    expect(s.lossOfPay).toBeNull();
    expect(s.earnings[0].note).toBeNull();
    expect(s.netPay).toBe(31000);
  });

  it('never prints a days × rate line for salaried staff', () => {
    const s = buildPayslip({ run: monthRun, item: salaried });
    expect(s.earnings[0].note).not.toMatch(/×\s*₹0/);
    expect(s.earnings[0].note).not.toMatch(/day[s]? × /);
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
