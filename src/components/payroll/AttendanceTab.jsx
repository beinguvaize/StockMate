import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { markCounts, isDayRate } from '../../lib/payRun';
import { paidByEmployeeInMonth } from '../../lib/payrollPeriods';
import { monthBounds, monthWords, dayWords, shopDay, periodWords, daysText } from '../../lib/payrollView';
import { inr, MARK, MARK_ORDER, markOf, MonthStep, Pill, Hint } from './parts';

/**
 * The attendance grids (approved mockups 07, 08, 09): one for day-rate staff,
 * and -- new on the web -- one for salaried staff, whose marks used to be
 * phone-only.
 *
 * The money columns are the server's line for the month, so they show what
 * is SAVED. Unsaved marks are drawn on the grid and counted in Days, but they
 * reach the money only once saved: the server never sees a mark that was not
 * written, and Run payroll stays shut until the save is done.
 */
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n) => String(n).padStart(2, '0');

export default function AttendanceTab({ month, today, employees = [], att, lines, figuresFailed, records = [], onPrevMonth, onNextMonth, onRunPayroll, onAddEmployee }) {
  const win = monthBounds(month);
  const [y, m] = month.split('-').map(Number);
  const days = useMemo(() => {
    const n = Number(win.to.slice(8));
    return Array.from({ length: n }, (_, i) => {
      const iso = `${y}-${pad(m)}-${pad(i + 1)}`;
      const dow = new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay();
      return { iso, n: i + 1, dow, weekend: dow === 0 || dow === 6, future: iso > today };
    });
  }, [win.to, y, m, today]);

  const active = employees.filter((e) => String(e.status || 'ACTIVE').toUpperCase() === 'ACTIVE');
  const dayRate = active.filter((e) => isDayRate(e.pay_type));
  const salaried = active.filter((e) => !isDayRate(e.pay_type));
  const onLeave = employees.filter((e) => String(e.status).toUpperCase() === 'ON_LEAVE');

  // Which saved runs covered which days, per person: drawn as a green wash.
  const paidMap = useMemo(() => paidByEmployeeInMonth(y, m, records), [y, m, records]);
  const paidRunOn = (empId, day) => (paidMap.get(empId)?.runs || []).find((r) => r.window && day >= r.window.from && day <= r.window.to) || null;

  // ── The day picker, portalled so the grid's scroll box cannot clip it ──
  const [pick, setPick] = useState(null); // { emp, day }
  const anchor = useRef(null);
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!pick) { setRect(null); return undefined; }
    const measure = () => anchor.current && setRect(anchor.current.getBoundingClientRect());
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [pick]);
  useEffect(() => {
    if (!pick) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPick(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);
  const [rateDraft, setRateDraft] = useState({});

  const problem = att.problem;
  const showBar = att.pendingCount > 0 || problem;

  const cell = (emp, d) => {
    const entry = att.attendance[emp.id]?.[d.iso];
    const mk = markOf(entry?.status);
    const dirty = !!(att.pending[emp.id] && d.iso in att.pending[emp.id]);
    const isOpen = pick?.emp.id === emp.id && pick?.day === d.iso;
    const ownRate = entry?.custom_rate != null && Math.round(entry.custom_rate) !== Math.round(Number(emp.daily_rate) || 0) && isDayRate(emp.pay_type);
    const paidRun = paidRunOn(emp.id, d.iso);
    const title = paidRun
      ? `${dayWords(d.iso, { year: false })} · inside the ${periodWords(paidRun.period)} run${paidRun.processed_at ? `, paid ${dayWords(shopDay(paidRun.processed_at), { year: false })}` : ''}`
      : dayWords(d.iso, { year: false });
    return (
      <td key={d.iso} className={cn('border-b border-sep p-0 text-center', paidRun ? 'bg-[#EFF8F2]' : d.weekend ? 'bg-[#FBF6EE]' : '')}>
        <button type="button" data-testid="att-day" title={title} aria-label={`${title}${mk ? `: ${mk.label}` : ''}`}
          onClick={(ev) => { if (isOpen) { setPick(null); return; } anchor.current = ev.currentTarget; setPick({ emp, day: d.iso }); }}
          className={cn('my-1.5 inline-grid min-h-[22px] w-[22px] place-items-center rounded-[6px] py-[3px] font-tight text-[10.5px] font-bold leading-none',
            mk ? mk.cell : d.future ? 'bg-transparent text-[#DADCDF]' : 'bg-well text-faint',
            ownRate && 'shadow-[0_0_0_1.5px_#60A5FA]', dirty && 'outline-2 outline-offset-1 outline-amber', isOpen && 'shadow-[0_0_0_2px_var(--color-ink)]')}>
          <span>{mk ? mk.icon : '·'}</span>
          {ownRate && <em className="mt-0.5 block font-tight text-[8px] not-italic font-semibold text-info-text">{Math.round(entry.custom_rate)}</em>}
        </button>
      </td>
    );
  };

  const renderHead = (last) => (
    <thead>
      <tr>
        <th className="w-[156px] border-b border-line py-1.5 pl-3.5 pr-2.5 text-left font-tight text-[10px] font-semibold text-mute">Employee</th>
        {days.map((d) => (
          <th key={d.iso} className={cn('border-b border-line py-1.5 text-center font-tight text-[10px] font-semibold leading-[1.15] text-mute', d.weekend && 'bg-[#FBF6EE]')}>
            <em className={cn('block text-[9px] not-italic', d.weekend ? 'text-[#D9A35B]' : 'text-faint')}>{DOW[d.dow]}</em>{d.n}
          </th>
        ))}
        {/* Pinned, like the name: a 31-day month is wider than a laptop, and
            these two are what the screen is opened for. */}
        <th className="sticky right-[118px] z-[1] w-10 border-b border-line bg-surface pr-2 text-right font-tight text-[10px] font-semibold text-mute">Days</th>
        <th className="sticky right-0 z-[1] w-[118px] border-b border-l border-line border-l-sep bg-surface pr-3.5 text-right font-tight text-[10px] font-semibold text-mute">{last}</th>
      </tr>
    </thead>
  );

  const daysCell = (emp) => {
    const c = markCounts(att.attendance[emp.id], win.from, win.to);
    return (
      <td className="sticky right-[118px] z-[1] border-b border-sep bg-surface pr-2 text-right font-tight text-[13px] font-semibold tabular-nums">
        {isDayRate(emp.pay_type) ? daysText(c.worked) : c.present}
      </td>
    );
  };

  const nameCell = (emp, extra) => (
    <td className="w-[156px] border-b border-sep py-[9px] pl-3.5 pr-2.5 text-left align-top">
      <b className="block truncate font-tight text-[13px] font-semibold">{emp.name}</b>
      {extra}
    </td>
  );

  // Footer sums the rows shown -- the server's figures for each.
  const drLines = dayRate.map((e) => lines.get(String(e.id))).filter(Boolean);
  const drEarned = drLines.reduce((t, l) => t + Number(l.basePay || 0), 0);
  const drPaid = drLines.reduce((t, l) => t + Number(l.alreadyPaid || 0), 0);
  const drDue = drLines.reduce((t, l) => t + Number(l.netPay || 0), 0);

  return (
    <div className="m-rise" style={{ '--i': 2 }}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <MonthStep label={monthWords(month)} onPrev={onPrevMonth} onNext={onNextMonth} />
        <div className="flex flex-wrap items-center gap-3.5 font-tight text-[12px] font-semibold text-ink-2">
          {['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'SICK'].map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <i className={cn('inline-grid h-[18px] w-[18px] place-items-center rounded-[5px] text-[10px] not-italic font-bold', MARK[k].cell)}>{MARK[k].icon}</i>{MARK[k].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-4 w-4 rounded-[4px] bg-[#EFF8F2] shadow-[inset_0_0_0_1px_#BFE5CB]" />Already paid</span>
          <span className="font-sans font-medium text-mute">Click a day to mark it, clear it, or set that day’s rate</span>
          {att.loading && <span className="font-sans font-medium text-mute animate-pulse">Loading…</span>}
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={onAddEmployee}><UserPlus /> Add employee</Button>
      </div>

      {showBar && (
        <div data-testid="att-save-bar" className={cn('mb-3.5 flex flex-wrap items-center gap-3 rounded-xl py-2.5 pr-3 pl-4 text-[13px]',
          !problem ? 'bg-amber-soft' : problem.maySaved ? 'items-start bg-[#FFF7E8] shadow-[inset_0_0_0_1px_#F6D9A8]' : problem.kind === 'NOTICE' ? 'bg-tile' : 'bg-bad-soft')}>
          <div className="min-w-0">
            {problem ? (
              <>
                <b className={cn('font-tight font-semibold', problem.maySaved ? 'text-amber-text' : problem.kind === 'NOTICE' ? 'text-ink' : 'text-bad-text')}>
                  {problem.maySaved ? 'Attendance save may not have finished' : problem.title}
                </b>
                {problem.maySaved && <span className="sr-only">{problem.title}</span>}
                {problem.detail && <span className="ml-1.5 text-body">{problem.detail}</span>}
                {problem.maySaved && (
                  <p data-testid="att-unconfirmed-note" className="mt-[3px] max-w-[640px] text-[12.5px] text-amber-text">
                    The connection dropped before the server answered, so this may already be saved. Check what the server has, or save again — re-saving the same days changes nothing.
                  </p>
                )}
              </>
            ) : (
              <>
                <b className="font-tight font-semibold text-amber-text">{att.pendingCount} unsaved {att.pendingCount === 1 ? 'change' : 'changes'}</b>
                <span className="ml-1.5 text-body">Pay figures below show saved marks and update when you save. Nothing is written until you save.</span>
              </>
            )}
          </div>
          <div className="flex-1" />
          {problem?.maySaved ? (
            <Button data-testid="att-check-server" variant="outline" size="sm" onClick={att.reload} disabled={att.saving || att.loading}>
              {att.loading ? 'Checking…' : 'Check the server'}
            </Button>
          ) : att.pendingCount > 0 && (
            <Button data-testid="att-discard" variant="outline" size="sm" onClick={() => { att.discard(); setPick(null); }} disabled={att.saving}>Discard</Button>
          )}
          {att.pendingCount > 0 && (
            <Button data-testid="att-save" variant="dark" size="sm" onClick={async () => { await att.save(); setPick(null); }} disabled={att.saving}>
              {att.saving ? 'Saving…' : problem?.maySaved ? `Save again ${att.pendingCount}` : `Save ${att.pendingCount}`}
            </Button>
          )}
          {att.applyNote && <span className="w-full text-[12px] font-semibold text-good-text">{att.applyNote.text}</span>}
        </div>
      )}

      {figuresFailed && (
        <p role="alert" className="mb-3 rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad-text">Pay figures could not be loaded, so Still due is not shown. Marks can still be made and saved.</p>
      )}

      {dayRate.length > 0 && (
        <div className="mb-3.5 overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-sep px-3.5 py-[11px]">
            <b className="font-tight text-[13.5px] font-semibold">Day-rate staff</b>
            <Pill tone="warn" small>Attendance tracked</Pill>
            <Hint className="ml-auto">Paid for days marked. Leave and sick are unpaid. Half day pays half.</Hint>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 156 + days.length * 30 + 158 }}>
              {renderHead('Still due')}
              <tbody>
                {dayRate.map((emp) => {
                  const l = lines.get(String(emp.id));
                  return (
                    <tr key={emp.id}>
                      {nameCell(emp, (
                        <>
                          <small className="block text-[11.5px] text-mute">{inr(emp.daily_rate)}/day</small>
                          <div className="mt-1.5 flex gap-1">
                            <input type="number" inputMode="decimal" aria-label={`Rate for ${emp.name}`}
                              className="h-6 w-[52px] rounded-[7px] px-[7px] font-tight text-[11.5px] tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-ink)]"
                              placeholder={String(emp.daily_rate || 0)} value={rateDraft[emp.id] ?? ''}
                              onChange={(e) => setRateDraft((p) => ({ ...p, [emp.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') att.applyRate(emp.id, rateDraft[emp.id] || emp.daily_rate); }} />
                            <button type="button" title="Apply this rate to every day marked Present this month that has no rate yet"
                              onClick={() => att.applyRate(emp.id, rateDraft[emp.id] || emp.daily_rate)}
                              className="m-press h-6 rounded-[7px] px-[7px] font-tight text-[11.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">Apply</button>
                          </div>
                          {att.applyNote?.empId === emp.id && <span className="mt-1 block font-tight text-[10.5px] font-semibold text-good-text">{att.applyNote.text}</span>}
                        </>
                      ))}
                      {days.map((d) => cell(emp, d))}
                      {daysCell(emp)}
                      <td className="sticky right-0 z-[1] border-b border-l border-sep bg-surface py-2 pr-3.5 pl-2 text-right tabular-nums">
                        {l ? (
                          <>
                            <b className="block font-tight text-[13.5px] font-semibold text-good-text">{inr(l.netPay)}</b>
                            <small className="block whitespace-nowrap text-[10.5px] leading-[1.3] text-mute">{inr(l.basePay)} earned</small>
                            {Number(l.alreadyPaid) > 0 && <small className="block whitespace-nowrap text-[10.5px] leading-[1.3] text-good-text">{inr(l.alreadyPaid)} paid</small>}
                          </>
                        ) : <span className="text-faint">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={days.length + 1} className="bg-ink px-3.5 py-[11px] text-left text-white">
                    <b className="font-tight text-[13px] font-semibold">Still to pay this month</b>
                    <small className="mt-0.5 block text-[11.5px] text-white/60">
                      {drLines.length ? `${inr(drEarned)} earned · ${inr(drPaid)} already paid` : 'figures not loaded'}
                    </small>
                  </td>
                  <td colSpan={2} className="bg-ink px-3.5 py-[11px] text-right font-tight text-[16px] font-semibold tabular-nums text-white">{drLines.length ? inr(drDue) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {salaried.length > 0 && (
        <div className="mb-3.5 overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-sep px-3.5 py-[11px]">
            <b className="font-tight text-[13.5px] font-semibold">Salaried staff</b>
            <Hint className="ml-auto">Full pay unless a day is marked Absent. Leave and sick are paid.</Hint>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 156 + days.length * 30 + 158 }}>
              {renderHead('Salary')}
              <tbody>
                {salaried.map((emp) => {
                  const l = lines.get(String(emp.id));
                  const weekly = String(emp.pay_type).toUpperCase() === 'WEEKLY';
                  let note = null;
                  if (l) {
                    if (Number(l.lopDays) > 0) note = <small className="block whitespace-nowrap text-[10.5px] text-amber-text">{daysText(l.lopDays)} {Number(l.lopDays) === 1 ? 'day' : 'days'} loss of pay</small>;
                    else {
                      const bits = [];
                      if (Number(l.leaveAllowed) > 0 && Number(l.leaveUsed) > 0) bits.push(`${l.leaveUsed} of ${l.leaveAllowed} leave`);
                      else if (Number(l.leaveDays) > 0) bits.push(`${l.leaveDays} leave`);
                      if (Number(l.sickDays) > 0) bits.push(`${l.sickDays} sick`);
                      note = <small className={cn('block whitespace-nowrap text-[10.5px]', l.leaveExceeded ? 'text-amber-text' : 'text-mute')}>{bits.length ? bits.join(' · ') : 'Full pay'}{l.leaveExceeded ? ' · over allowance' : ''}</small>;
                    }
                  }
                  return (
                    <tr key={emp.id}>
                      {nameCell(emp, <small className="block text-[11.5px] text-mute">{[emp.department, weekly ? 'Weekly' : 'Monthly'].filter(Boolean).join(' · ')}</small>)}
                      {days.map((d) => cell(emp, d))}
                      {daysCell(emp)}
                      <td className="sticky right-0 z-[1] border-b border-l border-sep bg-surface pr-3.5 pl-2 text-right tabular-nums">
                        <b className="block whitespace-nowrap font-tight text-[13px] font-semibold">{inr(emp.salary)} a {weekly ? 'week' : 'month'}</b>
                        {note}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {active.length === 0 && (
        <p className="py-16 text-center text-[13.5px] text-body">No active employees. Add employees first.</p>
      )}

      {active.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-3.5">
          <Hint className="text-[12.5px]">
            {att.pendingCount > 0
              ? `Save the ${att.pendingCount} attendance ${att.pendingCount === 1 ? 'change' : 'changes'} first: unsaved marks are never paid.`
              : [onLeave.length ? `${onLeave.map((e) => e.name).join(', ')} ${onLeave.length === 1 ? 'is' : 'are'} on leave and not shown.` : null,
                 `Pays everyone still owed for ${monthWords(month).split(' ')[0]}.`].filter(Boolean).join(' ')}
          </Hint>
          <Button size="lg" onClick={onRunPayroll} disabled={att.pendingCount > 0}>Process {monthWords(month).split(' ')[0]} payroll</Button>
        </div>
      )}

      {pick && rect && createPortal((() => {
        const entry = att.attendance[pick.emp.id]?.[pick.day];
        const st = markOf(entry?.status) ? (String(entry.status).toUpperCase() === 'OT' ? 'PRESENT' : String(entry.status).toUpperCase()) : null;
        const W = 184;
        const H = st ? 300 : 210;
        const flipUp = rect.bottom + H > window.innerHeight - 8;
        const left = Math.min(Math.max(8, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 8);
        const top = flipUp ? Math.max(8, rect.top - H - 6) : rect.bottom + 6;
        const dr = isDayRate(pick.emp.pay_type);
        const [, mm, dd] = pick.day.split('-').map(Number);
        return (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setPick(null)} />
            <div role="dialog" aria-label={`${dayWords(pick.day, { year: false })}, ${pick.emp.name}`}
              className="m-dialog fixed z-[100] rounded-[14px] bg-surface p-2 text-left shadow-[0_0_0_1px_rgba(17,20,24,0.06),0_18px_40px_-14px_rgba(17,20,24,0.4)]"
              style={{ left, top, width: W }}>
              <div className="px-1.5 pt-0.5 pb-1.5 font-tight text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
                {DOW[new Date(Date.UTC(y, mm - 1, dd)).getUTCDay()]} {dd} {dayWords(pick.day, { year: false }).split(' ')[1]} · {String(pick.emp.name || '').split(' ')[0]}
              </div>
              {MARK_ORDER.map((k) => (
                <button key={k} type="button"
                  onClick={() => { att.setStatus(pick.emp.id, pick.day, k); setPick(null); }}
                  className={cn('flex w-full items-center gap-[9px] rounded-pill px-2 py-[7px] font-tight text-[13px] font-semibold', st === k ? 'bg-ink text-white' : 'text-ink hover:bg-tile')}>
                  <i className={cn('inline-grid h-5 w-5 place-items-center rounded-[6px] text-[10.5px] not-italic font-bold', MARK[k].cell)}>{MARK[k].icon}</i>{MARK[k].label}
                </button>
              ))}
              {st && (
                <>
                  <hr className="mx-0.5 my-1.5 border-sep" />
                  {dr && (
                    <>
                      <span className="mx-1.5 mt-1 mb-[5px] block text-[11px] font-medium text-ink-2">Rate for this day</span>
                      <input type="number" autoFocus inputMode="decimal"
                        className="mx-0.5 h-[34px] w-[calc(100%-4px)] rounded-[10px] px-3 text-[13px] tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-amber)]"
                        placeholder={`₹${pick.emp.daily_rate || 0} default`} value={entry?.custom_rate ?? ''}
                        onChange={(e) => att.setRate(pick.emp.id, pick.day, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setPick(null); }} />
                      <span className="mx-1.5 mt-1 block text-[12px] text-mute">{inr(pick.emp.daily_rate)} is the usual rate</span>
                    </>
                  )}
                  <button type="button" onClick={() => { att.clear(pick.emp.id, pick.day); setPick(null); }}
                    className="mt-1 flex w-full rounded-pill px-2 py-[7px] text-left text-[13px] font-medium text-bad-text hover:bg-bad-soft">Clear this day</button>
                </>
              )}
            </div>
          </>
        );
      })(), document.body)}
    </div>
  );
}
