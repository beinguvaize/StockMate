import React, { useEffect, useState } from 'react';
import { MessageCircle, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import { Tabs } from '../ui/Tabs';
import HoldButton from '../motion/HoldButton';
import { cn, formatShortDateTime } from '../../lib/utils';
import { money, ageWords, daysSince, isOverdue, limitUse, creditWords, accountWords, dayMonth } from '../../lib/clientView';
import { METHOD_LABEL } from '../../lib/clientStatement';
import { Pill, Eyebrow } from '../payroll/parts';
import { SummaryStrip } from './parts';

/**
 * The client panel (approved mockups clients-05, 06, 07, 17): who they are,
 * what they owe, the bills not fully paid, the latest receipts and their
 * details, with the summary on top.
 */
const billAge = (date) => { const d = daysSince(date); return d == null ? '' : d <= 0 ? 'today' : `${ageWords(d)} old`; };

const KV = ({ items }) => (
  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
    {items.filter(([, v]) => v).map(([k, v]) => (
      <React.Fragment key={k}>
        <dt className="text-mute">{k}</dt>
        <dd className="m-0 text-right font-medium text-ink-2 break-words">{v}</dd>
      </React.Fragment>
    ))}
  </dl>
);

const Line = ({ title, sub, right, mono }) => (
  <div className="flex items-center justify-between gap-3 border-b border-sep py-2.5 last:border-0">
    <div className="min-w-0">
      <b className={cn('block truncate font-tight text-[13.5px] font-semibold', mono && 'font-mono text-[12.5px]')}>{title}</b>
      <small className="block truncate text-[12px] text-mute">{sub}</small>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-1">{right}</div>
  </div>
);

export default function ClientPanel({
  row, summary, cur = '₹', can = {}, onClose, onCollect, onStatement, onRemind, onEdit, onDelete,
}) {
  const [tab, setTab] = useState('BILLS');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setTab('BILLS'); setDeleteError(''); setDeleting(false); }, [row?.id]);
  if (!row) return null;
  const c = row;
  const bills = c._facts?.unpaid || [];
  const pays = (c._facts?.payments || []).slice(0, 25);
  const lim = limitUse(c._out, c.credit_limit);
  const owes = c._out > 0;

  const hold = async () => {
    setDeleting(true); setDeleteError('');
    const err = await onDelete(c);
    setDeleting(false);
    if (err) setDeleteError(err);
  };

  return (
    <SidePanel open={!!row} onClose={onClose} width={452}
      title={c.name}
      eyebrow={isOverdue(c) ? <Pill tone="bad">Overdue</Pill> : null}
      subtitle={[c.contact, c.phone].filter(Boolean).join(' · ') || 'No contact on file'}
      footer={summary?.bills ? <span className="text-[12.5px] text-body">{summary.bills} order{summary.bills === 1 ? '' : 's'} · {money(summary.total, cur)} bought in all</span> : null}>
      <SummaryStrip summary={summary} cur={cur} className="mb-3" />

      <div className="rounded-[14px] bg-tile px-4 py-3.5">
        <Eyebrow>Owes you</Eyebrow>
        <b className="mt-1 block font-tight text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">{money(c._out, cur)}</b>
        <small className="mt-1 block text-[12.5px] text-body">
          {[c._age != null ? `Oldest bill ${ageWords(c._age)}` : 'Nothing outstanding',
            Number(c.credit_limit) > 0 ? `limit ${money(c.credit_limit, cur)}` : null,
            Number(c.credit_days) > 0 ? `${c.credit_days} day terms` : null].filter(Boolean).join(' · ')}
        </small>
        {lim && (
          <>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-pill bg-black/10">
              <div className={cn('h-full rounded-pill', lim.over ? 'bg-bad' : 'bg-amber')} style={{ width: `${lim.pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-mute">
              <span>{Math.round(lim.pct)}% of the credit limit used</span>
              <span className="tabular-nums">{lim.over ? `${money(-lim.left, cur)} over` : `${money(lim.left, cur)} left`}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2 [&>*]:flex-1">
        {owes && can.collect && <Button onClick={() => onCollect(c)}>Collect payment</Button>}
        <Button variant="secondary" onClick={() => onStatement(c)}>Statement</Button>
      </div>

      {owes && (
        <button type="button" data-card onClick={() => onRemind(c)}
          className="m-press mt-2 flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-good-soft text-good-text"><MessageCircle size={16} /></span>
          <span className="min-w-0 flex-1">
            <b className="block font-tight text-[14px] font-semibold">Send a payment reminder</b>
            <small className="block text-[12.5px] text-body">WhatsApp or SMS, message ready to send</small>
          </span>
          <ChevronRight size={16} className="shrink-0 text-mute" />
        </button>
      )}

      <Tabs className="mt-4" ariaLabel="Client" value={tab} onChange={setTab}
        items={[{ key: 'BILLS', label: 'Bills', count: bills.length }, { key: 'PAYMENTS', label: 'Payments', count: pays.length }, { key: 'DETAILS', label: 'Details' }]} />

      <div className="mt-1">
        {tab === 'BILLS' && (bills.length ? (
          <>
            {bills.map((b) => (
              <Line key={b.id} mono title={b.id}
                sub={`${formatShortDateTime(b.createdAt || b.date)} · ${billAge(b.date)}`}
                right={<><span className="font-tight text-[13.5px] font-semibold tabular-nums">{money(b.due, cur)}</span>
                  {b.paid > 0 ? <Pill tone="warn" small>Part paid</Pill> : <Pill small>Unpaid</Pill>}</>} />
            ))}
            <p className="pt-2.5 text-[12.5px] text-mute">{bills.length} bill{bills.length === 1 ? '' : 's'} not fully paid. The amount owed above is the books’ figure.</p>
          </>
        ) : <p className="py-6 text-center text-[13px] text-body">No unpaid bills.</p>)}

        {tab === 'PAYMENTS' && (pays.length ? (
          <>
            {pays.map((p) => (
              <Line key={p.id} title={dayMonth(p.date) || p.date}
                sub={[METHOD_LABEL[String(p.payment_method || 'CASH').toUpperCase()] || p.payment_method || 'Cash', p.notes].filter(Boolean).join(' · ')}
                right={<span className="font-tight text-[13.5px] font-semibold tabular-nums text-good-text">{money(p.amount, cur)}</span>} />
            ))}
            <p className="pt-2.5 text-[12.5px] text-mute">Last 25 payments. Money taken at the counter with a bill shows in the statement.</p>
          </>
        ) : <p className="py-6 text-center text-[13px] text-body">No payments recorded.</p>)}

        {tab === 'DETAILS' && (
          <div className="pt-3">
            <KV items={[
              ['Phone', c.phone], ['Email', c.email], ['Address', c.address], ['GSTIN', c.gstin],
              ['Account', accountWords(c)], ['Credit', creditWords(c, cur)],
            ]} />
            {(can.edit || can.delete) && (
              <div className="mt-4 flex gap-2">
                {can.edit && <Button variant="secondary" size="sm" onClick={() => onEdit(c)}><Pencil /> Edit</Button>}
                {can.delete && (
                  <HoldButton onConfirm={hold} disabled={deleting} title="Hold 1.5s to delete this client"
                    className="h-8 rounded-pill px-3.5 font-tight text-[13px] font-semibold text-bad-text shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-bad-soft">
                    <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Hold to delete'}
                  </HoldButton>
                )}
              </div>
            )}
            {deleteError && <p role="alert" className="mt-3 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text break-words">{deleteError}</p>}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
