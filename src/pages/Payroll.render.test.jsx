import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { buildPayRun } from '../lib/payRun';

/**
 * Smoke test: Payroll and the employee profile render their states with every
 * data hook stubbed. The figures are tested in lib/payrollView and
 * lib/payrollCommit; this catches a broken page before a shopkeeper does.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ gte: () => ({ lte: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }) }) }), auth: { getSession: async () => ({ data: {} }) } } }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: { businessName: 'Test shop' } }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification: () => {} }) }));
vi.mock('../hooks/usePayroll', () => ({ usePayroll: () => state.payroll }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => ({ users: [] }) }));
vi.mock('../hooks/useAccounts', () => ({ useAccounts: () => ({ accounts: [] }), accountForMethod: () => '' }));
vi.mock('../hooks/usePayRunPreview', () => ({ usePayRunPreview: () => state.preview }));
vi.mock('../hooks/usePayrollAttendance', () => ({
  usePayrollAttendance: () => ({ attendance: {}, pending: {}, pendingCount: 0, problem: null, saving: false, loading: false, applyNote: null, reload() {}, save() {}, discard() {} }),
}));

globalThis.React = React;
const { default: Payroll } = await import('./Payroll.jsx');
const { default: EmployeeProfile } = await import('./payroll/EmployeeProfile.jsx');

const staff = [
  { id: 'a', name: 'Staff A', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 15000, department: 'Sales', position: 'Cashier', pan: 'ABCDE1821L' },
  { id: 'b', name: 'Staff B', status: 'INACTIVE', pay_type: 'DAILY', daily_rate: 600 },
];
const run = buildPayRun({ employees: staff, attendance: {}, records: [], from: '2026-11-01', to: '2026-11-30' });
const payroll = (over = {}) => ({
  employees: staff, payrollRecords: [], payrollPaymentMethods: {}, loading: false, error: null, refetch() {},
  addEmployee() {}, updateEmployee() {}, deleteEmployee() {}, processPayroll() {}, deletePayrollRecord() {},
  loadAttendance() {}, saveAttendanceBatch() {}, ...over,
});
const html = (path, el, route = '/payroll') => renderToStaticMarkup(
  <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

describe('Payroll page', () => {
  beforeEach(() => { state.payroll = payroll(); state.preview = { data: { period: '2026-11', run, alreadyPaidRuns: [], mustConfirm: false }, loading: false, error: null, reload() {} }; });

  it('shows the staff list with server figures, and inactive staff as not paid', () => {
    const out = html('/payroll?from=2026-11-01&to=2026-11-30', <Payroll />);
    expect(out).toContain('Staff A');
    expect(out).toContain('Inactive, not paid');
    expect(out).toContain('₹15,000');
  });

  it('says so when the figures could not be loaded, without zeros', () => {
    state.preview = { data: null, loading: false, error: new Error('down'), reload() {} };
    const out = html('/payroll', <Payroll />);
    expect(out).toContain('Pay figures could not be loaded');
  });

  it('shows the empty state for a shop with no staff', () => {
    state.payroll = payroll({ employees: [] });
    expect(html('/payroll', <Payroll />)).toContain('No employees yet');
  });

  it('opens on a deep-linked tab', () => {
    expect(html('/payroll?tab=HISTORY', <Payroll />)).toContain('No pay history');
    expect(html('/payroll?tab=ATTENDANCE', <Payroll />)).toContain('Salaried staff');
  });
});

describe('Employee profile', () => {
  beforeEach(() => { state.payroll = payroll(); state.preview = { data: { period: '2026-11', run, alreadyPaidRuns: [], mustConfirm: false }, loading: false, error: null, reload() {} }; });
  const route = '/payroll/employee/:employeeId';

  it('renders the overview from the server line', () => {
    const out = html('/payroll/employee/a?month=2026-11', <EmployeeProfile />, route);
    expect(out).toContain('Staff A');
    expect(out).toContain('Salary statement');
    expect(out).not.toContain('Advances');
    expect(out).not.toContain('Documents');
  });

  it('says when an employee does not exist', () => {
    expect(html('/payroll/employee/zz', <EmployeeProfile />, route)).toContain('Employee not found');
  });

  it('shows no pay figures for an inactive employee', () => {
    const out = html('/payroll/employee/b?month=2026-11', <EmployeeProfile />, route);
    expect(out).toContain('Inactive, not paid');
  });
});
