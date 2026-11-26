import { describe, it, expect } from 'vitest';
import { staffDues, totalPending, monthWindow } from './staffDues';

/**
 * The defect these pin: the staff table showed days and "paid" typed by hand on
 * the employee row. A run could be processed and the table still read the old
 * typed number, or a minus. Every figure now comes from attendance and pay runs.
 */

const daily = { id: 'd1', name: 'Day Rate', pay_type: 'DAILY', daily_rate: 900, status: 'ACTIVE',
  // Stale hand-typed figures. They must not reach any column.
  days_worked: 0, amount_paid: 600 };
const salaried = { id: 's1', name: 'Salaried', pay_type: 'MONTHLY', salary: 30000, status: 'ACTIVE' };

const marks = (days, status = 'PRESENT') =>
  Object.fromEntries(days.map((d) => [`2026-11-${String(d).padStart(2, '0')}`, { status, custom_rate: null }]));

const dayRun = (day, employeeId, netPay) => ({
  id: `r${day}`, period: `2026-11-${day}/2026-11-${day}`, processed_at: `2026-11-${day}T10:00:00Z`,
  items: [{ employeeId, netPay, payType: 'DAILY' }],
});

describe('monthWindow', () => {
  it('covers the whole month', () => {
    expect(monthWindow('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthWindow('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('returns null for a month it cannot read', () => {
    for (const bad of ['', null, '2026-13', 'November']) expect(monthWindow(bad)).toBeNull();
  });
});

describe('staffDues', () => {
  it('reads days and earnings from attendance, not the typed fields', () => {
    const [row] = staffDues({
      employees: [daily], month: '2026-11',
      attendance: { d1: marks([16, 19, 21]) },
    });
    expect(row.daysWorked).toBe(3);
    expect(row.earned).toBe(2700);
    expect(row.paid).toBe(0);
    expect(row.pending).toBe(2700);
  });

  it('reads paid from the pay runs', () => {
    const [row] = staffDues({
      employees: [daily], month: '2026-11',
      attendance: { d1: marks([16, 19, 21]) },
      records: [dayRun(16, 'd1', 900), dayRun(19, 'd1', 900)],
    });
    expect(row.paid).toBe(1800);
    expect(row.pending).toBe(900);
  });

  it('shows nothing owed, never a minus, when nothing was worked', () => {
    // The stale typed 600 used to show as -600 pending.
    const [row] = staffDues({ employees: [daily], month: '2026-11' });
    expect(row.daysWorked).toBe(0);
    expect(row.earned).toBe(0);
    expect(row.paid).toBe(0);
    expect(row.pending).toBe(0);
  });

  it('counts a half day as half', () => {
    const [row] = staffDues({
      employees: [daily], month: '2026-11',
      attendance: { d1: { ...marks([3]), ...marks([4], 'HALF_DAY') } },
    });
    expect(row.daysWorked).toBe(1.5);
    expect(row.earned).toBe(1350);
  });

  it('ignores marks and runs from another month', () => {
    const [row] = staffDues({
      employees: [daily], month: '2026-11',
      attendance: { d1: { '2026-10-31': { status: 'PRESENT' }, '2026-12-01': { status: 'PRESENT' } } },
      records: [{ id: 'o', period: '2026-10-31/2026-10-31', processed_at: '2026-10-31T10:00:00Z',
        items: [{ employeeId: 'd1', netPay: 900, payType: 'DAILY' }] }],
    });
    expect(row.earned).toBe(0);
    expect(row.paid).toBe(0);
  });

  it('pays a salary in full less only days marked absent', () => {
    const [row] = staffDues({
      employees: [salaried], month: '2026-11',
      attendance: { s1: marks([5, 6], 'ABSENT') },
    });
    expect(row.dayRate).toBe(false);
    expect(row.daysWorked).toBeNull();
    expect(row.rate).toBe(30000);
    expect(row.absentDays).toBe(2);
    expect(row.earned).toBe(28000);
    expect(row.pending).toBe(28000);
  });

  it('clears a salary once the month is run', () => {
    const [row] = staffDues({
      employees: [salaried], month: '2026-11',
      records: [{ id: 'm', period: '2026-11', processed_at: '2026-11-30T10:00:00Z',
        items: [{ employeeId: 's1', netPay: 30000, payType: 'MONTHLY' }] }],
    });
    expect(row.paid).toBe(30000);
    expect(row.pending).toBe(0);
  });

  it('keeps a row for someone inactive who is still owed', () => {
    const left = { ...daily, id: 'd2', status: 'INACTIVE' };
    const [row] = staffDues({ employees: [left], month: '2026-11', attendance: { d2: marks([2]) } });
    expect(row.pending).toBe(900);
  });

  it('totals what is still owed', () => {
    const rows = staffDues({
      employees: [daily, salaried], month: '2026-11',
      attendance: { d1: marks([16]) },
    });
    expect(totalPending(rows)).toBe(900 + 30000);
  });

  it('returns no rows for a month it cannot read', () => {
    expect(staffDues({ employees: [daily], month: 'nope' })).toEqual([]);
  });
});
