import React from 'react';
import { Pencil } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import { formatDate } from '../../lib/utils';
import { monthBounds, monthWords, periodWords, shopDay, dayWords, methodLabel, daysText } from '../../lib/payrollView';
import { inr, statusPill, Pill, payTypeWords, rateWords, Fact, LinkButton, Eyebrow } from './parts';

/**
 * The quick panel for one employee (approved mockup 03). Every figure is the
 * row the staff list shows -- the server's line for the month -- and the
 * payments are the saved runs with this person in them.
 */
export default function EmployeePanel({ row, month, records = [], methods = {}, onClose, onOpenProfile, onPay, onEdit, onDelete, onToggleActive }) {
  const open = !!row;
  const e = row?.employee || {};
  const line = row?.line;
  const win = monthBounds(month);
  const mWords = monthWords(month).split(' ')[0];
  const paidRuns = !row || !win ? [] : (records || [])
    .filter((r) => !r.deleted_at)
    .map((r) => ({ r, item: (r.items || []).find((i) => String(i.employeeId) === String(e.id)) }))
    .filter(({ r, item }) => item && Number(item.netPay) > 0 && overlaps(r.period, win));

  const inactive = row?.kind === 'inactive';
  const onLeave = row?.kind === 'onleave';
  const sub = [e.position, e.department, e.joining_date ? `joined ${formatDate(e.joining_date)}` : null, e.phone].filter(Boolean).join(' · ');

  return (
    <SidePanel open={open} onClose={onClose} width={452}
      title={e.name}
      eyebrow={<span className="flex items-center gap-1.5 normal-case tracking-normal">{statusPill(e.status)}<Pill>{payTypeWords(e.pay_type)}</Pill></span>}
      subtitle={<>{sub}<span className="mt-1.5 block"><LinkButton onClick={() => onOpenProfile?.(e)}>Open full profile →</LinkButton></span></>}
      footer={(
        <div className="flex gap-2 [&>*]:flex-1">
          {inactive ? (
            <Button onClick={() => onToggleActive?.(e)}>Mark active</Button>
          ) : (
            <Button onClick={() => onPay?.(row)} disabled={!line || !(row.pending > 0)}
              title={!line ? 'Pay figures are not loaded' : row.pending > 0 ? undefined : 'Nothing left to pay this month'}>
              {line && row.pending > 0 ? `Pay ${inr(row.pending)}` : 'Nothing to pay'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => onEdit?.(e)}><Pencil /> Edit</Button>
          <Button variant="secondary" className="text-bad-text" onClick={() => onDelete?.(e)}>Delete</Button>
        </div>
      )}>
      {row && (
        <>
          <div className="mb-3.5 rounded-[14px] bg-tile px-4 py-3.5">
            <Eyebrow>Still to pay for {mWords}</Eyebrow>
            {inactive ? (
              <>
                <b className="mt-1 block font-tight text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-mute">—</b>
                <small className="text-[12.5px] text-body">Inactive, not paid. Mark active to bring them back into pay runs.</small>
              </>
            ) : line ? (
              <>
                <b className="mt-1 block font-tight text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] tabular-nums">{inr(row.pending)}</b>
                <small className="text-[12.5px] text-body">
                  {inr(row.earned)} earned{row.statutory > 0 ? ` − ${inr(row.statutory)} PF, ESI, tax` : ''} − {inr(row.paid)} already paid
                  {onLeave ? ' · on leave, not in runs until switched in' : ''}
                </small>
              </>
            ) : (
              <>
                <b className="mt-1 block font-tight text-[30px] font-semibold leading-[1.1] text-mute">—</b>
                <small className="text-[12.5px] text-body">Pay figures could not be loaded.</small>
              </>
            )}
          </div>

          <div className="border-t border-sep">
            <Fact label="Pay type" value={payTypeWords(e.pay_type)} />
            <Fact label={row.dayRate ? 'Rate' : 'Salary'} value={rateWords(e)} />
            {line && row.dayRate && <Fact label="Days worked" value={`${daysText(line.daysWorked)} ${Number(line.daysWorked) === 1 ? 'day' : 'days'}`} />}
            {line && !row.dayRate && Number(line.lopDays) > 0 && (
              <Fact label="Absent (loss of pay)" tone="warn" value={`${daysText(line.lopDays)} ${Number(line.lopDays) === 1 ? 'day' : 'days'} · −${inr(line.lopAmount)}`} />
            )}
            {line && !row.dayRate && Number(line.leaveAllowed) > 0 && (
              <Fact label="Leave this month" tone={line.leaveExceeded ? 'warn' : undefined}
                value={`${line.leaveUsed} of ${line.leaveAllowed} ${Number(line.leaveAllowed) === 1 ? 'day' : 'days'}${line.leaveExceeded ? ' · over' : ''}`} />
            )}
            {line && row.dayRate && Number(line.leaveDays) > 0 && <Fact label="Leave this month" value={`${line.leaveDays} ${Number(line.leaveDays) === 1 ? 'day' : 'days'}, unpaid`} />}
            {line && <Fact label="Sick this month" value={`${line.sickDays || 0} ${Number(line.sickDays) === 1 ? 'day' : 'days'}`} />}
            {line && row.statutory > 0 && <Fact label="PF, ESI, tax" tone="bad" value={`−${inr(row.statutory)}`} />}
            {line && <Fact label="Already paid" tone="good" value={inr(row.paid)} />}
            {line && <Fact label="Still to pay" strong value={inr(row.pending)} />}
          </div>

          <div className="mt-[18px] mb-2 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Paid this month</div>
          {paidRuns.length === 0 ? (
            <p className="text-[13px] text-body">Nothing paid for {mWords} yet.</p>
          ) : paidRuns.map(({ r, item }) => (
            <div key={r.id} className="flex justify-between border-b border-sep py-2 text-[13px]">
              <span><b className="font-semibold">{periodWords(r.period)}</b>{methods[r.id] ? ` · ${methodLabel(methods[r.id])}` : ''}{r.processed_at ? ` · paid ${dayWords(shopDay(r.processed_at), { year: false })}` : ''}</span>
              <span className="font-tight font-semibold tabular-nums">{inr(item.netPay)}</span>
            </div>
          ))}
          <p className="mt-2.5 text-[12px] text-mute">Pay figures use the same calculation as Run payroll and the phone.</p>
        </>
      )}
    </SidePanel>
  );
}

function overlaps(period, win) {
  const s = String(period || '');
  let from;
  let to;
  if (s.includes('/')) [from, to] = s.split('/');
  else { const b = monthBounds(s); if (!b) return false; ({ from, to } = b); }
  return from <= win.to && to >= win.from;
}
