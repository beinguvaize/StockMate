import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import HoldButton from '../motion/HoldButton';
import WriteFailure from '../invoices/WriteFailure';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { formatDate } from '../../lib/utils';
import { money } from '../../lib/clientView';

/**
 * Edit Payment (approved mockup clients-11), from a receipt's pencil on the
 * account page. Saving is today's edit_client_payment (the receipt is edited
 * in place and the client's allocations replayed by the server); holding
 * Delete is today's delete_client_payment. Both are usePeople's, unchanged.
 */
export default function EditPaymentDialog({ target, clientName, cur = '₹', canDelete = true, editClientPayment, deleteClientPayment, onDone, onClose, onReread }) {
  const open = !!target;
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [failedNoun, setFailedNoun] = useState('change');
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open) return;
    setAmount(String(Math.round(Number(target.amount) || 0))); setBusy(false); setFailure(null); inFlight.current = false;
  }, [open, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const amt = Number(amount);
  const unconfirmed = failure && classifyWriteFailure(failure).maySaved;

  const run = async (noun, fn) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailure(null); setFailedNoun(noun);
    try {
      const res = await fn();
      if (res?.success === false || res?.error) { setFailure(res.error || 'The server gave no reason.'); return; }
      onDone?.(noun, res);
    } catch (err) {
      console.error(`[clients] payment ${noun} failed:`, err);
      setFailure(err);
    } finally {
      inFlight.current = false; setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} width={440} label="Edit payment"
      title="Edit Payment"
      subtitle={`Received ${formatDate(target.date)}${target.method ? ` by ${target.method}` : ''} · now ${money(target.amount, cur)}`}>
      <label htmlFor="edit-pay-amount" className="mb-[5px] block text-[12px] font-medium text-ink-2">New amount</label>
      <div className="flex h-[52px] items-center gap-2 rounded-xl px-4 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
        <span className="font-tight text-[20px] text-mute">{cur}</span>
        <input id="edit-pay-amount" type="number" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent font-tight text-[26px] font-semibold tracking-[-0.02em] tabular-nums outline-none" />
      </div>
      <span className="mt-1.5 block text-[12px] text-mute">
        The payment stays on the statement. {clientName ? `${clientName}’s` : 'The'} balance is worked out again from all payments.
      </span>
      <WriteFailure error={failure} noun={failedNoun === 'delete' ? 'delete' : 'change'} className="mt-3"
        onReread={onReread ? async () => { await onReread(); onClose(); } : undefined} />
      <div className="mt-5 flex gap-2">
        {canDelete && (
          <HoldButton onConfirm={() => run('delete', () => deleteClientPayment(target.id))} disabled={busy || unconfirmed} title="Hold 1.5s to delete this payment"
            className="inline-flex h-10 flex-none items-center justify-center rounded-pill bg-bad-soft px-4 font-tight text-[13.5px] font-semibold text-bad-text">
            <Trash2 size={15} /> Hold to delete
          </HoldButton>
        )}
        <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-1">Cancel</Button>
        <Button disabled={busy || unconfirmed || !(amt > 0)} className="flex-1"
          onClick={() => run('change', () => editClientPayment(target.id, { amount: amt }))}>
          {busy ? 'Saving…' : amt > 0 ? `Save ${money(amt, cur)}` : 'Save'}
        </Button>
      </div>
    </Dialog>
  );
}
