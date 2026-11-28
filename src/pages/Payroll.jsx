import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ReceiptText, Search, Users } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { usePayroll } from '../hooks/usePayroll';
import { usePeople } from '../hooks/usePeople';
import { useAccounts, accountForMethod } from '../hooks/useAccounts';
import { usePayRunPreview } from '../hooks/usePayRunPreview';
import { usePayrollAttendance } from '../hooks/usePayrollAttendance';
import { useLinkedRange } from '../lib/linkedRange';
import { todayISOInAppTZ } from '../lib/utils';
import { classifyWriteFailure } from '../lib/writeOutcome';
import { findOverlapping, parsePeriod } from '../lib/payrollPeriods';
import {
  monthBounds, monthWords, staffRows, listTotals, filterStaff, periodWords, shopDay, dayWords,
  runKind, mondayOf,
} from '../lib/payrollView';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs } from '../components/ui/Tabs';
import { FigureStrip, Figure } from '../components/ui/FigureStrip';
import CountUp from '../components/motion/CountUp';
import StaffTable from '../components/payroll/StaffTable';
import EmployeePanel from '../components/payroll/EmployeePanel';
import EmployeeForm, { DEPARTMENTS } from '../components/payroll/EmployeeForm';
import AttendanceTab from '../components/payroll/AttendanceTab';
import RunPayrollDialog from '../components/payroll/RunPayrollDialog';
import PayHistory from '../components/payroll/PayHistory';
import PayOneDialog from '../components/payroll/PayOneDialog';
import ConfirmDialog from '../components/payroll/ConfirmDialog';
import { MonthStep, ErrorBar, EmptyState, inr } from '../components/payroll/parts';

/**
 * Payroll (web redesign, approved mockups payroll-01 … 20).
 *
 * Pay figures come from one place: the payroll-run server function, the
 * phone's calculation. The month's run (with nobody switched in) feeds the
 * tiles, the staff list, the employee panel and the attendance money columns;
 * Run payroll and "Pay one person" ask it again at the moment of paying and
 * save exactly what it returns. The browser adds up rows that are on screen
 * and nothing else.
 */
