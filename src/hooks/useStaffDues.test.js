import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
const { staffDuesFromRun } = await import('./useStaffDues');
import { buildPayRun } from '../lib/payRun';
import { staffRows, listTotals } from '../lib/payrollView';

const staff = [
  { id: 'a', name: 'Staff A', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 15000 },
  { id: 'b', name: 'Staff B', status: 'ACTIVE', pay_type: 'DAILY', daily_rate: 600 },
  { id: 'c', name: 'Staff C', status: 'ON_LEAVE', pay_type: 'MONTHLY', salary: 9000 },
  { id: 'd', name: 'Staff D', status: 'INACTIVE', pay_type: 'MONTHLY', salary: 8000 },
];
const attendance = { b: { '2026-11-02': { status: 'PRESENT' }, '2026-11-03': { status: 'PRESENT' } } };
const records = [{ id: 'r1', period: '2026-11-01/2026-11-15', processed_at: '2026-11-16T10:00:00Z', items: [{ employeeId: 'a', netPay: 7500, basePay: 7500 }] }];

describe('Dashboard salary pending', () => {
  // The run the server answers with (the same shared calculation it bundles).
  const run = buildPayRun({ employees: staff, attendance, records, from: '2026-11-01', to: '2026-11-30' });

  it('is the Payroll page\'s "Still to pay", to the rupee', () => {
    const page = listTotals(staffRows({ employees: staff, run })).stillToPay;
    const dash = staffDuesFromRun({ employees: staff, run });
    expect(dash.total).toBe(page);
    expect(dash.total).toBe(7500 + 1200);
  });

  it('lists the same rows it adds up: active staff only', () => {
    const { rows, total } = staffDuesFromRun({ employees: staff, run });
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(rows.reduce((t, r) => t + r.pending, 0)).toBe(total);
    const b = rows.find((r) => r.id === 'b');
    expect(b).toMatchObject({ dayRate: true, rate: 600, daysWorked: 2, earned: 1200, paid: 0 });
  });

  it('has no figure at all when the server did not answer', () => {
    expect(staffDuesFromRun({ employees: staff, run: null })).toEqual({ rows: [], total: null });
  });
});
