import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronDown, CalendarCheck, Pencil, Printer, FileText, UserX, UserCheck, Trash2, CalendarClock,
  House, Banknote, CalendarDays, IdCard, Eye, EyeOff, PanelLeft,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePayroll } from '../../hooks/usePayroll';
import { usePeople } from '../../hooks/usePeople';
import { useAccounts, accountForMethod } from '../../hooks/useAccounts';
import { usePayRunPreview } from '../../hooks/usePayRunPreview';
import { supabase } from '../../lib/supabase';
import { formatDate, todayISOInAppTZ, cn } from '../../lib/utils';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { useHiddenAmounts, maskedMoney, MASK } from '../../lib/hideAmounts';
import {
  monthBounds, monthWords, salaryStatement, periodWords, runKindLabel, shopDay, dayWords, rangeWords,
  methodLabel, markTally, financialYearOf, maskSensitive, daysText, isDayRateType, profilePage,
} from '../../lib/payrollView';
import { Button } from '../../components/ui/button';
import { FilterPills } from '../../components/ui/Tabs';
import { RowMenu, MenuItem, MenuRule } from '../../components/ui/RowMenu';
import { Skeleton } from '../../components/ui/States';
import { Switch } from '../../components/documents/DocParts';
import EmployeeForm from '../../components/payroll/EmployeeForm';
import PayOneDialog from '../../components/payroll/PayOneDialog';
import ConfirmDialog from '../../components/payroll/ConfirmDialog';
import PaySlip from '../../components/payroll/PaySlip';
import StatementPrint from '../../components/payroll/StatementPrint';
import StatementTable, { YtdBlock } from '../../components/payroll/StatementTable';
import { yearToDateLines, buildPayslip } from '../../lib/payslip';
import {
  inr, Avatar, statusPill, Pill, payTypeWords, rateWords, Eyebrow, MonthStep, ErrorBar, EmptyState,
  Card, LinkButton, MARK, markOf,
} from '../../components/payroll/parts';

/**
 * One employee's page, in the approved Option B layout (payroll-34, 35, 36):
 * sections on the left that open into sub-pages, one Tasks row on every
 * page, and an overview of big-figure cards that each link to their page.
 *
 * Figures are the server's line for the month -- the line the staff list
 * shows -- and saved pay runs. Sections with nothing to show yet (advances,
 * leave balance, documents) are left out rather than shown as zeros.
 *
 * The page is in the URL (?tab=), so a deep link opens it. The old tab names
 * (OVERVIEW, STATEMENT, ATTENDANCE, PAYSLIPS, DETAILS) still land on the
 * matching sub-page.
 */
const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const pad = (n) => String(n).padStart(2, '0');

const PAGE_TITLE = { overview: 'Overview', statement: 'Salary statement', payslips: 'Payslips', attendance: 'Attendance', details: 'Details' };
const PAY_PAGES = ['pay', 'statement', 'payslips'];

