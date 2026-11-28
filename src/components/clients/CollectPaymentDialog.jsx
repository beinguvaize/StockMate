import React, { useEffect, useRef, useState } from 'react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Seg } from '../documents/DocParts';
import WriteFailure from '../invoices/WriteFailure';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { todayISOInAppTZ } from '../../lib/utils';
import { money } from '../../lib/clientView';
import { ClientAvatar } from './parts';

/**
 * Collect Payment (approved mockup clients-08), from the list, the row menu
 * and the panel.
 *
 * The write is today's, exactly: usePeople.recordClientPayment with NO
 * invoice ids, which is the settle_client_payment server function (oldest
 * bill first, decided by the database). The mockup's "split preview" and
 * its switch to pick bills by hand are not built: the first would be the browser
 * guessing the books' allocation, the second is the browser-side invoice
 * write that must stay unused.
 *
 * Same fields and rule as the account page today: any amount above zero,
 * Cash · Bank · UPI · Cheque, a date and a note.
 */
export const METHODS = [['CASH', 'Cash'], ['BANK', 'Bank'], ['UPI', 'UPI'], ['CHEQUE', 'Cheque']];

export default function CollectPaymentDialog({ client, cur = '₹', recordClientPayment, onDone, onClose, onReread }) {
  const open = !!client;
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISOInAppTZ());
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [failure, setFailure] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    setAmount(''); setDate(todayISOInAppTZ()); setNotes(''); setMethod('CASH');
    setProblem(''); setFailure(null); setBusy(false); inFlight.current = false;
  }, [open, client?.id]);

  if (!open) return null;
  const out = Number(client._out ?? client.outstanding_balance) || 0;
  const bills = client._facts?.unpaid?.length || 0;
  const amt = parseFloat(amount);
  const valid = Number.isFinite(amt) && amt > 0;
  // A dropped connection may have saved it: no second press until re-read.
  const unconfirmed = failure && classifyWriteFailure(failure).maySaved;

  const submit = async (e) => {
    e?.preventDefault();
    if (inFlight.current || busy) return;
    if (!valid) { setProblem('Enter a valid payment amount.'); return; }
    setProblem(''); setFailure(null);
    inFlight.current = true; setBusy(true);
    try {
      const res = await recordClientPayment(client.id, amt, date, notes, [], method);
      if (res?.success === false) { setFailure(res.error || 'The server gave no reason.'); return; }
      onDone?.({ amount: amt, method, queued: !!res?.queued });
    } catch (err) {
      console.error('[clients] collect payment failed:', err);
      setFailure(err);
    } finally {
      inFlight.current = false; setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} width={540} label="Collect payment"
      header={(
        <div className="flex items-center gap-3">
          <ClientAvatar name={client.name} size="lg" />
          <div className="min-w-0">
            <h3 className="font-tight text-[18px] font-semibold tracking-[-0.01em]">Collect Payment</h3>
            <p className="mt-0.5 truncate text-[13px] text-body">
              {client.name} · {out > 0 ? `owes ${money(out, cur)}${bills ? ` in ${bills} bill${bills === 1 ? '' : 's'}` : ''}` : 'nothing owed'}
            </p>
          </div>
        </div>
      )}>
      <form onSubmit={submit} className="-mb-4">
        <div className="mb-[5px] flex items-center justify-between">
          <label htmlFor="collect-amount" className="text-[12px] font-medium text-ink-2">Amount received</label>
          {out > 0 && (
            <button type="button" onClick={() => setAmount(String(out))}
              className="m-press rounded-pill px-3 py-1 font-tight text-[12.5px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile">
              Full {money(out, cur)}
            </button>
          )}
        </div>
        <div className="flex h-[52px] items-center gap-2 rounded-xl px-4 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
          <span className="font-tight text-[20px] text-mute">{cur}</span>
          <input id="collect-amount" type="number" inputMode="decimal" step="0.01" min="0" autoFocus value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0"
            className="w-full bg-transparent font-tight text-[26px] font-semibold tracking-[-0.02em] tabular-nums outline-none placeholder:text-faint" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Date</span>
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Notes</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cheque number or reference" />
          </label>
          <div className="col-span-2">
            <span className="mb-[5px] block text-[12px] font-medium text-ink-2">Paid by</span>
            <Seg value={method} onChange={setMethod} options={METHODS} ariaLabel="Paid by" />
          </div>
        </div>
        {problem && <p role="alert" className="mt-3 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text">{problem}</p>}
        <WriteFailure error={failure} noun="payment" className="mt-3" onReread={onReread ? async () => { await onReread(); setFailure(null); onClose(); } : undefined} />
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy} className="flex-none px-5">Cancel</Button>
          <Button type="submit" disabled={busy || !valid || unconfirmed} className="flex-1">
            {busy ? 'Recording…' : valid ? `Record ${money(amt, cur)} from ${client.name}` : 'Record payment'}
          </Button>
        </div>
        <p className="-mx-[22px] mt-4 rounded-b-[18px] bg-tile px-[22px] py-[11px] text-[12px] text-body">
          The books split it when the payment is saved, oldest bill first, as today.
        </p>
      </form>
    </Dialog>
  );
}
