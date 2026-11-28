import React, { useState } from 'react';
import { ShoppingCart, Trash2, Copy, Check, ArrowRightLeft } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import OptionCard from '../ui/OptionCard';
import WriteFailure from '../invoices/WriteFailure';
import { Input } from '../ui/input';
import {
  docTypeLabel, statusOf, maskPhone, whatsappText, whatsappLink,
} from '../../lib/estimateView';
import { rupees, DialogIcon, InfoBox } from './parts';

const ConfirmHead = ({ icon, tone, title, sub }) => (
  <div className="flex items-center gap-3">
    <DialogIcon tone={tone}>{icon}</DialogIcon>
    <div className="min-w-0">
      <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-body tabular-nums">{sub}</p>}
    </div>
  </div>
);

/**
 * Share on WhatsApp (estimates-06). Shows the message, lets the number be
 * changed for this send, copies the text, opens WhatsApp. "Mark as sent"
 * (a Draft only) moves it to Sent with the same status call the menu uses.
 */
export function ShareDialog({ estimate, shopName, onMarkSent, onClose, notify }) {
  const e = estimate || {};
  const [phone, setPhone] = useState(() => e.client_phone || '');
  const [editing, setEditing] = useState(false);
  const [markSent, setMarkSent] = useState(true);
  const [copied, setCopied] = useState(false);
  if (!estimate) return null;
  const text = whatsappText(e, shopName);
  const isDraft = (e.status || 'DRAFT') === 'DRAFT';
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch (err) { notify?.(`Could not copy: ${err?.message || err}`, 'error'); }
  };
  const open = () => {
    window.open(whatsappLink(phone, text), '_blank');
    if (isDraft && markSent) onMarkSent?.(e);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} width={520} title="Share on WhatsApp"
      subtitle={`${e.estimate_number || ''} · ${e.client_name || 'Walk-in'}`}
      footer={(
        <>
          <Button variant="secondary" onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy text'}</Button>
          <Button onClick={open}>Open WhatsApp</Button>
        </>
      )}>
      <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[13px] text-body">
        To <b className="font-tight text-[13.5px] font-semibold text-ink">{e.client_name || 'Walk-in'}</b>
        {!editing && <span className="tabular-nums">{maskPhone(phone) || 'no number saved'}</span>}
        {editing ? (
          <Input autoFocus inputMode="tel" aria-label="WhatsApp number" value={phone} onChange={(ev) => setPhone(ev.target.value)}
            className="h-8 w-44" placeholder="10-digit number" />
        ) : (
          <button type="button" onClick={() => setEditing(true)}
            className="ml-auto font-tight text-[12.5px] font-semibold text-amber-text hover:underline underline-offset-4">Change number</button>
        )}
      </div>
      <div className="rounded-[14px] bg-[#EFEAE2] p-4">
        <div className="max-w-[88%] whitespace-pre-line rounded-[10px_10px_10px_2px] bg-white px-3 py-2.5 text-[13px] leading-[1.55] text-ink-2 shadow-[0_1px_1px_rgba(17,20,24,0.08)]">{text.replace(/\*/g, '')}</div>
      </div>
      {isDraft && (
        <label className="mt-3.5 flex cursor-pointer items-start gap-2.5 text-[13px] text-body">
          <input type="checkbox" checked={markSent} onChange={(ev) => setMarkSent(ev.target.checked)} className="mt-0.5 h-[18px] w-[18px] accent-[var(--color-ink)]" />
          <span><b className="block font-semibold text-ink">Mark as sent</b>Moves it from Draft to Sent so it shows under Waiting for an answer.</span>
        </label>
      )}
    </Dialog>
  );
}

/**
 * Convert to a sale (estimates-07). One way today: New sale opens the till
 * with the items and the client. The estimate is marked Billed only when
 * that sale is saved (the Sales page does it).
 */
export function ConvertDialog({ estimate, onNewSale, onClose }) {
  if (!estimate) return null;
  const e = estimate;
  const n = Array.isArray(e.items) ? e.items.length : 0;
  return (
    <Dialog open onClose={onClose} width={500} label={`Convert ${e.estimate_number || ''} to a sale`}
      header={<ConfirmHead tone="warn" icon={<ArrowRightLeft />} title="Convert to a sale"
        sub={`${e.estimate_number || ''} · ${e.client_name || 'Walk-in'} · ${rupees(e.grand_total)}`} />}
      footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}>
      <OptionCard variant="choice" primary icon={<ShoppingCart />} title="New sale"
        hint={`Opens the till with ${n === 1 ? 'this item' : `these ${n} items`}. Take payment there.`}
        onClick={() => onNewSale(e)} />
      <InfoBox>
        {e.client_id ? 'The client comes along. ' : ''}The estimate is marked <b>Billed</b> only once the sale is saved; back out and it stays <b>{statusOf(e).label}</b>.
      </InfoBox>
    </Dialog>
  );
}

/** Delete an estimate (estimates-10). The real reason shows if it fails. */
export function DeleteEstimateDialog({ estimate, onDelete, onClose, onReread }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!estimate) return null;
  const e = estimate;
  const go = async () => {
    setBusy(true); setError(null);
    let res;
    try { res = await onDelete(e); } catch (err) { res = { error: err }; }
    setBusy(false);
    if (res?.error) { console.error('[estimates] delete failed', res.error); setError(res.error); return; }
    onClose();
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={460} label={`Delete estimate ${e.estimate_number || ''}`}
      header={<ConfirmHead tone="bad" icon={<Trash2 />} title={`Delete estimate ${e.estimate_number || ''}?`}
        sub={`${e.client_name || 'Walk-in'} · ${docTypeLabel(e)} · ${rupees(e.grand_total)}`} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep it</Button>
          <Button variant="destructive" onClick={go} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </>
      )}>
      <p className="text-[13.5px] text-body">It leaves this list. Stock and money are not touched: an estimate never changed them.</p>
      {error && <WriteFailure error={error} noun="delete" onReread={() => { onReread?.(); onClose(); }} className="mt-3" />}
    </Dialog>
  );
}