const TABS = ['EMPLOYEES', 'ATTENDANCE', 'HISTORY'];
const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function Payroll() {
  const navigate = useNavigate();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const { accounts = [] } = useAccounts(currentTenantId);
  const { users = [] } = usePeople(currentTenantId);
  const {
    employees, payrollRecords, payrollPaymentMethods, loading, error: payrollError, refetch,
    addEmployee, updateEmployee, deleteEmployee, processPayroll, deletePayrollRecord,
    loadAttendance, saveAttendanceBatch,
  } = usePayroll(currentTenantId);
  const today = todayISOInAppTZ();

  // ?tab=ATTENDANCE&from=..&to=.. (an Ask answer, or the profile's "Mark
  // attendance") opens on that tab and month.
  const [params] = useSearchParams();
  const linked = useLinkedRange();
  const linkedTab = TABS.includes(params.get('tab')) ? params.get('tab') : null;
  const [tab, setTab] = useState(linkedTab || 'EMPLOYEES');
  const [month, setMonth] = useState(() => linked?.from.slice(0, 7) ?? today.slice(0, 7));
  const win = monthBounds(month);

  // Anything that changes what the server would answer bumps this.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => { bump(); }, [payrollRecords, employees, bump]);

  const att = usePayrollAttendance({ tenantId: currentTenantId, month, loadAttendance, saveAttendanceBatch, onSaved: bump });

  // The month's figures, from the server.
  const monthRun = usePayRunPreview({ tenantId: currentTenantId, from: win.from, to: win.to, version, enabled: !!currentTenantId });
  const run = monthRun.data?.run || null;
  const figuresFailed = !!monthRun.error && !run;
  const lines = useMemo(() => {
    const m = new Map();
    for (const l of [...(run?.items || []), ...(run?.held || [])]) m.set(String(l.employeeId), l);
    return m;
  }, [run]);
  const rows = useMemo(() => staffRows({ employees, run }), [employees, run]);
  const totals = useMemo(() => listTotals(rows), [rows]);

  const accountFor = useCallback((method) => accounts.find((a) => a.id === accountForMethod(accounts, method))?.name || null, [accounts]);

  // ── Leaving a month with unsaved marks asks first (no browser confirm()) ──
  const [leaveTo, setLeaveTo] = useState(null);
  const goMonth = (next) => { if (att.pendingCount) setLeaveTo(next); else setMonth(next); };
  useEffect(() => {
    if (linkedTab) setTab(linkedTab);
    if (linked && linked.from.slice(0, 7) !== month) goMonth(linked.from.slice(0, 7));
  }, [linkedTab, linked?.from]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search ──
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('');
  const shown = useMemo(() => filterStaff(rows, { query, department: dept }), [rows, query, dept]);
  const departments = useMemo(() => [...new Set([...DEPARTMENTS, ...employees.map((e) => e.department).filter(Boolean)])], [employees]);

  // ── Dialogs ──
  const [panelId, setPanelId] = useState(null);
  const panelRow = rows.find((r) => r.id === panelId) || null;
  const [form, setForm] = useState(null);      // { employee|null }
  const [deleting, setDeleting] = useState(null);
  const [runOpen, setRunOpen] = useState(null); // initial dates
  const [payOne, setPayOne] = useState(null);   // row

  const openRun = (initial) => {
    if (att.pendingCount) {
      setTab('ATTENDANCE');
      addNotification(`Save the ${att.pendingCount} attendance ${att.pendingCount === 1 ? 'change' : 'changes'} first: unsaved marks are never paid.`, 'warning');
      return;
    }
    setRunOpen(initial || { mode: 'MONTHLY', month });
  };

  const toggleActive = async (emp) => {
    const next = String(emp.status).toUpperCase() === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    const res = await updateEmployee({ ...emp, status: next });
    if (res?.success) {
      addNotification(`${emp.name} is now ${next === 'ACTIVE' ? 'active' : 'inactive'}.`, 'success');
      return;
    }
    const f = classifyWriteFailure(res?.error, { noun: 'change' });
    addNotification(f.maySaved
      ? `Couldn't confirm ${emp.name}'s status change — it may have saved. Reload to check. (${f.detail})`
      : `${emp.name}'s status was not changed: ${f.detail}`, 'error', 9000);
  };

  const lastPaidFor = (empId) => (payrollRecords || []).find((r) => (r.items || []).some((i) => String(i.employeeId) === String(empId) && Number(i.netPay) > 0));

  const rerun = async (record) => {
    const res = await deletePayrollRecord(record.id);
    if (res && res.success === false) return res;
    const p = parsePeriod(record.period);
    const kind = runKind(record.period);
    setTab('HISTORY');
    setRunOpen(kind === 'MONTHLY'
      ? { mode: 'MONTHLY', month: p.from.slice(0, 7), reason: 'rerun' }
      : kind === 'WEEKLY'
        ? { mode: 'WEEKLY', weekStart: mondayOf(p.from), reason: 'rerun' }
        : { mode: 'CUSTOM', from: p.from, to: p.to, reason: 'rerun' });
    addNotification(`Reversed ${periodWords(record.period)}: ${res.expensesReversed} salary expense${res.expensesReversed === 1 ? '' : 's'} taken back. Enter the corrected run.`, 'info');
    return res;
  };

  const runsThisMonth = useMemo(() => findOverlapping(month, payrollRecords || []), [month, payrollRecords]);
  const lastRun = payrollRecords?.[0] || null;
  const mShort = monthWords(month).split(' ')[0];
  const noStaff = !loading && employees.length === 0;
  const fig = (v, tone) => (figuresFailed ? <span className="text-faint">—</span>
    : !run ? <span className="text-faint">…</span>
    : <span className={tone}><CountUp value={v} format={(n) => inr(n)} /></span>);

  return (
    <div className="flex flex-col pb-16">
      <FigureStrip cols={4} className="m-rise mb-5" style={{ '--i': 0 }}>
        <Figure label={`Still to pay for ${mShort}`} value={noStaff ? inr(0) : fig(totals.stillToPay, 'text-amber-text')}
          sub={noStaff ? 'No staff yet' : figuresFailed ? 'figures could not be loaded' : `${totals.activeCount} active staff${totals.onLeaveCount ? ' · on leave not counted' : ''}${totals.statutory > 0 ? ` · after ${inr(totals.statutory)} PF, ESI, tax` : ''}`} />
        <Figure label="Already paid" value={noStaff ? inr(0) : fig(totals.paid, totals.paid > 0 ? 'text-good-text' : '')}
          sub={runsThisMonth.length === 0 ? 'No pay runs yet this month'
            : `${runsThisMonth.length} run${runsThisMonth.length === 1 ? '' : 's'} · ${periodWords(runsThisMonth[0].period)}${runsThisMonth[0].processed_at ? `, paid ${dayWords(shopDay(runsThisMonth[0].processed_at), { year: false })}` : ''}`} />
        <Figure label="Earned this month" value={noStaff ? inr(0) : fig(totals.earned)}
          sub={noStaff ? 'Nothing earned yet' : figuresFailed || !run ? '—'
            : `${inr(totals.stillToPay)} still to pay + ${inr(totals.paid)} already paid${totals.statutory > 0 ? ` + ${inr(totals.statutory)} deductions` : ''}`} />
        <Figure label="Active staff" value={String(totals.activeCount)}
          sub={`${totals.onLeaveCount ? `${totals.onLeaveCount} on leave · ` : ''}${lastRun?.processed_at ? `last pay run ${dayWords(shopDay(lastRun.processed_at))}` : 'Last pay run: none yet'}`} />
      </FigureStrip>

      <Tabs className="m-rise mb-[18px]" style={{ '--i': 1 }} ariaLabel="Payroll" value={tab} onChange={setTab}
        items={[
          { key: 'EMPLOYEES', label: 'Employees', count: employees.length },
          { key: 'ATTENDANCE', label: 'Attendance' },
          { key: 'HISTORY', label: 'Pay history', count: payrollRecords.length },
        ]} />

      {payrollError && <ErrorBar action="Reload" onAction={refetch}>The staff list could not be loaded: {payrollError}</ErrorBar>}

      {tab === 'EMPLOYEES' && (
        <>
          <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 1 }}>
            <MonthStep label={monthWords(month)} onPrev={() => goMonth(shiftMonth(month, -1))} onNext={() => goMonth(shiftMonth(month, 1))} />
            <label className="relative w-[280px] max-w-full">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, role or department" className="pl-9" aria-label="Search staff" />
            </label>
            <label className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--color-line)]">
              <em className="not-italic text-mute">Department</em>
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="bg-transparent font-tight font-semibold outline-none" aria-label="Department">
                <option value="">All</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => openRun()} disabled={noStaff}><ReceiptText /> Run payroll</Button>
            <Button onClick={() => setForm({ employee: null })}><Plus /> Add employee</Button>
          </div>

          {figuresFailed && !noStaff && (
            <ErrorBar action="Reload" onAction={monthRun.reload}>
              <b className="font-semibold">Pay figures could not be loaded</b>, so days, earned and pending are not shown. Check the connection and reload. ({monthRun.error.message})
            </ErrorBar>
          )}

          {noStaff ? (
            <EmptyState icon={Users} title="No employees yet" text="Add the people you pay to start running payroll."
              steps={[
                ['1 · Add staff', 'Monthly, weekly or a rate per day.'],
                ['2 · Mark attendance', 'Day-rate staff are paid for the days marked.'],
                ['3 · Run payroll', 'Each payout becomes a salary expense.'],
              ]}>
              <Button onClick={() => setForm({ employee: null })}><Plus /> Add employee</Button>
            </EmptyState>
          ) : (
            <StaffTable rows={shown} totals={totals} loading={loading || monthRun.loading} figuresFailed={figuresFailed}
              query={query} onClearSearch={() => { setQuery(''); setDept(''); }}
              onOpen={(r) => setPanelId(r.id)}
              onProfile={(e) => navigate(`/payroll/employee/${encodeURIComponent(e.id)}?month=${month}`)}
              onEdit={(e) => setForm({ employee: e })}
              onToggleActive={toggleActive}
              onDelete={(e) => setDeleting(e)} />
          )}
        </>
      )}

      {tab === 'ATTENDANCE' && (
        <AttendanceTab month={month} today={today} employees={employees} att={att} lines={lines}
          figuresFailed={figuresFailed} records={payrollRecords}
          onPrevMonth={() => goMonth(shiftMonth(month, -1))} onNextMonth={() => goMonth(shiftMonth(month, 1))}
          onRunPayroll={() => openRun({ mode: 'MONTHLY', month })} onAddEmployee={() => setForm({ employee: null })} />
      )}

      {tab === 'HISTORY' && (
        <PayHistory records={payrollRecords} methods={payrollPaymentMethods} accountFor={accountFor} accounts={accounts}
          employees={employees} business={businessProfile}
          onRunPayroll={() => openRun()} onAddEmployee={() => setForm({ employee: null })}
          onDelete={async (r) => {
            const res = await deletePayrollRecord(r.id);
            if (res?.success) {
              addNotification(res.amountReversed != null
                ? `Deleted ${periodWords(r.period)}: ${inr(res.amountReversed)} of salary expenses reversed.`
                : `Deleted ${periodWords(r.period)}: ${res.expensesReversed} salary expense${res.expensesReversed === 1 ? '' : 's'} reversed${res.recoveriesReversed > 0 ? `, and the advance taken back from it is owed again` : ''}.`, 'success');
            }
            return res;
          }}
          onRerun={rerun} />
      )}

      <EmployeePanel row={panelRow} month={month} records={payrollRecords} methods={payrollPaymentMethods}
        onClose={() => setPanelId(null)}
        onOpenProfile={(e) => navigate(`/payroll/employee/${encodeURIComponent(e.id)}?month=${month}`)}
        onPay={(r) => setPayOne(r)}
        onEdit={(e) => { setPanelId(null); setForm({ employee: e }); }}
        onDelete={(e) => { setPanelId(null); setDeleting(e); }}
        onToggleActive={toggleActive} />

      <EmployeeForm open={!!form} employee={form?.employee || null} users={users} refetch={refetch}
        onClose={() => setForm(null)} addEmployee={addEmployee} updateEmployee={updateEmployee}
        onSaved={(how, res) => addNotification(how === 'added' ? (res?.replayed ? 'That employee was already saved.' : 'Employee added.') : 'Changes saved.', 'success')} />

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} tone="danger"
        title={deleting ? `Delete ${deleting.name}?` : ''}
        text="They leave the staff list and future pay runs. What they were already paid stays in Pay history and in Expenses."
        bullets={deleting ? [
          lastPaidFor(deleting.id) ? `Last paid in the ${periodWords(lastPaidFor(deleting.id).period)} run` : 'Never paid in a pay run',
          'Their attendance stays on the days already marked',
          'The record is kept, marked deleted, so past pay runs still name them',
        ] : []}
        confirmLabel="Delete employee"
        onConfirm={async () => {
          const res = await deleteEmployee(deleting.id);
          if (res?.success) { addNotification(`${deleting.name} was removed from the staff list.`, 'success'); return null; }
          const f = classifyWriteFailure(res?.error, { noun: 'delete' });
          return f.maySaved ? `Couldn't confirm the delete — it may have gone through. Reload to check. (${f.detail})` : `Not deleted: ${f.detail}`;
        }} />

      <RunPayrollDialog open={!!runOpen} initial={runOpen} onClose={() => setRunOpen(null)} tenantId={currentTenantId} today={today}
        pendingAttendance={att.pendingCount} accountFor={accountFor} processPayroll={processPayroll}
        onSaved={(res, data, method) => {
          bump();
          const paid = (data.run.items || []).filter((i) => Number(i.netPay) > 0).length;
          addNotification(res?.replayed
            ? 'That run was already saved by an earlier press; nothing was paid twice. It is in Pay history.'
            : `Paid ${inr(data.run.totalNet)} to ${paid} staff by ${method.toLowerCase() === 'upi' ? 'UPI' : method.charAt(0) + method.slice(1).toLowerCase()}.`, 'success', 7000);
        }} />

      <PayOneDialog open={!!payOne} onClose={() => setPayOne(null)} tenantId={currentTenantId}
        employee={payOne?.employee} month={month} amount={payOne?.pending} planned={payOne?.line?.advancePlanned || 0} accountFor={accountFor} processPayroll={processPayroll}
        onPaid={(line, method, res) => {
          bump();
          addNotification(res?.replayed ? 'That payment was already saved by an earlier press; nothing was paid twice.' : `Paid ${inr(line.netPay)} to ${line.employeeName}.`, 'success');
        }} />

      <ConfirmDialog open={!!leaveTo} onClose={() => setLeaveTo(null)} tone="warn"
        title={`${att.pendingCount} unsaved attendance ${att.pendingCount === 1 ? 'change' : 'changes'}`}
        text={`Moving to ${leaveTo ? monthWords(leaveTo) : ''} throws them away. Save them first to keep them.`}
        confirmLabel="Discard and move" cancelLabel="Stay"
        onConfirm={() => { att.discard(); setMonth(leaveTo); return null; }} />
    </div>
  );
}
