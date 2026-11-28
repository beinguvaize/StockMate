import React, { useEffect, useMemo, useRef, useState } from 'react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Seg } from '../documents/DocParts';
import { Skeleton } from '../ui/States';
import { cn } from '../../lib/utils';
import { usePayRunPreview } from '../../hooks/usePayRunPreview';
import { fetchPayRun, cleanAdjustments } from '../../lib/payRunClient';
import { payRun, payFailureText, chosenLines, needsConfirming } from '../../lib/payrollCommit';
import { useAdvancesAvailable } from '../../hooks/useStaffAdvances';
import { advanceOptions, APP_UPDATE_TEXT, detectAdvances } from '../../lib/staffAdvances';
import { supabase } from '../../lib/supabase';
import {
  runWindow, windowProblem, rangeWords, monthWords, daysInclusive, mondayOf, periodWords,
  runLineNote, isDayRateType, PAY_METHODS, methodLabel, daysText, shopDay, dayWords,
} from '../../lib/payrollView';
import { inr } from './parts';

/**
 * Run payroll (approved mockups 10, 11, 12): monthly, weekly or any custom
 * dates, with "Paid by" for every kind of run.
 *
 * Every figure is the payroll-run server function's -- the phone's
 * calculation. Typed overtime, commission, bonus and deductions are sent to
 * it and it hands back each line's net; the browser only shows those and adds
 * up the rows on screen. Confirm costs the run once more and saves exactly
 * what came back, with one run id per set of dates so a second press after a
 * lost reply cannot pay twice.
 *
 * Tick boxes (10, 11, 12): only the ticked people are paid; the totals and the
 * button follow the selection, and "these dates were already paid" is asked
 * only about the ticked people the server says need it.
 *
 * Staff advances, on a database that has them: each line shows the server's
 * planned recovery (advancePlanned) and what is still owed; "Skip this run"
 * and "Take all" per person go to the server and with the save (p_options).
 * netPay is sent as earned; the server takes the recovery as it saves.
 */
const MODES = [['MONTHLY', 'Monthly'], ['WEEKLY', 'Weekly'], ['CUSTOM', 'Custom']];
const ADJ = [['overtime', 'Overtime / extra'], ['commission', 'Commission'], ['bonus', 'Bonus'], ['deductions', 'Deductions']];
const selCls = 'h-9 min-w-[150px] rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]';