export default function EmployeeProfile() {
  const { employeeId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentTenantId, businessProfile } = useTenant();
  const { addNotification } = useNotifications();
  const { accounts = [] } = useAccounts(currentTenantId);
  const { users = [] } = usePeople(currentTenantId);
  const {
    employees, payrollRecords, payrollPaymentMethods, loading, refetch,
    addEmployee, updateEmployee, deleteEmployee, processPayroll,
  } = usePayroll(currentTenantId);
  const today = todayISOInAppTZ();
  const emp = useMemo(() => employees.find((e) => String(e.id) === String(employeeId)) || null, [employees, employeeId]);

  const page = profilePage(params.get('tab'));
  const go = useCallback((p) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p === 'overview') next.delete('tab'); else next.set('tab', p);
      return next;
    }, { replace: true });
  }, [setParams]);

  const [hidden, toggleHidden] = useHiddenAmounts();
  const m = useMemo(() => maskedMoney(hidden, inr), [hidden]);

  const [month, setMonth] = useState(() => (/^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : today.slice(0, 7)));
  const win = monthBounds(month);
  const [version, setVersion] = useState(0);
  useEffect(() => { setVersion((v) => v + 1); }, [payrollRecords, emp]);

  const status = String(emp?.status || 'ACTIVE').toUpperCase();
  const inactive = status === 'INACTIVE';
  const joinsLater = !!emp?.joining_date && emp.joining_date > today;

  // The month's line, from the server. Inactive staff are in no run, so the
  // server has no line for them: they are shown without pay figures.
  const monthRun = usePayRunPreview({ tenantId: currentTenantId, from: win.from, to: win.to, version, enabled: !!emp && !inactive });
  const line = useMemo(() => {
    const r = monthRun.data?.run;
    return [...(r?.items || []), ...(r?.held || [])].find((l) => String(l.employeeId) === String(employeeId)) || null;
  }, [monthRun.data, employeeId]);
  const failed = !!monthRun.error && !line;

  const accountFor = useCallback((mm) => accounts.find((a) => a.id === accountForMethod(accounts, mm))?.name || null, [accounts]);
  const statement = useMemo(() => (line ? salaryStatement({
    line, month, records: payrollRecords, methods: payrollPaymentMethods, accountFor, asOf: today,
  }) : null), [line, month, payrollRecords, payrollPaymentMethods, accountFor, today]);

  // Year to date for the statement: the financial year's saved lines whose
  // period ends by the end of the month on screen.
  const stmtYtd = useMemo(() => {
    const f = financialYearOf(win.from);
    return { fy: f, upTo: win.to, ytd: yearToDateLines({ records: payrollRecords, employeeId, fyFrom: f.from, fyTo: f.to, include: (r) => (parsePeriodEnd(r.period) || '') <= win.to }) };
  }, [payrollRecords, employeeId, win.from, win.to]);

  // This person's saved lines, newest first: the payslips.
  const slips = useMemo(() => (payrollRecords || [])
    .map((r) => ({ r, item: (r.items || []).find((i) => String(i.employeeId) === String(employeeId)) }))
    .filter((x) => x.item), [payrollRecords, employeeId]);

  // Attendance for the financial year the month is in (counts only).
  const fy = financialYearOf(month + '-01');
  const [att, setAtt] = useState({ days: {}, loaded: false, error: null });
  useEffect(() => {
    if (!currentTenantId || !employeeId) return undefined;
    let alive = true;
    supabase.from('attendance').select('day, status, custom_rate')
      .eq('tenant_id', currentTenantId).eq('employee_id', employeeId).is('deleted_at', null)
      .gte('day', fy.from).lte('day', fy.to).limit(1000)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error('[payroll] profile attendance:', error); setAtt({ days: {}, loaded: true, error }); return; }
        const days = {};
        for (const r of data || []) days[String(r.day).slice(0, 10)] = { status: r.status, custom_rate: r.custom_rate };
        setAtt({ days, loaded: true, error: null });
      });
    return () => { alive = false; };
  }, [currentTenantId, employeeId, fy.from, fy.to, version]);

  const [form, setForm] = useState(false);
  const [pay, setPay] = useState(false);
  const [del, setDel] = useState(false);
  const [slip, setSlip] = useState(null);
  const [printStmt, setPrintStmt] = useState(false);
  const [collapsed, setCollapsed] = useState(false);   // left panel, wide screens
  const [navOpen, setNavOpen] = useState(false);       // left panel, narrow screens

  const toggleActive = async () => {
    const res = await updateEmployee({ ...emp, status: inactive ? 'ACTIVE' : 'INACTIVE' });
    if (res?.success) { addNotification(`${emp.name} is now ${inactive ? 'active' : 'inactive'}.`, 'success'); return; }
    const f = classifyWriteFailure(res?.error, { noun: 'change' });
    addNotification(f.maySaved ? `Couldn't confirm the change — it may have saved. Reload to check. (${f.detail})` : `Not changed: ${f.detail}`, 'error', 9000);
  };

  if (!emp) {
    return (
      <div className="pb-16">
        <BackLink onClick={() => navigate('/payroll')} />
        {loading ? <Skeleton className="mt-4 h-24 w-full" /> : (
          <EmptyState title="Employee not found" text="They may have been deleted, or the link is for another shop.">
            <Button variant="secondary" onClick={() => navigate('/payroll')}>Back to Payroll</Button>
          </EmptyState>
        )}
      </div>
    );
  }

  const first = emp.name.split(' ')[0];
  const mName = monthWords(month).split(' ')[0];
  const pending = line ? Number(line.netPay) : null;
  const canPay = !inactive && !failed && !joinsLater && pending > 0;
  const attendanceLink = `/payroll?tab=ATTENDANCE&from=${win.from}&to=${win.to}`;
  const title = page === 'pay' ? `${mName} pay so far` : PAGE_TITLE[page];
  const crumb = PAY_PAGES.includes(page) && page !== 'pay' ? `Pay › ${PAGE_TITLE[page]}` : null;

  const sections = [
    { key: 'overview', label: 'Overview', icon: House },
    { key: 'pay', label: 'Pay', icon: Banknote, subs: [['pay', `${mName} pay`], ['statement', 'Salary statement'], ['payslips', 'Payslips', slips.length]] },
    { key: 'attendance', label: 'Attendance', icon: CalendarDays },
    { key: 'details', label: 'Details', icon: IdCard },
  ];

  const nav = (
    <SectionNav sections={sections} page={page}
      onGo={(p) => { go(p); setNavOpen(false); }}
      onCollapse={() => { setCollapsed(true); setNavOpen(false); }} />
  );

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-3.5 flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body">
        <button type="button" onClick={() => navigate('/payroll')} className="inline-flex items-center gap-1 hover:text-ink"><ChevronLeft size={14} />Payroll</button>
        <span className="text-faint">/</span>Employees<span className="text-faint">/</span><b className="truncate text-ink">{emp.name}</b>
      </div>

      {/* Header (34): who, and what they are paid. */}
      <div className="m-rise mb-[18px] flex items-center gap-3" style={{ '--i': 1 }}>
        <Avatar name={emp.name} size="lg" dim={inactive} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 font-tight text-[21px] font-semibold leading-[1.2] tracking-[-0.01em]">
            {emp.name}
            {joinsLater ? <Pill tone="info">Joins {dayWords(emp.joining_date, { year: false })}</Pill> : statusPill(emp.status)}
          </h1>
          <p className="mt-0.5 text-[13px] text-body">
            {[emp.position, emp.department, emp.employee_code].filter(Boolean).map((x) => `${x} · `).join('')}
            <b className="font-semibold text-ink">{payTypeWords(emp.pay_type)} {m(isDayRateType(emp.pay_type) ? emp.daily_rate : emp.salary)}{isDayRateType(emp.pay_type) ? ' a day' : ''}</b>
            {emp.joining_date ? ` · ${joinsLater ? 'joins' : 'joined'} ${formatDate(emp.joining_date)}` : ''}
            {Number(emp.paid_leave_per_month) > 0 ? ` · paid leave ${emp.paid_leave_per_month} ${Number(emp.paid_leave_per_month) === 1 ? 'day' : 'days'} a month` : ''}
            {emp.phone ? ` · ${emp.phone}` : ''}
          </p>
        </div>
      </div>

      <div className={cn('m-rise grid items-start gap-7', !collapsed && 'lg:grid-cols-[248px_minmax(0,1fr)]')} style={{ '--i': 2 }}>
        {!collapsed && <div className="hidden lg:block">{nav}</div>}

        <div className="min-w-0">
          {/* Narrow screens: the sections open from a button. Wide screens with the panel collapsed: same button. */}
          <div className={cn('mb-3', !collapsed && 'lg:hidden')}>
            <button type="button" onClick={() => (collapsed ? setCollapsed(false) : setNavOpen((o) => !o))} aria-expanded={collapsed ? false : navOpen}
              className="m-press inline-flex items-center gap-2 rounded-pill px-3 py-[7px] font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <PanelLeft size={15} />Pay and attendance<span className="font-medium text-mute">· {crumb || title}</span>
              <ChevronDown size={14} className={cn('transition-transform', navOpen && 'rotate-180')} />
            </button>
            {navOpen && !collapsed && <div className="mt-2 rounded-[14px] border border-line bg-surface p-2 lg:hidden">{nav}</div>}
          </div>

          {/* Tasks (34): the same row on every page. */}
          <div className="mb-[22px] flex flex-wrap items-center gap-2" role="toolbar" aria-label="Tasks">
            <span className="mr-1 font-tight text-[13px] font-semibold text-mute">Tasks</span>
            {inactive ? <Button size="sm" onClick={toggleActive}><UserCheck /> Mark active</Button>
              : failed ? <Button size="sm" onClick={monthRun.reload}>Try again</Button>
              : <Button size="sm" onClick={() => setPay(true)} disabled={!canPay}>{pending > 0 && !hidden ? `Pay now · ${inr(pending)}` : 'Pay now'}</Button>}
            {!inactive && <Button size="sm" variant="outline" onClick={() => navigate(attendanceLink)}><CalendarCheck /> Mark attendance</Button>}
            <Button size="sm" variant="outline" onClick={() => setPrintStmt(true)} disabled={!statement}><Printer /> Print statement</Button>
            <Button size="sm" variant="outline" onClick={() => setForm(true)}><Pencil /> Edit details</Button>
            <RowMenu label="More actions" trigger={({ ref, onClick, open }) => (
              <Button ref={ref} size="sm" variant="outline" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={onClick}>···</Button>
            )}>
              {(close) => (
                <>
                  <MenuItem icon={inactive ? UserCheck : UserX} onClick={() => { close(); toggleActive(); }}>{inactive ? 'Mark active' : 'Mark inactive'}</MenuItem>
                  <MenuRule />
                  <MenuItem icon={Trash2} danger onClick={() => { close(); setDel(true); }}>Delete employee</MenuItem>
                </>
              )}
            </RowMenu>
          </div>

          <div className="mb-1.5 flex flex-wrap items-center gap-3">
            <h2 className="font-tight text-[22px] font-semibold tracking-[-0.02em]">{title}</h2>
            <div className="flex-1" />
            {crumb && <span className="text-[12px] text-mute">{crumb}</span>}
            <HideAmounts hidden={hidden} onToggle={toggleHidden} />
          </div>
          {page === 'overview' && (
            <p className="mb-1 text-[12px] text-mute">{hidden ? 'Every money figure on these pages is hidden until the eye is pressed again. Attendance and leave stay visible.' : 'Same figures as the staff list, Run payroll and the phone.'}</p>
          )}

          {failed && (
            <div className="mt-2">
              <ErrorBar action="Try again" onAction={monthRun.reload}>
                <b className="font-semibold">{first}’s pay figures could not be loaded.</b> Details are shown; days and pay are not, so nothing here reads as ₹0 owed. ({monthRun.error.message})
              </ErrorBar>
            </div>
          )}

          <div className="mt-2">
            {joinsLater && page === 'overview' ? (
              <EmptyState icon={CalendarClock} title="Nothing here yet"
                text={`${first} joins on ${formatDate(emp.joining_date)}. Attendance, pay and payslips start showing from then.`}
                steps={[
                  ['Check PF and tax', [emp.epf_enabled ? 'PF is on' : 'PF is off', emp.professional_tax_state ? `professional tax state ${String(emp.professional_tax_state).replace(/_/g, ' ').toLowerCase()}` : 'no professional tax'].join('; ') + '.'],
                  ['Mark the first day', `From the Attendance page on ${dayWords(emp.joining_date, { year: false })}.`],
                ]} />
            ) : page === 'overview' ? (
              <Overview emp={emp} m={m} hidden={hidden} onToggleHidden={toggleHidden} line={line} failed={failed} inactive={inactive}
                monthName={mName} month={month} today={today} slips={slips} methods={payrollPaymentMethods} ytd={stmtYtd} att={att}
                canPay={canPay} onPay={() => setPay(true)} onGo={go} onSlip={(r, item) => setSlip({ run: r, items: [item] })} />
            ) : page === 'pay' ? (
              <Card title={`${monthWords(month)}`} aside={<span className="text-[12px] text-mute">Same calculation as Run payroll and the phone</span>}>
                {inactive ? <p className="py-6 text-center text-[13.5px] text-body">Inactive staff are left out of pay runs and the staff totals. Mark active brings {first} back into the next run.</p>
                  : !statement ? (failed ? <p className="py-10 text-center text-mute">Pay breakdown not loaded</p> : <Skeleton className="h-40 w-full" />)
                  : <Breakdown st={statement} m={m} />}
                {line && <LeaveLine line={line} />}
              </Card>
            ) : page === 'statement' ? (
              <StatementTab month={month} setMonth={setMonth} st={statement} failed={failed} inactive={inactive} name={emp.name}
                ytd={stmtYtd} onPrint={() => setPrintStmt(true)} m={m} />
            ) : page === 'attendance' ? (
              <AttendanceView month={month} setMonth={setMonth} today={today} att={att} fy={fy} emp={emp} records={payrollRecords} />
            ) : page === 'payslips' ? (
              <PayslipsTab slips={slips} methods={payrollPaymentMethods} emp={emp} onOpen={(r, items) => setSlip({ run: r, items })} today={today} m={m} />
            ) : (
              <DetailsTab emp={emp} users={users} onEdit={() => setForm(true)} m={m} hidden={hidden} />
            )}
          </div>
        </div>
      </div>

      <EmployeeForm open={form} employee={emp} users={users} refetch={refetch} onClose={() => setForm(false)}
        addEmployee={addEmployee} updateEmployee={updateEmployee} onSaved={() => addNotification('Changes saved.', 'success')} />
      <PayOneDialog open={pay} onClose={() => setPay(false)} tenantId={currentTenantId} employee={emp} month={month} amount={pending}
        accountFor={accountFor} processPayroll={processPayroll}
        onPaid={(l, mm, res) => { setVersion((v) => v + 1); addNotification(res?.replayed ? 'That payment was already saved by an earlier press; nothing was paid twice.' : `Paid ${inr(l.netPay)} to ${emp.name}.`, 'success'); }} />
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={`Delete ${emp.name}?`}
        text="They leave the staff list and future pay runs. What they were already paid stays in Pay history and in Expenses."
        bullets={[slips.find((s) => Number(s.item.netPay) > 0) ? `Last paid in the ${periodWords(slips.find((s) => Number(s.item.netPay) > 0).r.period)} run` : 'Never paid in a pay run',
          'Their attendance stays on the days already marked', 'The record is kept, marked deleted, so past pay runs still name them']}
        confirmLabel="Delete employee"
        onConfirm={async () => {
          const res = await deleteEmployee(emp.id);
          if (res?.success) { addNotification(`${emp.name} was removed from the staff list.`, 'success'); navigate('/payroll'); return null; }
          const f = classifyWriteFailure(res?.error, { noun: 'delete' });
          return f.maySaved ? `Couldn't confirm the delete — it may have gone through. Reload to check. (${f.detail})` : `Not deleted: ${f.detail}`;
        }} />
      {slip && <PaySlip run={slip.run} items={slip.items} employees={employees} records={payrollRecords}
        paymentMethods={payrollPaymentMethods} accounts={accounts} business={businessProfile} onClose={() => setSlip(null)} />}
      {printStmt && statement && <StatementPrint st={statement} emp={emp} business={businessProfile} month={month} today={today}
        ytd={<YtdBlock print ytd={stmtYtd.ytd} fyLabel={stmtYtd.fy.label} upTo={stmtYtd.upTo} stillToPay={statement.stillToPay} />}
        onClose={() => setPrintStmt(false)} />}
    </div>
  );
}

