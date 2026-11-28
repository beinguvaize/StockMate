import { describe, it, expect } from 'vitest';
import { buildPayRun } from './payRun';
import {
  runKind, runKindLabel, runWindow, windowProblem, mondayOf, addDays, daysInclusive,
  staffRows, listTotals, filterStaff, historyLine, historyTotals, salaryStatement,
  maskSensitive, rangeWords, periodWords, markTally, financialYearOf, initials, shopDay,
} from './payrollView';

// The server function IS buildPayRun (payroll-run bundles it), so a run built
// here is exactly what the web now receives from the server.
const staff = [
  { id: 'a', name: 'Staff A', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 15000, department: 'Sales', position: 'Cashier' },
  { id: 'b', name: 'Staff B', status: 'ACTIVE', pay_type: 'DAILY', daily_rate: 600, department: 'Warehouse', position: 'Loader' },
  { id: 'c', name: 'Staff C', status: 'ON_LEAVE', pay_type: 'MONTHLY', salary: 9000, department: 'Admin' },
  { id: 'd', name: 'Staff D', status: 'INACTIVE', pay_type: 'MONTHLY', salary: 12000, department: 'Sales' },
  { id: 'e', name: 'Staff E', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 20000, epf_enabled: true, professional_tax_state: 'KARNATAKA', department: 'Sales' },
];
const attendance = {
  a: { '2026-11-18': { status: 'ABSENT', custom_rate: null } },
  b: {
    '2026-11-02': { status: 'PRESENT', custom_rate: null },
    '2026-11-03': { status: 'PRESENT', custom_rate: 800 },
    '2026-11-04': { status: 'HALF_DAY', custom_rate: null },
    '2026-11-20': { status: 'PRESENT', custom_rate: null },
  },
};
// A first-half run, paid on 20 Nov, and a run that spans the month end.
const records = [
  {
    id: 'r1-aaaa', period: '2026-11-01/2026-11-15', processed_at: '2026-11-20T06:00:00Z',
    items: [
      { employeeId: 'a', netPay: 7500, payType: 'MONTHLY' },
      { employeeId: 'b', netPay: 1700, payType: 'DAILY' },
    ],
  },
  {
    id: 'r0-bbbb', period: '2026-10-25/2026-11-03', processed_at: '2026-11-03T12:00:00Z',
    items: [{ employeeId: 'e', netPay: 5000, payType: 'MONTHLY' }],
  },
];
const run = buildPayRun({ employees: staff, attendance, records, from: '2026-11-01', to: '2026-11-30' });

