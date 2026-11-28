import React, { useState } from 'react';
import { ArrowRightLeft, XCircle, Trash2 } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import WriteFailure from '../invoices/WriteFailure';
import { stageOf } from '../../lib/orderView';
import { rupees, DialogIcon, InfoBox } from '../estimates/parts';

const Head = ({ icon, tone, title, sub }) => (
  <div className="flex items-center gap-3">
    <DialogIcon tone={tone}>{icon}</DialogIcon>
    <div className="min-w-0">
      <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-body tabular-nums">{sub}</p>}
    </div>
  </div>
);

const itemsWord = (o) => { const n = Array.isArray(o.items) ? o.items.length : 0; return `${n} item${n === 1 ? '' : 's'}`; };

/** Convert a delivered order (orders-06): opens the till; Invoiced once the sale is saved. */
export function ConvertOrderDialog({ order, onOpenSale, onClose }) {
  if (!order) return null;
  const o = order;
  const who = o.client_name || 'Walk-in';
  return (
    <Dialog open onClose={onClose} width={480} label={`Convert ${o.order_number} to a sale`}
      header={<Head tone="warn" icon={<ArrowRightLeft />} title={`Convert ${o.order_number} to a sale?`}
        sub={`${who} · ${itemsWord(o)} · ${rupees(o.grand_total)} before GST`} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Not now</Button>
          <Button onClick={() => onOpenSale(o)}>Open in New sale</Button>
        </>
      )}>
      <p className="text-[13.5px] text-body">
        The till opens with these items{o.client_id ? ` and ${who} as the client` : ''}. GST is worked out there.
      </p>
      <InfoBox>
        The order moves to <b>Invoiced</b> when the sale is saved. Close the till without saving and it stays <b>{stageOf(o.status).label}</b>.
      </InfoBox>
    </Dialog>
  );
}

/** A confirm that runs a write and shows the real reason if it fails. */
function ConfirmWrite({ title, sub, icon, body, keepLabel, goLabel, busyLabel, noun, onGo, onClose, onReread }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async () => {
    setBusy(true); setError(null);
    let res;
    try { res = await onGo(); } catch (e) { res = { error: e }; }
    setBusy(false);
    if (res?.error) { console.error(`[orders] ${noun} failed`, res.error); setError(res.error); return; }
    onClose();
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={460} label={title}
      header={<Head tone="bad" icon={icon} title={title} sub={sub} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{keepLabel}</Button>
          <Button variant="destructive" onClick={go} disabled={busy}>{busy ? busyLabel : goLabel}</Button>
        </>
      )}>
      <p className="text-[13.5px] text-body">{body}</p>
      {error && <WriteFailure error={error} noun={noun} onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
    </Dialog>
  );
}

export const CancelOrderDialog = ({ order, onCancel, onClose, onReread }) => (order ? (
  <ConfirmWrite key={order.id} title={`Cancel order ${order.order_number}?`} sub={`${order.client_name || 'Walk-in'} · ${rupees(order.grand_total)}`}
    icon={<XCircle />} keepLabel="Keep order" goLabel="Cancel order" busyLabel="Cancelling…" noun="cancel"
    body="It moves to Cancelled and stays on record. Nothing was taken from stock or charged, so nothing is reversed."
    onGo={() => onCancel(order)} onClose={onClose} onReread={onReread} />
) : null);

export const DeleteOrderDialog = ({ order, onDelete, onClose, onReread }) => (order ? (
  <ConfirmWrite key={order.id} title={`Delete ${order.order_number}?`}
    sub={`${order.client_name || 'Walk-in'} · ${stageOf(order.status).label.toLowerCase()} · ${rupees(order.grand_total)}`}
    icon={<Trash2 />} keepLabel="Keep it" goLabel="Delete" busyLabel="Deleting…" noun="delete"
    body={order.status === 'CANCELLED'
      ? 'It is removed from Orders. Use this for orders made by mistake; a cancelled order already keeps the record.'
      : 'It is removed from Orders. Use this for orders made by mistake.'}
    onGo={() => onDelete(order)} onClose={onClose} onReread={onReread} />
) : null);