const BackLink = ({ onClick }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink"><ChevronLeft size={14} />Payroll</button>
);

/** Left sections (34, 36). A section with sub-pages opens to show them. */
function SectionNav({ sections, page, onGo, onCollapse }) {
  const inSection = (s) => s.key === page || (s.subs || []).some(([k]) => k === page);
  const [toggled, setToggled] = useState({});
  // Nav rows, not action buttons: the mockup's 10px row radius (buttonRadius.test leaves nav rows alone).
  const item = 'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left font-tight text-[14px] font-medium text-ink-2 hover:bg-tile';
  const subItem = 'flex w-full items-center rounded-[10px] py-[7px] pr-2.5 pl-[37px] text-left font-tight text-[13.5px] text-body hover:bg-tile';
  return (
    <nav aria-label="Pay and attendance" className="lg:border-r lg:border-sep lg:pr-3.5">
      <div className="flex items-center justify-between px-2 pt-1 pb-3 font-tight text-[15px] font-semibold">
        Pay and attendance
        <button type="button" onClick={onCollapse} aria-label="Collapse panel" title="Collapse panel" className="hidden h-7 w-7 place-items-center rounded-xl text-body hover:bg-tile lg:grid"><PanelLeft size={16} /></button>
      </div>
      {sections.map((s) => {
        const Icon = s.icon;
        const isOpen = toggled[s.key] ?? inSection(s);
        const here = s.subs ? false : page === s.key;
        return (
          <div key={s.key}>
            <button type="button" aria-current={here ? 'page' : undefined} aria-expanded={s.subs ? isOpen : undefined}
              onClick={() => {
                if (s.subs) {
                  if (!inSection(s)) { setToggled((o) => ({ ...o, [s.key]: true })); onGo(s.subs[0][0]); } else setToggled((o) => ({ ...o, [s.key]: !isOpen }));
                } else onGo(s.key);
              }}
              className={cn(item, here && 'bg-amber-soft font-semibold text-ink')}>
              <Icon size={17} strokeWidth={1.8} className={here ? 'text-amber-text' : 'text-body'} />{s.label}
              {s.subs && <ChevronDown size={14} className={cn('ml-auto text-mute transition-transform', isOpen && 'rotate-180')} />}
            </button>
            {s.subs && isOpen && s.subs.map(([k, label, count]) => (
              <button key={k} type="button" aria-current={page === k ? 'page' : undefined} onClick={() => onGo(k)}
                className={cn(subItem, page === k && 'bg-amber-soft font-semibold text-ink')}>
                {label}{count > 0 && <span className="ml-auto text-[12px] font-medium tabular-nums text-mute">{count}</span>}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

const Tile = ({ label, value, sub, tone }) => (
  <div className="relative min-w-0 px-[22px] py-0.5 first:pl-0 [&+&]:border-l [&+&]:border-sep">
    <Eyebrow>{label}</Eyebrow>
    <b className={cn('mt-1.5 mb-1 block font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums', value === '—' || value === '…' ? 'text-faint' : tone)}>{value}</b>
    {sub && <small className="block truncate text-[12.5px] text-body">{sub}</small>}
  </div>
);

/** The "Hide amounts" switch (34, 35). */
const HideAmounts = ({ hidden, onToggle }) => (
  <button type="button" onClick={onToggle} aria-pressed={hidden}
    className={cn('m-press inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-tight text-[13px] font-semibold',
      hidden ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]')}>
    {hidden ? <EyeOff size={15} /> : <Eye size={15} />}{hidden ? 'Amounts hidden' : 'Hide amounts'}
  </button>
);

/** One big-figure card (34). */
function BigCard({ title, sub, fig, label, rows = [], link, onLink, money, hidden, onToggleHidden }) {
  return (
    <div className="border-b border-sep pt-[22px] pb-[26px]">
      <h3 className="font-tight text-[16px] font-semibold">{title}</h3>
      {sub && <div className="mt-[3px] text-[13px] text-body">{sub}</div>}
      <div className="mt-4 flex items-center gap-3">
        <b className={cn('font-tight text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums sm:text-[40px]',
          fig === '—' || fig === '…' ? 'text-faint' : money && hidden ? 'tracking-[0.06em] text-ink-2' : 'text-ink')}>{fig}</b>
        {money && fig !== '—' && fig !== '…' && (
          <button type="button" onClick={onToggleHidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} title={hidden ? 'Show amounts' : 'Hide amounts'}
            className="m-press grid h-8 w-8 place-items-center rounded-xl text-body shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {label && <div className="mt-2 text-[13px] text-body">{label}</div>}
      {rows.length > 0 && (
        <div className="mt-3.5 max-w-[360px] border-t border-sep">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-sep py-[9px] text-[13.5px]">
              <span className="text-body">{k}</span><span className="font-tight font-medium tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}
      {link && <button type="button" onClick={onLink} className="mt-3.5 font-tight text-[13.5px] font-semibold text-ink underline decoration-faint underline-offset-[3px] hover:decoration-ink">{link}</button>}
    </div>
  );
}

/** Overview (34): each card links to its page. */
function Overview({ emp, m, hidden, onToggleHidden, line, failed, inactive, monthName, month, today, slips, methods, ytd, att, canPay, onPay, onGo, onSlip }) {
  const first = emp.name.split(' ')[0];
  const win = monthBounds(month);
  const upTo = today < win.to && today >= win.from ? today : win.to;
  const latest = slips.find((s) => Number(s.item.netPay) > 0) || null;
  const latestSlip = latest ? buildPayslip({ run: latest.r, item: latest.item }) : null;
  const t = markTally(att.days, win.from, upTo);
  const present = t.PRESENT + t.HALF_DAY / 2;
  const unknown = inactive || failed;
  const pick = (v) => (inactive || failed ? '—' : line ? v : '…');
  const props = { hidden, onToggleHidden };
  return (
    <div className="grid gap-x-12 gap-y-1 md:grid-cols-2">
      <BigCard {...props} money title="Most recent pay"
        sub={latest ? [latest.r.processed_at ? `Paid ${dayWords(shopDay(latest.r.processed_at), { year: false })}` : null, methodLabel(methods[latest.r.id]) ? `by ${methodLabel(methods[latest.r.id])}` : null].filter(Boolean).join(' ') : 'No pay runs yet'}
        fig={latestSlip ? m(latestSlip.netPay) : '—'}
        label={latest ? `Take-home pay, ${periodWords(latest.r.period)}` : `${first} has not been paid in a pay run yet`}
        rows={latestSlip ? [['Gross pay', m(latestSlip.grossEarnings)], ['Deductions', m(latestSlip.deductions)]] : []}
        link={latest ? 'View payslip' : null} onLink={() => latest && onSlip(latest.r, latest.item)} />
      <BigCard {...props} money title="Still to pay"
        sub={inactive ? 'Inactive, not paid' : failed ? 'Pay figures not loaded' : `${monthName}, as on ${dayWords(upTo, { year: false })}`}
        fig={pick(m(line?.netPay))}
        label={inactive ? `Mark active brings ${first} back into the next run` : `Owed to ${first} now`}
        rows={line && !unknown ? [
          ['Earned this month', m(line.basePay)],
          ...(Number(line.statutoryTotal) > 0 ? [['Deductions', m(line.statutoryTotal)]] : []),
          ['Paid', m(line.alreadyPaid)],
        ] : []}
        link={canPay ? 'Pay now' : unknown ? null : `View ${monthName} pay`} onLink={() => (canPay ? onPay() : onGo('pay'))} />
      <BigCard {...props} money title="This year so far"
        sub={`FY ${ytd.fy.label} · April to ${dayWords(ytd.upTo, { year: false })}`}
        fig={m(ytd.ytd.net)} label="Net pay, year to date"
        rows={[['Gross pay', m(ytd.ytd.gross)], ['Deductions', m(ytd.ytd.deductionsTotal)]]}
        link="View salary statement" onLink={() => onGo('statement')} />
      <BigCard {...props} title="Attendance this month"
        sub={`${rangeWords(win.from, upTo, { year: false })}`}
        fig={att.error ? '—' : !att.loaded ? '…' : `${daysText(present)} ${present === 1 ? 'day' : 'days'}`}
        label={att.error ? 'Attendance not loaded' : 'Present'}
        rows={att.error || !att.loaded ? [] : [
          ['Absent', String(t.ABSENT)],
          ['Leave and sick', String(t.LEAVE + t.SICK)],
          ...(line && !isDayRateType(line.payType) && Number(line.leaveAllowed) > 0
            ? [['Paid leave left this month', `${Math.max(0, line.leaveAllowed - line.leaveUsed)} of ${line.leaveAllowed}${line.leaveExceeded ? ' · over' : ''}`]] : []),
        ]}
        link="View attendance" onLink={() => onGo('attendance')} />
    </div>
  );
}

/** Paid leave for the month under the pay breakdown (was a figure tile on the old overview). */
const LeaveLine = ({ line }) => {
  if (isDayRateType(line.payType)) return <p className="mt-3 text-[12px] text-mute">Day-rate staff are not paid for leave.</p>;
  if (!(Number(line.leaveAllowed) > 0)) return <p className="mt-3 text-[12px] text-mute">No paid leave set.</p>;
  const left = Math.max(0, line.leaveAllowed - line.leaveUsed);
  return <p className="mt-3 text-[12px] text-mute">Paid leave: {left} {left === 1 ? 'day' : 'days'} left of {line.leaveAllowed} this month · {line.leaveUsed} used{line.leaveExceeded ? ' · over the allowance' : ''}.</p>;
};

/** The month's lines as a short breakdown: the statement's rows. */
function Breakdown({ st, m }) {
  return (
    <div>
      {st.rows.map((r) => (
        <div key={r.key} className="flex justify-between gap-3 border-b border-sep py-[9px] text-[13.5px]">
          <span className="text-ink-2">{r.title}{r.note && <small className="block text-[12px] text-mute">{r.note}</small>}</span>
          <span className={cn('whitespace-nowrap font-tight tabular-nums', r.type === 'deduction' && 'text-bad-text', r.type === 'paid' && 'text-good-text')}>
            {r.type === 'paid' || r.type === 'adjust' ? m(-r.paid) : m(r.earned)}
          </span>
        </div>
      ))}
      <div className="mt-0.5 flex justify-between border-t border-line pt-[9px] font-tight text-[15px] font-semibold">
        <span>{st.paidAhead ? 'Paid ahead' : 'Still to pay'}</span><span className="tabular-nums">{st.paidAhead ? m(st.paidAhead) : m(st.stillToPay)}</span>
      </div>
    </div>
  );
}

/** Salary statement (22). Rows are lib/payrollView.salaryStatement's. */
function StatementTab({ month, setMonth, st, failed, inactive, name, ytd, onPrint, m = inr }) {
  const [only, setOnly] = useState('ALL');
  const rows = st?.rows || [];
  const earnedN = rows.filter((r) => r.type === 'earned' || r.type === 'deduction').length;
  const paidN = rows.filter((r) => r.type === 'paid' || r.type === 'adjust').length;
  const shown = rows.filter((r) => only === 'ALL' || (only === 'EARNED' ? (r.type === 'earned' || r.type === 'deduction') : (r.type === 'paid' || r.type === 'adjust')));
  const first = name.split(' ')[0];
  return (
    <div className="m-rise">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <MonthStep label={monthWords(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        <FilterPills value={only} onChange={setOnly} ariaLabel="Show"
          items={[{ key: 'ALL', label: 'All', count: rows.length }, { key: 'EARNED', label: 'Earned', count: earnedN }, { key: 'PAID', label: 'Paid', count: paidN }]} />
        <div className="flex-1" />
        <Button variant="secondary" onClick={onPrint} disabled={!st}><Printer /> Print</Button>
      </div>
      {inactive ? <EmptyState title="No statement while inactive" text={`${first} is not in pay runs while inactive, so nothing is earned. Past pay is on the Payslips page.`} />
        : !st ? (failed ? <EmptyState title="Statement not loaded" text="The pay figures could not be loaded." /> : <Skeleton className="h-48 w-full" />) : (
        <>
          <StatementTable st={st} rows={shown} money={m} />
          <YtdBlock ytd={ytd.ytd} fyLabel={ytd.fy.label} upTo={ytd.upTo} stillToPay={st.stillToPay} money={m} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-body">
            <span className="inline-flex items-center gap-[5px]"><i className="inline-block h-2 w-2 rounded-full bg-good" />Earned</span>
            <span className="inline-flex items-center gap-[5px]"><i className="inline-block h-2 w-2 rounded-full bg-ink" />Payment</span>
            <span className="inline-flex items-center gap-[5px]"><i className="inline-block h-2 w-2 rounded-full bg-bad" />Deduction</span>
            <span className="ml-auto text-mute">Balance is what the shop owes {first}. Below zero means {first} has been paid ahead.{st.asOf < st.to ? ` Shown to ${dayWords(st.asOf, { year: false })}.` : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Attendance (24): read-only calendar, counts, the year by month. */
function AttendanceView({ month, setMonth, today, att, fy, emp, records }) {
  const win = monthBounds(month);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const n = Number(win.to.slice(8));
  const t = markTally(att.days, win.from, win.to);
  let unmarked = 0;
  let toCome = 0;
  for (let d = 1; d <= n; d += 1) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    if (iso > today) toCome += 1; else if (!att.days[iso]) unmarked += 1;
  }
  const paidWins = (records || []).filter((r) => (r.items || []).some((i) => String(i.employeeId) === String(emp.id) && Number(i.netPay) > 0))
    .map((r) => { const s = String(r.period); return s.includes('/') ? s.split('/') : [monthBounds(s)?.from, monthBounds(s)?.to]; });
  const navigate = useNavigate();
  const fyMonths = Array.from({ length: 12 }, (_, i) => {
    const yy = Number(fy.from.slice(0, 4)) + (i >= 9 ? 1 : 0);
    const mm = ((i + 3) % 12) + 1;
    return `${yy}-${pad(mm)}`;
  });
  return (
    <div className="m-rise">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <MonthStep label={monthWords(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        <span className="text-[13px] text-mute">Marks come from Payroll › Attendance and the phone.</span>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => navigate(`/payroll?tab=ATTENDANCE&from=${win.from}&to=${win.to}`)}><CalendarCheck /> Change marks</Button>
      </div>
      {att.error && <ErrorBar>Attendance could not be loaded: {att.error.message}</ErrorBar>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid grid-cols-7 gap-1.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d} className="px-1 pb-1 font-tight text-[11px] font-semibold uppercase tracking-[0.05em] text-mute">{d}</span>)}
          {Array.from({ length: first }, (_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: n }, (_, i) => {
            const iso = `${y}-${pad(m)}-${pad(i + 1)}`;
            const mk = markOf(att.days[iso]?.status);
            const fut = iso > today;
            const paid = paidWins.some(([a, b]) => a && iso >= a && iso <= b);
            const own = att.days[iso]?.custom_rate != null && isDayRateType(emp.pay_type);
            return (
              <div key={iso} className={cn('flex h-[76px] flex-col justify-between rounded-xl px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
                fut ? 'bg-[#FBFBFA]' : paid ? 'bg-[#F3FAF5]' : 'bg-surface', iso === today && 'shadow-[inset_0_0_0_2px_var(--color-ink)]', own && 'ring-[1.5px] ring-[#60A5FA]')}>
                <span className={cn('font-tight text-[13px] font-semibold', fut ? 'text-faint' : 'text-ink-2')}>{i + 1}{iso === today ? ' · today' : ''}</span>
                {mk ? <em className={cn('self-start rounded-pill px-2 py-[3px] font-tight text-[11.5px] not-italic font-semibold', mk.cell)}>{mk.label}</em>
                  : !fut && <em className="self-start rounded-pill bg-tile px-2 py-[3px] font-tight text-[11.5px] not-italic font-semibold text-mute">Not marked</em>}
              </div>
            );
          })}
        </div>
        <div className="grid gap-4">
          <Card title={`${monthWords(month).split(' ')[0]} totals`}>
            <div className="grid grid-cols-2 gap-2">
              {['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'SICK'].map((k) => (
                <div key={k} className="rounded-[10px] bg-tile px-3 py-[9px]">
                  <span className="flex items-center gap-1.5 text-[12px] text-body"><i className={cn('inline-block h-3.5 w-3.5 rounded-[4px]', MARK[k].cell)} />{MARK[k].label}</span>
                  <b className="mt-0.5 block font-tight text-[18px] font-semibold tabular-nums">{t[k]}</b>
                </div>
              ))}
            </div>
            <Row k="Not marked, so far" v={unmarked} />
            <Row k="Still to come" v={`${toCome} ${toCome === 1 ? 'day' : 'days'}`} />
            {isDayRateType(emp.pay_type) && <Row k="Own-rate days" v={t.customRate} last />}
          </Card>
          <Card title="Key">
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-body">
              {['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'SICK'].map((k) => <span key={k} className="inline-flex items-center gap-[5px]"><i className={cn('inline-block h-3 w-3 rounded-[4px]', MARK[k].cell)} />{MARK[k].label}</span>)}
              <span className="inline-flex items-center gap-[5px]"><i className="inline-block h-3 w-3 rounded-[4px] bg-[#F3FAF5] shadow-[inset_0_0_0_1px_#BFE5CB]" />Already paid</span>
              {isDayRateType(emp.pay_type) && <span className="inline-flex items-center gap-[5px]"><i className="inline-block h-3 w-3 rounded-[4px] shadow-[0_0_0_1.5px_#60A5FA]" />Own rate that day</span>}
            </div>
          </Card>
        </div>
      </div>
      <div className="mt-[18px] mb-2.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Financial year {fy.label} · days present</div>
      <div className="grid grid-cols-4 gap-1.5 md:grid-cols-12">
        {fyMonths.map((mm) => {
          const b = monthBounds(mm);
          const fut = b.from > today;
          const c = markTally(att.days, b.from, b.to);
          const bits = [c.ABSENT ? `${c.ABSENT} absent` : null, c.LEAVE ? `${c.LEAVE} leave` : null, c.SICK ? `${c.SICK} sick` : null].filter(Boolean).join(' · ');
          return (
            <div key={mm} className={cn('rounded-[10px] px-2 pt-2 pb-[7px] text-center shadow-[inset_0_0_0_1px_var(--color-line)]', fut ? 'bg-[#FBFBFA] text-faint' : 'bg-surface', mm === month && 'shadow-[inset_0_0_0_2px_var(--color-ink)]')}>
              <b className="block font-tight text-[12px] font-semibold">{monthWords(mm).slice(0, 3)}</b>
              <span className="mt-0.5 block font-tight text-[15px] font-semibold tabular-nums">{fut ? '—' : daysText(c.PRESENT + c.HALF_DAY / 2)}</span>
              <small className={cn('block truncate text-[10.5px]', c.ABSENT ? 'text-amber-text' : 'text-mute')}>{fut ? 'to come' : bits || '—'}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Row = ({ k, v, last }) => (
  <div className={cn('flex justify-between gap-3 py-[9px] text-[13.5px]', !last && 'border-b border-sep', 'first-of-type:mt-2')}>
    <span className="text-ink-2">{k}</span><span className="font-tight tabular-nums">{v}</span>
  </div>
);

/** Payslips (25): every saved line for this person, by financial year. */
function PayslipsTab({ slips, methods, emp, onOpen, today, m = inr }) {
  const years = [...new Set(slips.map(({ r }) => financialYearOf(parsePeriodEnd(r.period) || today).label))];
  const [fyLabel, setFy] = useState(() => financialYearOf(today).label);
  const pick = years.includes(fyLabel) ? fyLabel : years[0] || financialYearOf(today).label;
  const list = slips.filter(({ r }) => financialYearOf(parsePeriodEnd(r.period) || today).label === pick);
  // Year to date: the picked financial year's saved lines, summed the way
  // each slip prints them (lib/payslip.yearToDateLines).
  const fyOf = financialYearOf(`${pick.slice(0, 4)}-04-01`);
  const ytd = yearToDateLines({ records: list.map((x) => x.r), employeeId: emp.id, fyFrom: fyOf.from, fyTo: fyOf.to });
  const gross = ytd.gross;
  const ded = ytd.deductionsTotal;
  const net = ytd.net;
  return (
    <div className="m-rise">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <label className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--color-line)]">
          <em className="not-italic text-mute">Year</em>
          <select value={pick} onChange={(e) => setFy(e.target.value)} className="bg-transparent font-tight font-semibold outline-none" aria-label="Financial year">
            {(years.length ? years : [pick]).map((y) => <option key={y} value={y}>FY {y}</option>)}
          </select>
        </label>
        <span className="text-[13px] text-mute">Every slip is read from the pay run it belongs to, so it never changes afterwards.</span>
        <div className="flex-1" />
        <Button variant="secondary" disabled={!list.length} onClick={() => list.length && onOpen(list[0].r, list.map((x) => x.item))}><Printer /> Print the latest</Button>
      </div>
      <div className="mb-3.5 grid grid-cols-2 md:grid-cols-4">
        <Tile label="Gross, year to date" value={m(gross)} sub={`FY ${pick} · earnings on the payslips`} />
        <Tile label="Deductions, year to date" value={m(ded)} sub={ded > 0 ? ytd.deductions.map((d) => d.label).join(', ') : `none for ${emp.name.split(' ')[0]}`} />
        <Tile label="Net, year to date" value={m(net)} sub={`${m(gross)} − ${m(ded)}`} />
        <Tile label="Payslips" value={String(list.length)} sub={`FY ${pick}`} />
      </div>
      {list.length === 0 ? <EmptyState icon={FileText} title="No payslips this year" text="Payslips appear once a pay run includes this person." /> : (
        <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead><tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3.5 [&>th]:py-2 [&>th]:text-left [&>th]:font-tight [&>th]:text-[11.5px] [&>th]:font-semibold [&>th]:text-mute">
              <th>Period</th><th>Paid on</th><th>Paid by</th><th className="!text-right">Gross</th><th className="!text-right">Deductions</th><th className="!text-right">Net</th><th className="!text-right">Slip</th>
            </tr></thead>
            <tbody>
              {list.map(({ r, item }) => {
                const sl = buildPayslip({ run: r, item });
                return (
                  <tr key={r.id} className="[&>td]:border-b [&>td]:border-sep [&>td]:px-3.5 [&>td]:py-2.5">
                    <td><b className="block font-tight font-semibold">{periodWords(r.period)}</b><small className="text-[11.5px] text-mute">{runKindLabel(r.period)}</small></td>
                    <td>{r.processed_at ? dayWords(shopDay(r.processed_at)) : '—'}</td>
                    <td>{methodLabel(methods[r.id]) || '—'}</td>
                    <td className="text-right tabular-nums">{m(sl?.grossEarnings)}</td>
                    <td className="text-right tabular-nums">{m(sl?.deductions)}</td>
                    <td className="text-right font-tight font-semibold tabular-nums">{m(sl?.netPay)}</td>
                    <td className="text-right"><button type="button" onClick={() => onOpen(r, [item])} aria-label={`Payslip for ${periodWords(r.period)}`} className="m-press inline-grid h-[30px] w-[30px] place-items-center rounded-[9px] text-body shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile"><FileText size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="font-tight font-semibold tabular-nums [&>td]:border-t [&>td]:border-line [&>td]:px-3.5 [&>td]:py-2.5">
              <td colSpan={3}>{list.length} payslip{list.length === 1 ? '' : 's'}</td><td className="text-right">{m(gross)}</td><td className="text-right">{m(ded)}</td><td className="text-right">{m(net)}</td><td />
            </tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
const parsePeriodEnd = (period) => {
  const s = String(period || '');
  return s.includes('/') ? s.split('/')[1] : monthBounds(s)?.to || null;
};

/** Details (29). Sensitive numbers masked to the last 4. */
function DetailsTab({ emp, users, onEdit, m = inr, hidden = false }) {
  const [reveal, setReveal] = useState(false);
  const linked = users.find((u) => u.id === emp.user_id);
  const none = (t = 'Not added') => <span className="font-normal text-faint">{t}</span>;
  const secret = (v) => (v ? <span className="font-tight tracking-[0.04em] tabular-nums">{reveal ? v : maskSensitive(v)}</span> : none());
  const pt = emp.professional_tax_state ? String(emp.professional_tax_state).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'Not applicable';
  const cards = [
    ['Personal', [['Full name', emp.name], ['Date of birth', emp.dob ? formatDate(emp.dob) : none()], ['Gender', emp.gender ? emp.gender.charAt(0) + emp.gender.slice(1).toLowerCase() : none()],
      ['Blood group', emp.blood_group || none()], ['Phone', emp.phone || none()], ['Email', emp.email || none()], ['Emergency contact', emp.emergency_contact || none()]]],
    ['Job', [['Employee code', emp.employee_code || none()], ['Position / role', emp.position || none()], ['Department', emp.department || none()],
      ['Employment type', { FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', INTERN: 'Intern' }[emp.employment_type] || emp.employment_type || none()],
      ['Joined', emp.joining_date ? formatDate(emp.joining_date) : none()], ['Status', statusPill(emp.status)], ['Linked login', linked ? (linked.name || linked.email) : none('No linked account')]]],
    ['Pay setup', [['Pay type', payTypeWords(emp.pay_type)], [isDayRateType(emp.pay_type) ? 'Rate' : 'Salary', hidden ? MASK : rateWords(emp)],
      ['Paid leave', Number(emp.paid_leave_per_month) > 0 ? `${emp.paid_leave_per_month} ${Number(emp.paid_leave_per_month) === 1 ? 'day' : 'days'} a month` : 'None set'],
      ['Bank account / UPI', secret(emp.bank_account)]]],
    ['Statutory', [['PAN', secret(emp.pan)], ['Aadhaar', secret(emp.aadhaar)], ['PF', emp.epf_enabled ? (emp.epf_on_full_wage ? 'On, on the full wage' : 'On') : 'Off'],
      ['PF account no.', secret(emp.pf_account)], ['ESI', `${emp.esi_enabled ? 'On' : 'Off'}`], ['ESI no.', secret(emp.esi_no)],
      ['Professional tax state', pt], ['TDS a month', m(emp.tds_monthly)]]],
  ];
  return (
    <div className="m-rise">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 font-tight text-[13.5px] font-semibold">
          <Switch id="show-sensitive" checked={reveal} onChange={setReveal} label="Show sensitive data" />
          <span aria-hidden="true">Show sensitive data</span>
        </span>
        <span className="text-[12px] text-mute">Sensitive numbers show the last 4 only while the switch is off. It turns off again when you leave this page.</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(([title, rows]) => (
          <Card key={title} title={title} aside={<LinkButton onClick={onEdit}>Edit</LinkButton>}>
            <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[170px_1fr]">
              {rows.map(([k, v]) => (
                <React.Fragment key={k}>
                  <span className="border-b border-sep py-[9px] text-[13.5px] text-body">{k}</span>
                  <span className="flex items-center gap-2 border-b border-sep py-[9px] text-[13.5px] font-medium text-ink">{v}</span>
                </React.Fragment>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
