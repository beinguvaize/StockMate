import { describe, it, expect } from 'vitest';
import {
  buildPayRun, payRunItem, markCounts, dayRateWage, leaveUse, netOf,
  isDayRate, payRunTotals,
} from './payRun';

// The staff and figures on the approved phone mockup (Run Payroll boards),
// so the calculation is pinned to exactly what the owner signed off.
const NOV = { from: '2026-11-01', to: '2026-11-30' };
const WEEK = { from: '2026-11-16', to: '2026-11-22' };
const TWO_DAYS = { from: '2026-11-22', to: '2026-11-23' };

const anita = { id: 'aj', name: 'Anita Jadhav', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 11000, paid_leave_per_month: 2 };
const rahul = { id: 'rm', name: 'Rahul More', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 9000 };
const deepa = { id: 'dp', name: 'Deepa Pawar', status: 'ACTIVE', pay_type: 'WEEKLY', salary: 2800 };
const kiran = { id: 'ks', name: 'Kiran Shinde', status: 'ACTIVE', pay_type: 'DAILY', daily_rate: 400 };
const imran = { id: 'is', name: 'Imran Shaikh', status: 'ACTIVE', pay_type: 'DAILY', daily_rate: 450 };
const suresh = { id: 'sp', name: 'Suresh Patil', status: 'ON_LEAVE', pay_type: 'MONTHLY', salary: 12000 };
const gone = { id: 'x', name: 'Left Last Year', status: 'INACTIVE', pay_type: 'MONTHLY', salary: 5000 };

/** n consecutive days of one mark, starting at a date in November 2026. */
const marks = (startDay, n, status, extra = {}) => Object.fromEntries(
  Array.from({ length: n }, (_, i) =>
    [`2026-11-${String(startDay + i).padStart(2, '0')}`, { status, ...extra }]));

describe('salaried staff', () => {
  it('pays the full month when nothing is marked', () => {
    const item = payRunItem({ employee: anita, days: {}, ...NOV });
    expect(item.basePay).toBe(11000);
    expect(item.netPay).toBe(11000);
  });

  it('takes a day off for a day marked Absent', () => {
    const item = payRunItem({ employee: rahul, days: marks(5, 1, 'ABSENT'), ...NOV });
    expect(item.lopDays).toBe(1);
    expect(item.lopAmount).toBe(300);
    expect(item.netPay).toBe(8700);
  });

  it('takes half a day off for a Half day', () => {
    const item = payRunItem({ employee: rahul, days: marks(5, 1, 'HALF_DAY'), ...NOV });
    expect(item.netPay).toBe(8850);
  });

  it('pays Leave and Sick in full', () => {
    const days = { ...marks(3, 2, 'LEAVE'), ...marks(10, 3, 'SICK') };
    const item = payRunItem({ employee: rahul, days, ...NOV });
    expect(item.netPay).toBe(9000);
    expect(item.leaveDays).toBe(2);
    expect(item.sickDays).toBe(3);
  });

  it('pays a monthly salary by the day for a week or two days', () => {
    expect(payRunItem({ employee: anita, days: {}, ...WEEK }).netPay).toBe(2567);
    expect(payRunItem({ employee: anita, days: {}, ...TWO_DAYS }).netPay).toBe(733);
    expect(payRunItem({ employee: rahul, days: marks(18, 1, 'ABSENT'), ...WEEK }).netPay).toBe(1800);
  });

  it('pays a weekly salary whole for its week and by the day otherwise', () => {
    expect(payRunItem({ employee: deepa, days: {}, ...WEEK }).netPay).toBe(2800);
    expect(payRunItem({ employee: deepa, days: {}, ...TWO_DAYS }).netPay).toBe(800);
    expect(payRunItem({ employee: deepa, days: {}, ...NOV }).basePay).toBe(12000);
  });
});

describe('day-rate staff', () => {
  it('pays days worked at the rate, half for a half day', () => {
    const days = { ...marks(1, 20, 'PRESENT'), ...marks(21, 1, 'HALF_DAY') };
    const item = payRunItem({ employee: imran, days, ...NOV });
    expect(item.daysWorked).toBe(20.5);
    expect(item.basePay).toBe(9225);
  });

  it('pays nothing for Leave, Sick, Absent or an unmarked day', () => {
    const days = { ...marks(1, 1, 'LEAVE'), ...marks(2, 1, 'SICK'), ...marks(3, 1, 'ABSENT') };
    const item = payRunItem({ employee: kiran, days, ...NOV });
    expect(item.basePay).toBe(0);
    expect(item.sickDays).toBe(1);
  });

  it('uses a day\'s own rate when it has one', () => {
    const days = { ...marks(16, 2, 'PRESENT'), ...marks(18, 1, 'PRESENT', { custom_rate: 900 }) };
    expect(dayRateWage(days, 400, WEEK.from, WEEK.to)).toBe(1700);
  });

  it('counts only days inside the window', () => {
    const days = marks(14, 5, 'PRESENT'); // 14-18 Nov
    expect(payRunItem({ employee: kiran, days, ...WEEK }).basePay).toBe(1200);
  });

  it('has no leave allowance', () => {
    const item = payRunItem({
      employee: { ...kiran, paid_leave_per_month: 2 }, days: marks(1, 5, 'LEAVE'), ...NOV,
    });
    expect(item.leaveAllowed).toBe(0);
    expect(item.leaveExceeded).toBe(false);
  });
});