export default function RunPayrollDialog({ open, onClose, tenantId, initial, today, pendingAttendance = 0, accountFor, processPayroll, onSaved }) {
  const [mode, setMode] = useState('MONTHLY');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [method, setMethod] = useState('CASH');
  const [include, setInclude] = useState([]);
  const [adjust, setAdjust] = useState({});     // { empId: { bonus: '500' } } as typed
  const [ackFor, setAckFor] = useState(null);
  const [unticked, setUnticked] = useState([]);  // ids left out of this payout
  const [skipAdv, setSkipAdv] = useState([]);    // advances: take nothing back this run
  const [allAdv, setAllAdv] = useState([]);      // advances: take everything owed
  const advancesOn = useAdvancesAvailable() === true;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);         // { tone, text }
  const runId = useRef(null);
  const reopenedBy = initial?.reason || null;

  // Opening sets the dates (Re-run opens on the run being corrected).
  useEffect(() => {
    if (!open) return;
    setMode(initial?.mode || 'MONTHLY');
    if (initial?.month) setMonth(initial.month);
    if (initial?.weekStart) setWeekStart(initial.weekStart);
    if (initial?.from) setFrom(initial.from);
    if (initial?.to) setTo(initial.to);
    setInclude([]);
    setUnticked([]);
    setSkipAdv([]);
    setAllAdv([]);
    setMsg(null);
    setSaving(false);
    // A fresh id per opening: the same id twice is how the server knows a
    // retry from a second, deliberate run.
    runId.current = crypto.randomUUID();
  }, [open, initial]);

  const win = runWindow({ mode, month, weekStart, from, to });
  const problem = windowProblem(win);
  const winKey = win ? `${win.from}/${win.to}` : '';

  // A different set of dates is a different payout: typed amounts and the
  // "pay again" tick do not carry over, and the run gets a new id.
  useEffect(() => {
    setAdjust({});
    setAckFor(null);
    setUnticked([]);
    setSkipAdv([]);
    setAllAdv([]);
    setMsg(null);
    runId.current = crypto.randomUUID();
  }, [winKey]);

  const adjustments = useMemo(() => cleanAdjustments(adjust), [adjust]);
  const skipSent = advancesOn ? skipAdv : [];
  const allSent = advancesOn ? allAdv : [];
  const preview = usePayRunPreview({
    tenantId, from: win?.from, to: win?.to, includeOnLeave: include, adjustments,
    skipAdvance: skipSent, recoverAll: allSent,
    enabled: open && !problem, debounceMs: 300,
  });
  const data = preview.data;
  const items = data?.run?.items || [];
  const held = data?.run?.held || [];
  // The ticked lines. Every figure below the table is theirs alone; the
  // browser only adds up the server's lines.
  const ticked = useMemo(() => items.filter((i) => !unticked.includes(String(i.employeeId))).map((i) => String(i.employeeId)), [items, unticked]);
  const chosen = useMemo(() => chosenLines(data, ticked), [data, ticked]);
  const sum = (k) => chosen.reduce((t, i) => t + Number(i[k] || 0), 0);
  const total = sum('netPay');
  const allTotal = Number(data?.run?.totalNet || 0);
  const recovered = advancesOn ? sum('advancePlanned') : 0;
  const cash = total - recovered;
  const alreadyPaid = sum('alreadyPaid');
  const statutory = sum('statutoryTotal');
  const extras = sum('overtime') + sum('commission') + sum('bonus');
  const typedDed = sum('deductions');
  const acked = ackFor === winKey;
  const mustAck = !!data && needsConfirming(data, chosen);
  const untickedLines = items.filter((i) => unticked.includes(String(i.employeeId)));
  const allTicked = items.length > 0 && untickedLines.length === 0;
  const toggle = (id) => setUnticked((u) => (u.includes(String(id)) ? u.filter((x) => x !== String(id)) : [...u, String(id)]));
  const toggleAll = () => setUnticked(allTicked ? items.map((i) => String(i.employeeId)) : []);
  const flip = (setter, other) => (id) => {
    const k = String(id);
    setter((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
    other((xs) => xs.filter((x) => x !== k));
  };
  const toggleSkip = flip(setSkipAdv, setAllAdv);
  const toggleAllAdv = flip(setAllAdv, setSkipAdv);
  const zeroRate = items.filter((i) => isDayRateType(i.payType) && !(Number(i.dailyRate) > 0) && Number(i.daysWorked) > 0).map((i) => i.employeeName);
  const switchedIn = items.filter((i) => i.onLeave);
  const account = accountFor?.(method) || `${methodLabel(method)} account`;

  const kindWords = mode === 'MONTHLY' ? 'whole month' : mode === 'WEEKLY' ? 'Monday to Sunday' : 'custom dates';
  const periodLabel = !win ? '—' : mode === 'MONTHLY' ? monthWords(month) : rangeWords(win.from, win.to);

  const setAdj = (id, k, v) => setAdjust((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));

  const confirm = async () => {
    if (saving || !data || problem || pendingAttendance > 0) return;
    setSaving(true);
    setMsg(null);
    const withAdvances = await detectAdvances(supabase);
    const out = await payRun({
      cost: () => fetchPayRun({ tenantId, from: win.from, to: win.to, includeOnLeave: include, adjustments, skipAdvance: skipSent, recoverAll: allSent }),
      save: processPayroll, runId: runId.current, method, shownTotal: total, acknowledged: acked,
      selected: ticked,
      options: withAdvances ? advanceOptions({ skip: skipSent, recoverAll: allSent }) : null,
    });
    setSaving(false);
    if (out.status === 'saved') { onSaved?.(out.result, out.data, method); onClose(); return; }
    if (out.status === 'nothing') { setMsg({ tone: 'info', text: 'Nothing is owed for these dates.' }); preview.reload(); return; }
    if (out.status === 'changed') {
      preview.reload();
      const now = chosenLines(out.data, ticked).reduce((t, i) => t + Number(i.netPay || 0), 0);
      setMsg({ tone: 'warn', text: `The total for the ticked staff is now ${inr(now)}: attendance or a payment changed since this opened. Check the lines and confirm again.` });
      return;
    }
    if (out.status === 'confirm') { setMsg({ tone: 'warn', text: 'These dates have already been paid. Tick the box above to pay them again.' }); return; }
    if (out.status === 'update-required') { setMsg({ tone: 'bad', text: APP_UPDATE_TEXT }); detectAdvances(supabase, { force: true }); return; }
    if (out.status === 'cost-failed') { setMsg({ tone: 'bad', text: `Nothing was paid: the pay figures could not be worked out. ${out.error?.message || ''}` }); return; }
    setMsg({ tone: out.failure.maySaved ? 'warn' : 'bad', text: payFailureText(out.failure, { again: 'Press Confirm again' }) });
  };

  const th = 'bg-tile px-2.5 py-[9px] font-tight text-[11.5px] font-semibold text-mute whitespace-nowrap';
  const td = 'border-b border-sep px-2.5 py-2.5 align-top text-[13px]';
  const blocked = pendingAttendance > 0;

  return (
    <Dialog open={open} onClose={saving ? () => {} : onClose} width={1150} title="Run payroll" className="!pb-0"
      subtitle={`Each person paid gets one salary expense, so DayBook, the P&L and ${account} move with it.`}>
      <div className="-mx-[22px] -mb-4 border-t border-sep">
        <div className="flex flex-wrap items-end gap-2.5 border-b border-sep px-[22px] py-3.5">
          <Seg value={mode} onChange={setMode} options={MODES} ariaLabel="Kind of run" className="mb-0.5 [&>button]:px-[15px] [&>button]:py-[7px] [&>button]:text-[13px]" />
          {mode === 'MONTHLY' && (
            <label className="flex flex-col"><span className="mb-1 text-[11px] text-mute">Month</span>
              <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="min-w-[150px]" /></label>
          )}
          {mode === 'WEEKLY' && (
            <label className="flex flex-col"><span className="mb-1 text-[11px] text-mute">Week starting (Mon)</span>
              <Input type="date" value={weekStart} onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))} className="min-w-[150px]" /></label>
          )}
          {mode === 'CUSTOM' && (
            <>
              <label className="flex flex-col"><span className="mb-1 text-[11px] text-mute">From</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-[150px]" /></label>
              <label className="flex flex-col"><span className="mb-1 text-[11px] text-mute">To</span>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={cn('min-w-[150px]', problem && 'shadow-[inset_0_0_0_2px_var(--color-bad)]')} /></label>
            </>
          )}
          <label className="flex flex-col"><span className="mb-1 text-[11px] text-mute">Paid by</span>
            <select className={selCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="flex-1" />
          <span className="max-w-[250px] text-[12px] text-mute">
            {reopenedBy === 'rerun' ? 'Opened by Re-run, on the same dates as the run reversed.'
              : mode === 'CUSTOM' ? 'Any length, even one day: for wages paid every two or three days.'
              : `Changing the ${mode === 'WEEKLY' ? 'week' : 'month'} clears overtime, commission, bonus and deductions typed here.`}
          </span>
        </div>

        {blocked && (
          <p role="alert" className="mx-[22px] mt-3 rounded-xl bg-amber-soft px-3.5 py-2.5 text-[13px] text-amber-text">
            {pendingAttendance} attendance {pendingAttendance === 1 ? 'change is' : 'changes are'} not saved. Save them on the Attendance tab first: unsaved marks are never paid.
          </p>
        )}

        <div className="grid grid-cols-2 border-b border-sep md:grid-cols-4">
          {[
            ['Period', periodLabel, win ? `${daysInclusive(win.from, win.to)} ${daysInclusive(win.from, win.to) === 1 ? 'day' : 'days'} · ${kindWords}` : null],
            ['Ticked to pay', data ? `${chosen.length} of ${items.length}` : '—', untickedLines.length ? `${untickedLines.map((h) => h.employeeName).join(', ')} left unticked` : held.length ? `${held.map((h) => h.employeeName).join(', ')} on leave, left out` : switchedIn.length ? `${switchedIn.map((h) => h.employeeName).join(', ')} switched in` : null],
            ['Already paid', data ? <span className={alreadyPaid > 0 ? 'text-good-text' : ''}>{inr(alreadyPaid)}</span> : '—', data ? (alreadyPaid > 0 ? 'earlier runs, taken off below' : 'nothing paid for these days yet') : null],
            ['To pay', data ? inr(cash) : '—', recovered > 0 ? `${inr(total)} earned − ${inr(recovered)} advance taken back` : untickedLines.length ? `${inr(allTotal - total)} stays still to pay` : 'one salary expense each'],
          ].map(([k, v, s], i) => (
            <div key={k} className={cn('px-[22px] py-3', i > 0 && 'md:border-l border-sep')}>
              <span className="block font-tight text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">{k}</span>
              <b className="mt-1 block font-tight text-[19px] font-semibold leading-[1.2] tracking-[-0.01em] tabular-nums">{v}</b>
              {s && <small className="text-[12px] text-body">{s}</small>}
            </div>
          ))}
        </div>

        <div className="max-h-[42vh] overflow-auto">
          {problem ? (
            <p className="px-[22px] py-8 text-center text-[13.5px] text-bad-text">{problem}</p>
          ) : preview.error && !data ? (
            <div className="px-[22px] py-8 text-center text-[13.5px] text-bad-text">
              The pay figures could not be worked out: {preview.error.message}{' '}
              <button type="button" onClick={preview.reload} className="font-tight font-semibold underline">Try again</button>
            </div>
          ) : !data ? (
            <div className="space-y-2 px-[22px] py-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-[1]">
                <tr>
                  <th className={cn(th, 'w-[44px] pl-[22px] text-left')}>
                    <input type="checkbox" aria-label="Tick everyone" checked={allTicked} disabled={!items.length}
                      ref={(el) => { if (el) el.indeterminate = !allTicked && chosen.length > 0; }}
                      onChange={toggleAll} className="h-4 w-4 accent-[var(--color-ink)]" />
                  </th>
                  <th className={cn(th, 'text-left')}>Employee</th>
                  <th className={cn(th, 'text-right')}>Days</th>
                  <th className={cn(th, 'text-right')}>Base pay</th>
                  {ADJ.map(([k, l]) => <th key={k} className={cn(th, 'text-right')}>{l}</th>)}
                  <th className={cn(th, 'text-right')}>PF, ESI, tax</th>
                  <th className={cn(th, 'pr-[22px] text-right')}>Net pay</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && held.length === 0 && (
                  <tr><td colSpan={10} className="px-[22px] py-8 text-center text-[13.5px] text-body">No active staff to pay.</td></tr>
                )}
                {items.map((i) => {
                  const dr = isDayRateType(i.payType);
                  const id = String(i.employeeId);
                  const on = !unticked.includes(id);
                  const owed = advancesOn ? Number(i.advanceOutstanding || 0) : 0;
                  const plan = advancesOn ? Number(i.advancePlanned || 0) : 0;
                  return (
                    <tr key={i.employeeId} className={cn(!on && '[&>td]:bg-[#FBFBFA] [&>td]:text-mute')}>
                      <td className={cn(td, 'pl-[22px]')}>
                        <input type="checkbox" aria-label={`Pay ${i.employeeName}`} checked={on} onChange={() => toggle(id)} className="mt-0.5 h-4 w-4 accent-[var(--color-ink)]" />
                      </td>
                      <td className={td}>
                        <b className="block font-tight text-[13.5px] font-semibold">{i.employeeName}</b>
                        <small className="mt-0.5 block text-[11.5px] text-mute">{[i.department, runLineNote(i)].filter(Boolean).join(' · ')}</small>
                        {i.leaveExceeded && <small className="block text-[11.5px] font-medium text-amber-text">Leave {i.leaveUsed} of {i.leaveAllowed} this month · over the allowance, pay not cut</small>}
                        {i.onLeave && (
                          <button type="button" onClick={() => setInclude((ids) => ids.filter((x) => x !== i.employeeId))}
                            className="mt-0.5 block text-[11.5px] font-semibold text-info-text hover:underline">On leave · take out of run</button>
                        )}
                        {i.needsConfirmation && on && <small className="block text-[11.5px] font-medium text-amber-text">Already paid for some of these days</small>}
                        {owed > 0 && (
                          <small className="mt-0.5 block text-[11.5px] text-body">
                            Advance {inr(owed)} owed · {skipAdv.includes(id) ? 'nothing taken back this run' : `takes back ${inr(plan)}`}
                            <button type="button" onClick={() => toggleSkip(id)} aria-pressed={skipAdv.includes(id)} className="ml-2 font-semibold text-ink-2 underline decoration-faint underline-offset-2 hover:decoration-ink">{skipAdv.includes(id) ? 'Take back as planned' : 'Skip this run'}</button>
                            <button type="button" onClick={() => toggleAllAdv(id)} aria-pressed={allAdv.includes(id)} className="ml-2 font-semibold text-ink-2 underline decoration-faint underline-offset-2 hover:decoration-ink">{allAdv.includes(id) ? 'Usual amount' : 'Take all'}</button>
                          </small>
                        )}
                      </td>
                      <td className={cn(td, 'text-right')}>
                        {dr ? <span className="font-tight text-[13.5px] font-semibold tabular-nums">{daysText(i.daysWorked)}</span>
                          : Number(i.lopDays) > 0 ? <span className="font-tight text-[12px] font-semibold text-amber-text">−{daysText(i.lopDays)}d LOP</span>
                          : <span className="text-[12px] italic text-mute">Fixed</span>}
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <span className="font-tight text-[13.5px] font-semibold tabular-nums">{inr(i.basePay)}</span>
                        {Number(i.alreadyPaid) > 0 && <small className="mt-0.5 block whitespace-nowrap text-[11.5px] font-semibold text-good-text">−{inr(i.alreadyPaid)} already paid</small>}
                      </td>
                      {ADJ.map(([k]) => {
                        const v = adjust[i.employeeId]?.[k] ?? '';
                        return (
                          <td key={k} className={cn(td, 'text-right')}>
                            <input type="number" min="0" inputMode="decimal" aria-label={`${k} for ${i.employeeName}`} value={v} placeholder="0"
                              onChange={(e) => setAdj(i.employeeId, k, e.target.value)}
                              className={cn('h-8 w-[86px] rounded-[9px] bg-surface px-[9px] text-right font-tight text-[13px] tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_2px_var(--color-amber)]',
                                k === 'deductions' ? 'text-bad-text' : k === 'commission' ? 'text-good-text' : 'text-ink')} />
                          </td>
                        );
                      })}
                      <td className={cn(td, 'text-right tabular-nums')}>
                        {Number(i.statutoryTotal) > 0
                          ? <span className="font-tight font-semibold text-bad-text" title={(i.statutoryLines || []).map((s) => `${s.label} ${inr(s.amount)}`).join(' · ')}>−{inr(i.statutoryTotal)}</span>
                          : <span className="text-faint">—</span>}
                      </td>
                      <td className={cn(td, 'pr-[22px] text-right font-tight text-[15px] font-semibold tabular-nums')}>
                        {inr(i.netPay)}
                        {!on && <small className="block text-right font-sans text-[11.5px] font-medium text-amber-text">still to pay</small>}
                        {on && plan > 0 && <small className="block whitespace-nowrap text-right font-sans text-[11.5px] font-medium text-body">−{inr(plan)} advance · {inr(Number(i.netPay) - plan)} paid</small>}
                      </td>
                    </tr>
                  );
                })}
                {held.map((h) => (
                  <tr key={h.employeeId} className="[&>td]:bg-[#FBFBFA] text-mute">
                    <td className={cn(td, 'pl-[22px]')} />
                    <td className={td}>
                      <b className="block font-tight text-[13.5px] font-semibold text-mute">{h.employeeName}</b>
                      <small className="mt-0.5 block text-[11.5px]">{[h.department, 'On leave'].filter(Boolean).join(' · ')}</small>
                    </td>
                    <td colSpan={7} className={td}>Not in this run · would add {inr(h.netPay)}</td>
                    <td className={cn(td, 'pr-[22px] text-right')}>
                      <button type="button" onClick={() => setInclude((ids) => [...ids, h.employeeId])}
                        className="font-tight text-[13px] font-semibold text-amber-text hover:underline">Pay anyway</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.alreadyPaidRuns.length > 0 && (
          <div className={cn('mx-[22px] mt-3 rounded-xl px-3.5 py-[11px] text-[12.5px] text-ink-2', mustAck ? 'bg-[#FFF7E8] shadow-[inset_0_0_0_1px_#F6D9A8]' : 'bg-tile')}>
            <b className={cn('mb-[3px] block font-tight text-[13px] font-semibold', mustAck ? 'text-amber-text' : 'text-ink')}>
              {mustAck ? 'These dates have already been paid' : 'Already paid this period — netted off the amounts below'}
            </b>
            <ul className="list-disc pl-4">
              {data.alreadyPaidRuns.map((r) => (
                <li key={r.id}>{periodWords(r.period)} — {inr(r.total_net)}{r.processed_at ? `, processed ${dayWords(shopDay(r.processed_at), { year: false })}` : ''}</li>
              ))}
            </ul>
            {mustAck && (
              <>
                <span className="mt-1 block">Paying again adds a second set of salary expenses for the same days.</span>
                <label className="mt-2 flex cursor-pointer items-center gap-2 font-semibold">
                  <input type="checkbox" checked={acked} onChange={(e) => setAckFor(e.target.checked ? winKey : null)} className="h-4 w-4 accent-[var(--color-ink)]" />
                  Pay these dates again anyway
                </label>
              </>
            )}
          </div>
        )}

        {zeroRate.length > 0 && (
          <p className="mx-[22px] mt-3 rounded-xl bg-amber-soft px-3.5 py-2.5 text-[12.5px] text-amber-text">
            No daily rate set for {zeroRate.join(', ')} — those days pay ₹0.
          </p>
        )}
        {msg && (
          <p role="alert" className={cn('mx-[22px] mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] break-words', msg.tone === 'bad' ? 'bg-bad-soft text-bad-text' : msg.tone === 'warn' ? 'bg-amber-soft text-amber-text' : 'bg-tile text-ink-2')}>{msg.text}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-sep px-[22px] pt-3.5 pb-[18px]">
          <div>
            <span className="block font-tight text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">Total payout</span>
            <b className="mt-[3px] block font-tight text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">{data ? inr(cash) : '—'}</b>
          </div>
          <div className="text-[12px] tabular-nums text-body">
            {data && [
              `${inr(sum('basePay'))} earned`,
              extras > 0 ? `+ ${inr(extras)} extras` : null,
              typedDed + statutory > 0 ? `− ${inr(typedDed + statutory)} deductions` : null,
              alreadyPaid > 0 ? `− ${inr(alreadyPaid)} already paid` : null,
              recovered > 0 ? `− ${inr(recovered)} advance taken back` : null,
              untickedLines.length ? `· ${inr(allTotal - total)} for ${untickedLines.length} unticked stays still to pay` : null,
            ].filter(Boolean).join(' ')}
            {preview.loading && data && <span className="ml-2 text-mute">updating…</span>}
          </div>
          <div className="flex-1" />
          {mustAck && !acked && <span className="max-w-[220px] text-[12px] text-mute">Tick the box above to pay these dates again.</span>}
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="lg" onClick={confirm}
            disabled={saving || !data || !!problem || blocked || total <= 0 || (mustAck && !acked) || preview.loading}
            title={problem || (blocked ? 'Save attendance first' : total <= 0 ? 'Nothing to pay for this period' : undefined)}>
            {saving ? 'Processing…' : problem ? 'Check the dates' : !data ? 'Confirm and process · —'
              : untickedLines.length ? `Pay ${chosen.length} of ${items.length} · ${inr(cash)}` : `Confirm and process · ${inr(cash)}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