describe('run types', () => {
  it('labels a month, a Monday-to-Sunday week and anything else', () => {
    expect(runKind('2026-11')).toBe('MONTHLY');
    expect(runKind('2026-11-16/2026-11-22')).toBe('WEEKLY');   // Mon to Sun
    expect(runKind('2026-11-01/2026-11-15')).toBe('CUSTOM');   // the bug: this read "Weekly"
    expect(runKind('2026-11-17/2026-11-23')).toBe('CUSTOM');   // 7 days, not from a Monday
    expect(runKind('2026-11-20/2026-11-20')).toBe('CUSTOM');   // one day
    expect(runKind('2026-11-01/2026-11-30')).toBe('MONTHLY');  // a whole month as dates
    expect(runKind('')).toBe(null);
    expect(runKindLabel('2026-11-01/2026-11-15')).toBe('Custom');
    expect(runKindLabel('2026-11')).toBe('Monthly');
  });

  it('works out the window each mode covers', () => {
    expect(runWindow({ mode: 'MONTHLY', month: '2026-02' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(runWindow({ mode: 'WEEKLY', weekStart: '2026-11-23' })).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(runWindow({ mode: 'CUSTOM', from: '2026-11-16', to: '2026-11-27' })).toEqual({ from: '2026-11-16', to: '2026-11-27' });
    expect(windowProblem({ from: '2026-11-20', to: '2026-11-19' })).toMatch(/before the start/);
    expect(windowProblem({ from: '2026-11-20', to: '2026-11-20' })).toBe(null);
    expect(windowProblem(null)).toMatch(/Choose/);
  });

  it('counts dates without a timezone moving them', () => {
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');  // Sunday belongs to the week before
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysInclusive('2026-11-16', '2026-11-27')).toBe(12);
    expect(rangeWords('2026-11-16', '2026-11-27')).toBe('16 – 27 Nov 2026');
    expect(rangeWords('2026-11-28', '2026-12-04')).toBe('28 Nov – 4 Dec 2026');
    expect(periodWords('2026-11')).toBe('November 2026');
    // 20:00 UTC on the 19th is already the 20th in the shop (IST).
    expect(shopDay('2026-11-19T20:00:00Z')).toBe('2026-11-20');
  });
});

describe('staff list figures', () => {
  const rows = staffRows({ employees: staff, run });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  it('takes every figure straight from the server line', () => {
    const line = run.items.find((i) => i.employeeId === 'a');
    expect(byId.a.earned).toBe(line.basePay);
    expect(byId.a.paid).toBe(line.alreadyPaid);
    expect(byId.a.pending).toBe(line.netPay);
    expect(byId.a.pending).toBe(7000);   // 15,000 less one absent day, less 7,500 paid
  });

  it('shows on-leave staff from the held lines and inactive staff with no figures', () => {
    expect(byId.c.kind).toBe('onleave');
    expect(byId.c.pending).toBe(9000);
    expect(byId.d.kind).toBe('inactive');
    expect(byId.d.pending).toBe(null);   // the bug: inactive staff showed as pending
    expect(byId.d.earned).toBe(null);
  });

  it('adds up only active rows, which is what a month run pays', () => {
    const t = listTotals(rows);
    expect(t.activeCount).toBe(3);
    expect(t.onLeaveCount).toBe(1);
    expect(t.inactiveCount).toBe(1);
    expect(t.stillToPay).toBe(run.totalNet);       // the tile = what Run payroll would pay
    expect(t.earned).toBe(run.totalBase);
    // Earned − deductions − already paid = still to pay, row by row.
    expect(t.earned - t.statutory - t.paid).toBe(t.stillToPay);
  });

  it('shows no figures when the run could not be loaded', () => {
    const none = staffRows({ employees: staff, run: null });
    expect(none.every((r) => r.pending === null)).toBe(true);
    expect(listTotals(none).loaded).toBe(false);
  });

  it('searches name, role and department', () => {
    expect(filterStaff(rows, { query: 'loader' }).map((r) => r.id)).toEqual(['b']);
    expect(filterStaff(rows, { department: 'Sales' }).map((r) => r.id)).toEqual(['a', 'd', 'e']);
    expect(filterStaff(rows, { query: 'nobody' })).toEqual([]);
    expect(initials('Staff A')).toBe('SA');
  });
});

describe('salary statement', () => {
  const rows = staffRows({ employees: staff, run });
  const methods = { 'r1-aaaa': 'BANK', 'r0-bbbb': 'CASH' };

  for (const id of ['a', 'b', 'e']) {
    it(`agrees with the list for ${id}`, () => {
      const row = rows.find((r) => r.id === id);
      const st = salaryStatement({ line: row.line, month: '2026-11', records, methods, accountFor: (m) => `${m} account` });
      expect(st.agrees).toBe(true);
      // Earned column (after deductions), paid column and closing balance are
      // the list's Earned − deductions, Paid and Pending.
      expect(Math.round(st.totals.earned)).toBe(row.earned - row.statutory);
      expect(Math.round(st.totals.paid)).toBe(row.paid);
      expect(st.closing).toBe(row.pending);
      // The balance column is the rows added in order.
      const last = st.rows[st.rows.length - 1].balance;
      expect(Math.round(last)).toBe(st.closing);
    });
  }

  it('lists each payment with how it was paid', () => {
    const line = run.items.find((i) => i.employeeId === 'a');
    const st = salaryStatement({ line, month: '2026-11', records, methods, accountFor: () => 'Shop current account' });
    const paid = st.rows.filter((r) => r.type === 'paid');
    expect(paid).toHaveLength(1);
    expect(paid[0].paid).toBe(7500);
    expect(paid[0].date).toBe('2026-11-20');
    expect(paid[0].note).toBe('Bank · Shop current account · R1');
  });

  it('shows statutory deductions as their own lines', () => {
    const line = run.items.find((i) => i.employeeId === 'e');
    const st = salaryStatement({ line, month: '2026-11', records, methods });
    const ded = st.rows.filter((r) => r.type === 'deduction');
    expect(ded.length).toBeGreaterThan(0);
    expect(-ded.reduce((t, r) => t + r.earned, 0)).toBe(line.statutoryTotal);
  });

  it('counts only the part of a run that falls in the month', () => {
    // r0 covers 25 Oct – 3 Nov: only 3 of its 10 days are November's.
    const line = run.items.find((i) => i.employeeId === 'e');
    expect(line.alreadyPaid).toBe(1500);
    const st = salaryStatement({ line, month: '2026-11', records, methods });
    const adj = st.rows.find((r) => r.type === 'adjust');
    expect(adj.paid).toBe(-3500);
    expect(st.totals.paid).toBe(1500);
  });

  it('says when someone has been paid ahead', () => {
    const line = { employeeId: 'x', payType: 'MONTHLY', basePay: 1000, statutoryTotal: 0, statutoryLines: [], alreadyPaid: 1500, netPay: 0 };
    const recs = [{ id: 'r9', period: '2026-11', processed_at: '2026-11-05T05:00:00Z', items: [{ employeeId: 'x', netPay: 1500 }] }];
    const st = salaryStatement({ line, month: '2026-11', records: recs });
    expect(st.closing).toBe(-500);
    expect(st.paidAhead).toBe(500);
    expect(st.agrees).toBe(true);
  });

  it('stops the earned row at today in a month still running', () => {
    const line = run.items.find((i) => i.employeeId === 'a');
    const st = salaryStatement({ line, month: '2026-11', records, asOf: '2026-11-27' });
    expect(st.rows[0].title).toBe('Salary earned, 1 – 27 Nov');
  });
});

describe('pay history lines', () => {
  it('adds up base + extras − deductions − paid earlier = net, statutory included', () => {
    const item = { basePay: 20000, overtime: 500, bonus: 1000, commission: 0, deductions: 200, statutoryTotal: 1800, alreadyPaid: 5000, netPay: 14500 };
    const h = historyLine(item);
    expect(h.deductions).toBe(2000);
    expect(h.agrees).toBe(true);
    expect(h.base + h.extras - h.deductions - h.paidEarlier).toBe(h.net);
  });

  it('flags a line floored at zero', () => {
    expect(historyLine({ basePay: 100, alreadyPaid: 500, netPay: 0 }).agrees).toBe(false);
  });

  it('totals a run from its lines', () => {
    const t = historyTotals([{ basePay: 100, netPay: 100 }, { basePay: 50, bonus: 10, netPay: 60 }, { basePay: 0, netPay: 0 }]);
    expect(t).toMatchObject({ base: 150, extras: 10, net: 160, paidCount: 2 });
  });
});

describe('masking', () => {
  it('shows only the last four characters', () => {
    expect(maskSensitive('1234 5678 7734')).toBe('XXXX XXXX 7734');
    expect(maskSensitive('50100234564821')).toBe('XXXX XXXX 4821');
    expect(maskSensitive('ABCDE1821L')).toBe('XXXXXX821L');
    expect(maskSensitive('someone@okaxis')).toBe('sXXXX@okaxis');
    expect(maskSensitive('12')).toBe('XX');
    expect(maskSensitive('')).toBe(null);
    expect(maskSensitive(null)).toBe(null);
  });

  it('never leaves more than four characters of the number readable', () => {
    for (const v of ['123456789012', 'ABCDE1234F', 'MH/BOM/12345/000/0000000']) {
      const visible = maskSensitive(v).replace(/[X\s]/g, '');
      expect(visible.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('attendance counts', () => {
  it('tallies marks and own-rate days', () => {
    expect(markTally(attendance.b, '2026-11-01', '2026-11-30')).toEqual({ PRESENT: 3, HALF_DAY: 1, ABSENT: 0, LEAVE: 0, SICK: 0, customRate: 1 });
    expect(markTally(attendance.b, '2026-11-01', '2026-11-03').PRESENT).toBe(2);
  });

  it('knows the financial year', () => {
    expect(financialYearOf('2026-11-27')).toEqual({ from: '2026-04-01', to: '2027-03-31', label: '2026-27' });
    expect(financialYearOf('2027-02-01').label).toBe('2026-27');
  });
});