describe('already paid', () => {
  const earlier = [{
    id: 'r1', period: '2026-11-01/2026-11-20',
    items: [{ employeeId: 'ks', netPay: 8000 }, { employeeId: 'is', netPay: 8325 }],
  }];

  it('takes off what earlier runs paid for the same days', () => {
    const k = payRunItem({ employee: kiran, days: marks(1, 22, 'PRESENT'), records: earlier, ...NOV });
    expect(k.basePay).toBe(8800);
    expect(k.alreadyPaid).toBe(8000);
    expect(k.netPay).toBe(800);
  });

  it('never goes below zero', () => {
    const k = payRunItem({ employee: kiran, days: marks(1, 2, 'PRESENT'), records: earlier, ...NOV });
    expect(k.netPay).toBe(0);
  });

  it('ignores a deleted run', () => {
    const k = payRunItem({
      employee: kiran, days: marks(1, 22, 'PRESENT'),
      records: [{ ...earlier[0], deleted_at: '2026-11-21' }], ...NOV,
    });
    expect(k.netPay).toBe(8800);
  });
});

describe('paid leave allowance', () => {
  it('counts leave against the month, not just the run\'s window', () => {
    const days = { ...marks(3, 1, 'LEAVE'), ...marks(17, 1, 'LEAVE') };
    const item = payRunItem({ employee: anita, days, ...WEEK });
    expect(item.leaveDays).toBe(1);   // inside the week
    expect(item.leaveUsed).toBe(2);   // in November
    expect(item.leaveAllowed).toBe(2);
    expect(item.leaveExceeded).toBe(false);
  });

  it('warns when exceeded and leaves pay alone', () => {
    const item = payRunItem({ employee: anita, days: marks(3, 3, 'LEAVE'), ...NOV });
    expect(item.leaveExceeded).toBe(true);
    expect(item.netPay).toBe(11000);
  });

  it('never warns when no allowance is set', () => {
    expect(leaveUse({ days: marks(1, 9, 'LEAVE'), to: NOV.to, allowed: 0 }).exceeded).toBe(false);
    expect(leaveUse({ days: marks(1, 9, 'LEAVE'), to: NOV.to }).exceeded).toBe(false);
  });

  it('does not count Sick as leave', () => {
    const use = leaveUse({ days: marks(1, 5, 'SICK'), to: NOV.to, allowed: 2 });
    expect(use.used).toBe(0);
  });
});

describe('the whole run', () => {
  const employees = [suresh, anita, rahul, deepa, kiran, imran, gone];

  it('pays active staff and holds staff on leave', () => {
    const run = buildPayRun({ employees, ...TWO_DAYS });
    expect(run.items.map(i => i.employeeId)).toEqual(['aj', 'rm', 'dp', 'ks', 'is']);
    expect(run.held.map(i => i.employeeId)).toEqual(['sp']);
    expect(run.held[0].onLeave).toBe(true);
  });

  it('pays someone on leave once they are switched in', () => {
    const run = buildPayRun({ employees, includeOnLeave: ['sp'], ...NOV });
    expect(run.items.some(i => i.employeeId === 'sp')).toBe(true);
    expect(run.held).toEqual([]);
    expect(run.items.find(i => i.employeeId === 'sp').netPay).toBe(12000);
  });

  it('never lists inactive staff', () => {
    const run = buildPayRun({ employees, includeOnLeave: ['x'], ...NOV });
    expect([...run.items, ...run.held].some(i => i.employeeId === 'x')).toBe(false);
  });

  it('matches the two-day run on the mockup', () => {
    const attendance = {
      ks: marks(22, 2, 'PRESENT'),
      is: { ...marks(22, 1, 'PRESENT'), ...marks(23, 1, 'HALF_DAY') },
    };
    const run = buildPayRun({ employees, attendance, ...TWO_DAYS });
    expect(run.items.map(i => i.netPay)).toEqual([733, 600, 800, 800, 675]);
    expect(run.totalNet).toBe(3608);
  });

  it('applies the owner\'s bonus and deductions to the net', () => {
    const run = buildPayRun({
      employees: [anita], adjustments: { aj: { bonus: 500, deductions: 200 } }, ...NOV,
    });
    expect(run.items[0].netPay).toBe(11300);
    expect(run.totalBonus).toBe(500);
    expect(run.totalDeductions).toBe(200);
  });

  it('totals only the lines being paid', () => {
    const run = buildPayRun({ employees: [anita, suresh], ...NOV });
    expect(run.totalNet).toBe(11000);
    expect(payRunTotals(run.held).totalNet).toBe(12000);
  });
});

describe('small rules', () => {
  it('reads pay types whatever their case', () => {
    expect(isDayRate('daily')).toBe(true);
    expect(isDayRate('MONTHLY')).toBe(false);
    expect(isDayRate(undefined)).toBe(false);
  });

  it('counts each mark once', () => {
    const days = { ...marks(1, 2, 'PRESENT'), ...marks(3, 1, 'HALF_DAY'), ...marks(4, 1, 'SICK') };
    expect(markCounts(days, NOV.from, NOV.to)).toEqual(
      { present: 2, halfDay: 1, leave: 0, sick: 1, absent: 0, worked: 2.5 });
  });

  it('keeps statutory deductions in the net', () => {
    expect(netOf({ basePay: 1000, bonus: 100, deductions: 50, alreadyPaid: 200, statutoryTotal: 120 })).toBe(730);
  });
});
