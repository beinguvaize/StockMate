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
vi.mock('../hooks/useStaffAdvances', () => ({
  useAdvancesAvailable: () => state.advancesOn ?? false,
  useStaffAdvances: () => state.adv || { balance: null, advances: [], entries: [], loaded: false, error: null, reload() {} },
}));
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
    expect(out).toContain('Most recent pay');
    expect(out).toContain('Still to pay');
    expect(out).toContain('View salary statement');
    expect(out).toContain('aria-label="Tasks"');
    expect(out).toContain('Pay now · ₹15,000');
    expect(out).not.toContain('Advances');
    expect(out).not.toContain('Documents');
    expect(out).not.toContain('Leave balance');
  });

  it('lands old tab links on the matching sub-page', () => {
    const page = (tab) => html(`/payroll/employee/a?month=2026-11&tab=${tab}`, <EmployeeProfile />, route);
    expect(page('STATEMENT')).toContain('Pay › Salary statement');
    expect(page('statement')).toContain('Totals for the period');
    expect(page('PAYSLIPS')).toContain('Pay › Payslips');
    expect(page('ATTENDANCE')).toContain('Change marks');
    expect(page('DETAILS')).toContain('Show sensitive data');
    expect(page('OVERVIEW')).toContain('Most recent pay');
    expect(page('nonsense')).toContain('Most recent pay');
  });

  it('keeps the old overview pay breakdown on the Pay page', () => {
    const out = html('/payroll/employee/a?month=2026-11&tab=pay', <EmployeeProfile />, route);
    expect(out).toContain('November pay so far');
    expect(out).toContain('Salary earned');
    expect(out).toContain('Same calculation as Run payroll and the phone');
  });

  it('hides every money figure when Hide amounts is on, attendance stays', () => {
    const store = new Map([['bookledger.payroll.hideAmounts', '1']]);
    vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });
    try {
      for (const tab of ['overview', 'pay', 'statement', 'payslips', 'details']) {
        const out = html(`/payroll/employee/a?month=2026-11&tab=${tab}`, <EmployeeProfile />, route);
        expect(out, tab).not.toMatch(/₹\d/);
        expect(out, tab).toContain('Amounts hidden');
      }
      const ov = html('/payroll/employee/a?month=2026-11', <EmployeeProfile />, route);
      expect(ov).toContain('₹ ••••••');
      expect(ov).toContain('>Pay now<');
      expect(ov).toContain('Attendance this month');
    } finally { vi.unstubAllGlobals(); }
  });

  it('still renders when browser storage throws', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
    try {
      const out = html('/payroll/employee/a?month=2026-11', <EmployeeProfile />, route);
      expect(out).toContain('Hide amounts');
      expect(out).toContain('₹15,000');
    } finally { vi.unstubAllGlobals(); }
  });

  it('shows no advances anywhere on a database without them, even for ?tab=advances', () => {
    state.advancesOn = false;
    const out = html('/payroll/employee/a?month=2026-11&tab=advances', <EmployeeProfile />, route);
    expect(out).toContain('Most recent pay');
    expect(out).not.toContain('Give advance');
    expect(out).not.toContain('Advance outstanding');
  });

  it('with advances: the card, the Tasks pill and the Advances page, all from the server views', () => {
    state.advancesOn = true;
    state.adv = {
      loaded: true, error: null, reload() {},
      balance: { outstanding: 2000, due_per_run: 1000, recovered: 1000 },
      advances: [{ advance_id: 'a1', given_on: '2026-11-05', amount: 3000, recovery_per_run: 1000, recovered: 1000, collected: 0, written_off: 0, outstanding: 2000, method: 'CASH', status: 'OPEN' }],
      entries: [{ id: 'ADVGIV-a1', kind: 'GIVEN', amount: 3000, on_date: '2026-11-05' }],
    };
    try {
      const ov = html('/payroll/employee/a?month=2026-11', <EmployeeProfile />, route);
      expect(ov).toContain('Advance outstanding');
      expect(ov).toContain('₹2,000');
      expect(ov).toContain('Give advance');
      const pg = html('/payroll/employee/a?month=2026-11&tab=advances', <EmployeeProfile />, route);
      expect(pg).toContain('Pay › Advances');
      expect(pg).toContain('Advance of 5 Nov');
      expect(pg).toContain('Next run takes back');
      const st = html('/payroll/employee/a?month=2026-11&tab=statement', <EmployeeProfile />, route);
      expect(st).toContain('Advance given');
      expect(st).toContain('advance outstanding');
    } finally { state.advancesOn = false; state.adv = null; }
  });

  it('a left employee who still owes an advance is offered a settlement', () => {
    state.advancesOn = true;
    state.adv = { loaded: true, error: null, reload() {}, balance: { outstanding: 1500, due_per_run: 0, recovered: 0 },
      advances: [{ advance_id: 'a2', given_on: '2026-08-02', amount: 1500, recovery_per_run: 500, recovered: 0, collected: 0, written_off: 0, outstanding: 1500, method: 'CASH', status: 'OPEN' }], entries: [] };
    try {
      const out = html('/payroll/employee/b?month=2026-11', <EmployeeProfile />, route);
      expect(out).toContain('Record settlement');
      expect(out).toContain('owes the shop');
    } finally { state.advancesOn = false; state.adv = null; }
  });

  it('says when an employee does not exist', () => {
    expect(html('/payroll/employee/zz', <EmployeeProfile />, route)).toContain('Employee not found');
  });

  it('shows no pay figures for an inactive employee', () => {
    const out = html('/payroll/employee/b?month=2026-11', <EmployeeProfile />, route);
    expect(out).toContain('Inactive, not paid');
  });
});
