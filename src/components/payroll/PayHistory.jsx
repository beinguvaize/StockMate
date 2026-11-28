import React, { useState } from 'react';
import { Receipt, ChevronDown, RotateCcw, Printer, Trash2, FileText, Plus, UserPlus } from 'lucide-react';
import PaySlip from './PaySlip';
import ConfirmDialog from './ConfirmDialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import {
  periodWords, runKindLabel, runKind, historyLine, historyTotals, paidLines, methodLabel,
  shopDay, dayWords, daysText, rangeWords,
} from '../../lib/payrollView';
import { parsePeriod } from '../../lib/payrollPeriods';
import { inr, Pill, Eyebrow, EmptyState } from './parts';

/**
 * Pay history (approved mockups 13, 14, 15, 18). Every run, newest first. A
 * run is never edited: Re-run reverses it and enters it again.
 *
 * Columns add up: base + extras − deductions (typed and PF / ESI / tax) −
 * paid earlier = net. The old view left the statutory deductions out, so a
 * line with PF did not reach its own net.
 *
 * Delete and Re-run keep today's write path (usePayroll.deletePayrollRecord:
 * two separate writes from the browser, expenses first).
 */
export default function PayHistory({ records = [], methods = {}, accountFor, accounts = [], employees = [], business, onRunPayroll, onAddEmployee, onDelete, onRerun }) {
  const [openId, setOpenId] = useState(null);
  const [slip, setSlip] = useState(null);
  const [del, setDel] = useState(null);
  const [rerun, setRerun] = useState(null);

  const accountWords = (r) => {
    const m = methods[r.id];
    if (!m) return 'the account it was paid from';
    return accountFor?.(m) ? `the ${accountFor(m)} account` : `the ${methodLabel(m)} account`;
  };

  if (records.length === 0) {
    return (
      <>
        <Tools onAddEmployee={onAddEmployee} onRunPayroll={onRunPayroll} />
        <EmptyState icon={Receipt} title="No pay history" text="Process a payroll run to see records here.">
          <Button onClick={onRunPayroll}><Plus /> Run payroll</Button>
        </EmptyState>
      </>
    );
  }

  return (
    <div className="m-rise" style={{ '--i': 2 }}>
      <Tools onAddEmployee={onAddEmployee} onRunPayroll={onRunPayroll} hint />
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex justify-between border-b border-sep px-[18px] py-[11px] font-tight text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
          <span>Pay runs</span><span>{records.length} record{records.length === 1 ? '' : 's'}</span>
        </div>
        {records.map((r) => {
          const open = openId === r.id;
          const items = r.items || [];
          const tot = historyTotals(items);
          const kind = runKindLabel(r.period);
          const m = methods[r.id];
          const anyEarlier = items.some((i) => Number(i.alreadyPaid) > 0);
          return (
            <div key={r.id}>
              <button type="button" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}
                className={cn('flex w-full items-center gap-3.5 border-b border-sep px-[18px] py-3.5 text-left transition-colors duration-(--dur-press)', open ? 'border-b-0 bg-tile' : 'hover:bg-tile')}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-tile text-body"><Receipt size={16} strokeWidth={1.9} /></span>
                <span className="min-w-0 flex-1">
                  <b className="inline-flex items-center gap-2 font-tight text-[14.5px] font-semibold">
                    {periodWords(r.period)}{kind && <Pill small tone={runKind(r.period) === 'MONTHLY' ? 'neutral' : 'info'}>{kind}</Pill>}
                  </b>
                  <small className="mt-0.5 block text-[12.5px] text-mute">
                    {r.processed_at ? `Processed ${dayWords(shopDay(r.processed_at))}` : 'Processed'} · {tot.paidCount} employee{tot.paidCount === 1 ? '' : 's'}
                  </small>
                </span>
                <span className="text-right">
                  <b className="block font-tight text-[16px] font-semibold tabular-nums">{inr(r.totalNet ?? r.total_net)}</b>
                  <small className="text-[11.5px] text-mute">Net paid</small>
                </span>
                <span className={cn('grid h-7 w-7 place-items-center rounded-full transition-transform', open ? 'rotate-180 bg-ink text-white' : 'text-mute shadow-[inset_0_0_0_1px_var(--color-line)]')}>
                  <ChevronDown size={13} />
                </span>
              </button>
              {open && (
                <div className="m-rise border-b border-sep bg-tile px-[18px] pb-4">
                  <div className="grid grid-cols-2 gap-2.5 pt-0.5 pb-3 md:grid-cols-4">
                    <Chip label="Base pay" value={inr(tot.base)} />
                    <Chip label="Extras" value={<span className="text-good-text">+{inr(tot.extras)}</span>} sub="overtime, commission, bonus" />
                    <Chip label="Deductions" value={<span className="text-bad-text">−{inr(tot.deductions + tot.paidEarlier)}</span>}
                      sub={[tot.statutory > 0 ? `${inr(tot.statutory)} PF, ESI, tax` : null, tot.paidEarlier > 0 ? `${inr(tot.paidEarlier)} paid earlier` : null].filter(Boolean).join(' · ') || 'typed in the run'} />
                    <Chip label="Net total" value={inr(tot.net)} sub={m ? `Paid by ${methodLabel(m)}${accountFor?.(m) ? ` · ${accountFor(m)}` : ''}` : 'Paid by: not recorded'} />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-line bg-surface">
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-sep px-3.5 py-[9px]">
                      <Eyebrow className="mr-auto">Staff breakdown</Eyebrow>
                      <Button variant="secondary" size="xs" onClick={() => setRerun(r)}><RotateCcw /> Re-run</Button>
                      <Button variant="secondary" size="xs" onClick={() => setSlip({ run: r, items })} disabled={!items.length}><Printer /> Print all {items.length} slip{items.length === 1 ? '' : 's'}</Button>
                      <Button variant="secondary" size="xs" className="text-bad-text" onClick={() => setDel(r)}><Trash2 /> Delete run</Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-[13px]">
                        <thead>
                          <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3.5 [&>th]:py-2 [&>th]:font-tight [&>th]:text-[11.5px] [&>th]:font-semibold [&>th]:text-mute">
                            <th className="text-left">Employee</th><th className="text-right">Base</th><th className="text-right">Extras</th>
                            <th className="text-right">Deductions</th>{anyEarlier && <th className="text-right">Paid earlier</th>}
                            <th className="text-right">Net pay</th><th className="w-[70px] text-right">Slip</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => {
                            const h = historyLine(it);
                            const days = Number(it.daysWorked);
                            return (
                              <tr key={it.employeeId} className="[&>td]:border-b [&>td]:border-sep [&>td]:px-3.5 [&>td]:py-2.5">
                                <td>
                                  <b className="block font-tight text-[13.5px] font-semibold">{it.employeeName}</b>
                                  <small className="text-[11.5px] text-mute">{[it.department, String(it.payType || '').toUpperCase() === 'DAILY' ? 'Daily' : String(it.payType || '').toUpperCase() === 'WEEKLY' ? 'Weekly' : 'Monthly', days > 0 && ['DAILY', 'HOURLY'].includes(String(it.payType || '').toUpperCase()) ? `${daysText(days)} days` : null].filter(Boolean).join(' · ')}</small>
                                </td>
                                <td className="text-right tabular-nums">{inr(h.base)}</td>
                                <td className="text-right tabular-nums text-good-text">+{inr(h.extras)}</td>
                                <td className="text-right tabular-nums text-bad-text" title={h.statutory > 0 ? `${inr(h.statutory)} PF, ESI, tax · ${inr(Number(it.deductions) || 0)} typed` : undefined}>−{inr(h.deductions)}</td>
                                {anyEarlier && <td className="text-right tabular-nums text-bad-text">{h.paidEarlier > 0 ? `−${inr(h.paidEarlier)}` : '—'}</td>}
                                <td className="text-right"><b className="font-tight font-semibold tabular-nums">{inr(h.net)}</b>
                                  {!h.agrees && <small className="block text-[11px] text-amber-text">paid more than earned; nil</small>}
                                </td>
                                <td className="text-right">
                                  <button type="button" onClick={() => setSlip({ run: r, items: [it] })} aria-label={`Salary slip for ${it.employeeName}`}
                                    className="m-press inline-grid h-[30px] w-[30px] place-items-center rounded-[9px] text-body shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile"><FileText size={14} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="font-tight text-[13px] font-semibold tabular-nums [&>td]:border-t [&>td]:border-line [&>td]:px-3.5 [&>td]:py-2.5">
                            <td>{tot.paidCount} paid</td><td className="text-right">{inr(tot.base)}</td><td className="text-right">+{inr(tot.extras)}</td>
                            <td className="text-right">−{inr(tot.deductions)}</td>{anyEarlier && <td className="text-right">−{inr(tot.paidEarlier)}</td>}
                            <td className="text-right">{inr(tot.net)}</td><td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} tone="danger"
        title={del ? `Delete the pay run for ${periodWords(del.period)}?` : ''}
        text={del ? `This also reverses ${inr(del.totalNet ?? del.total_net)} of salary expenses, so DayBook, the P&L and ${accountWords(del)} will all drop by that much.` : ''}
        bullets={del ? [
          `${paidLines(del.items).length} salary expense${paidLines(del.items).length === 1 ? '' : 's'} dated ${dayWords(parsePeriod(del.period)?.to || '', { year: false })} ${paidLines(del.items).length === 1 ? 'is' : 'are'} taken back`,
          `Those ${(() => { const p = parsePeriod(del.period); return p ? rangeWords(p.from, p.to, { year: false }) : ''; })()} days show as unpaid again on Attendance`,
          'Nothing is erased: the run stays in the record, marked deleted',
        ] : []}
        confirmLabel={del ? `Delete run · ${inr(del.totalNet ?? del.total_net)}` : 'Delete run'}
        onConfirm={async () => {
          const res = await onDelete(del);
          if (res && res.success === false) return res.message || res.error?.message || 'The pay run could not be deleted.';
          return null;
        }} />

      <ConfirmDialog open={!!rerun} onClose={() => setRerun(null)} tone="rerun"
        title={rerun ? `Re-run ${periodWords(rerun.period)}?` : ''}
        text={rerun ? `The existing run of ${inr(rerun.totalNet ?? rerun.total_net)} is reversed first, so DayBook, the P&L and ${accountWords(rerun)} drop by that much before you enter the corrected figures.` : ''}
        more={rerun ? `Nothing is deleted permanently — the old run stays in the record, marked deleted. Run payroll then opens on the same dates, ${(() => { const p = parsePeriod(rerun.period); return p ? rangeWords(p.from, p.to, { year: false }) : ''; })()}.` : ''}
        confirmLabel="Reverse and re-run"
        onConfirm={async () => {
          const res = await onRerun(rerun);
          if (res && res.success === false) return `That run could not be reversed, so nothing was changed. ${res.message || res.error?.message || ''}`;
          return null;
        }} />

      {slip && (
        <PaySlip run={slip.run} items={slip.items} employees={employees} records={records}
          paymentMethods={methods} accounts={accounts} business={business} onClose={() => setSlip(null)} />
      )}
    </div>
  );
}

const Chip = ({ label, value, sub }) => (
  <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
    <span className="block font-tight text-[11px] font-semibold text-mute">{label}</span>
    <b className="mt-[3px] block font-tight text-[16px] font-semibold tabular-nums">{value}</b>
    {sub && <small className="text-[11.5px] text-mute">{sub}</small>}
  </div>
);

const Tools = ({ onAddEmployee, onRunPayroll, hint }) => (
  <div className="mb-3 flex flex-wrap items-center gap-2.5">
    {hint && <span className="text-[13px] text-mute">Every pay run, newest first. A run is never edited: Re-run reverses it and enters it again.</span>}
    <div className="flex-1" />
    <Button variant="secondary" onClick={onAddEmployee}><UserPlus /> Add employee</Button>
    {hint && <Button onClick={onRunPayroll}><Plus /> Run payroll</Button>}
  </div>
);
