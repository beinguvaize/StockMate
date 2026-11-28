import React from 'react';
import { Truck, FileText } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { stageOf, orderActions, trackSteps, lineFigures, TIER_LABELS } from '../../lib/orderView';
import { longDay, shortDay, shopDay } from '../../lib/estimateView';
import { amt2, rupees2, Tile, Tots, TotRow, SectionHead } from '../estimates/parts';
import { StagePill } from './parts';

/** The five-step track (orders-03). Only the day it was made is stored. */
function Track({ order }) {
  const steps = trackSteps(order);
  return (
    <ol className="mt-1.5 mb-4 grid grid-cols-5" aria-label="Order stages">
      {steps.map((s, i) => (
        <li key={s.id} aria-current={s.current ? 'step' : undefined}
          className={cn('relative pt-6 text-center font-tight text-[11.5px] font-semibold', s.done ? 'text-ink' : 'text-mute')}>
          <span aria-hidden="true" className={cn('absolute top-2 h-0.5', i === 0 ? 'left-1/2 right-0' : i === steps.length - 1 ? 'left-0 right-1/2' : 'left-0 right-0',
            s.done ? 'bg-ink' : 'bg-line')} />
          <i aria-hidden="true" className={cn('absolute top-0.5 left-1/2 -ml-[7px] h-3.5 w-3.5 rounded-full',
            s.current ? 'bg-white shadow-[inset_0_0_0_4px_var(--color-amber)]' : s.done ? 'bg-ink' : 'bg-white shadow-[inset_0_0_0_2px_var(--color-line)]')} />
          {s.label}
          <small className="mt-0.5 block font-sans text-[11px] font-medium text-mute">{s.day ? shortDay(s.day) : ' '}</small>
        </li>
      ))}
    </ol>
  );
}

/**
 * One order (orders-03): track, dates, items, total and notes. The footer
 * carries the row's own actions: cancel, edit, delete, and the next stage
 * (or Convert to sale) as the one filled button. An invoice in the pipeline
 * shows its delivery switch and a link to the invoice instead.
 */
export default function OrderPanel({ order, busy, onClose, onAdvance, onConvert, onCancel, onDelete, onEdit, onToggleDelivery, onViewInvoice }) {
  const o = order || {};
  const a = orderActions(o);
  const items = Array.isArray(o.items) ? o.items : [];
  const cancelled = o.status === 'CANCELLED';
  const sub = a.isInvoice
    ? `${o.client_name || 'Walk-in'} · from an invoice`
    : `${o.client_name || 'Walk-in'} · ${o.order_type || 'B2B'} · ${TIER_LABELS[o.price_tier] || o.price_tier || 'Retail'} price`;
  return (
    <SidePanel open={!!order} onClose={onClose} width={540} eyebrow={a.isInvoice ? 'Invoice' : 'Customer order'}
      title={<span className="flex items-center gap-2"><span className="tabular-nums">{o.order_number}</span><StagePill status={o.status} /></span>}
      subtitle={sub}
      footer={(
        <div className="flex flex-wrap items-center gap-2">
          {a.cancel && <Button variant="secondary" size="sm" onClick={() => onCancel(o)} disabled={busy}>Cancel order</Button>}
          {a.edit && <Button variant="secondary" size="sm" onClick={() => onEdit(o)} disabled={busy}>Edit</Button>}
          {a.remove && <Button variant="secondary" size="sm" className="text-bad-text" onClick={() => onDelete(o)} disabled={busy}>Delete</Button>}
          {a.delivery && (
            <Button variant="secondary" size="sm" onClick={() => onToggleDelivery(o)} disabled={busy}>
              <Truck /> {o._delivery_required ? 'Remove delivery flag' : 'Mark for van delivery'}
            </Button>
          )}
          <span className="flex-1" />
          {a.viewInvoice && <Button size="sm" variant="dark" onClick={() => onViewInvoice(o)}><FileText /> View invoice</Button>}
          {a.convert && <Button size="sm" onClick={() => onConvert(o)} disabled={busy}>Convert to sale</Button>}
          {a.advance && !a.convert && (
            <Button size="sm" onClick={() => onAdvance(o)} disabled={busy}>{busy ? 'Saving…' : `Mark ${stageOf(a.advance).label.toLowerCase()}`}</Button>
          )}
        </div>
      )}>
      {order && (
        <>
          {!cancelled && <Track order={o} />}
          {cancelled && <p className="mb-4 rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad-text">This order was cancelled. Nothing was taken from stock or charged.</p>}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Tile label={a.isInvoice ? 'Created' : 'Ordered'} value={longDay(shopDay(o.created_at)) || '—'} />
            <Tile label={a.isInvoice ? 'Invoice date' : 'Requested for'} value={longDay(String(o.requested_date || '').slice(0, 10)) || '—'} />
          </div>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="font-tight text-[12px] font-semibold text-mute">
                <th className="border-b border-line py-2 pr-2 text-left font-semibold">Item</th>
                <th className="border-b border-line px-2 py-2 text-right font-semibold">Qty</th>
                <th className="border-b border-line px-2 py-2 text-right font-semibold">Rate</th>
                <th className="border-b border-line py-2 pl-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const l = lineFigures(it);
                return (
                  <tr key={i}>
                    <td className="border-b border-sep py-2 pr-2 font-semibold text-ink">{l.name}</td>
                    <td className="border-b border-sep px-2 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="border-b border-sep px-2 py-2 text-right tabular-nums">{l.has ? amt2(l.rate) : '—'}</td>
                    <td className="border-b border-sep py-2 pl-2 text-right font-tight font-medium tabular-nums">{l.has ? amt2(l.amount) : '—'}</td>
                  </tr>
                );
              })}
              {!items.length && <tr><td colSpan={4} className="py-6 text-center text-mute">No items.</td></tr>}
            </tbody>
          </table>
          <Tots className="mt-3.5">
            {a.isInvoice
              ? <TotRow strong label="Invoice total" value={rupees2(o.grand_total)} />
              : (
                <>
                  <TotRow label="Items, before GST" value={rupees2(o.grand_total)} />
                  <TotRow strong label="Order total" value={rupees2(o.grand_total)} />
                  <p className="pt-1.5 text-[12px] text-mute">GST is added when it is billed as a sale.</p>
                </>
              )}
          </Tots>
          {o.notes && (
            <>
              <SectionHead>Notes</SectionHead>
              <p className="whitespace-pre-line text-[13px] text-ink-2">{o.notes}</p>
            </>
          )}
        </>
      )}
    </SidePanel>
  );
}
