import React, { useEffect, useState } from 'react';
import { Banknote, Landmark, Smartphone, ScrollText, MoreHorizontal } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import OptionCard from '../ui/OptionCard';
import { todayISOInAppTZ } from '../../lib/utils';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { fmtDate } from '../../pages/purchases/lib/register';
import { Label, Msg, money, rupees } from './parts';

/**
 * Pay a supplier (mockup 06) or one product line of a bill (07).
 *
 * The money goes exactly where it went before the redesign: the whole-supplier
 * payment is `paySupplier` (the settle_supplier_payment server function, which
 * spreads it over the oldest unpaid credit bills and keeps any rest as an
 * advance), and a line is `payPurchase` (settle_purchase_payment). The
 * Cash/Bank posting is done by the database trigger on the payment row; this
 * dialog writes nothing else.
 *
 * Nothing here previews how the amount will land on the bills: that needs the
 * server's own allocation, and a browser copy of it could disagree.
 *
 *   target   null = pay the supplier; a purchases row = pay that line
 *   bill     the bill the line belongs to (for its number and due date)
 *   owed     { label, amount } shown under the title (each screen's own figure)
 */
const METHODS = [
  ['CASH', 'Cash', Banknote], ['BANK', 'Bank', Landmark], ['UPI', 'UPI', Smartphone],
  ['CHEQUE', 'Cheque', ScrollText], ['OTHER', 'Other', MoreHorizontal],
];
const short = (id, n = 6) => String(id || '').slice(-n).toUpperCase();
const lineAmount = (l) => Number(l?.total_amount ?? l?.total_cost ?? 0);
const linePaid = (l) => Number(l?.paid_amount || 0);

export default function PaySupplierDialog({
  open, onClose, supplierId, supplierName, target = null, bill = null, lineName, owed, prefill,
  cur = '₹', paySupplier, payPurchase, onPaid, onRecheck,
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [date, setDate] = useState(todayISOInAppTZ());
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);           // { tone, text }
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(prefill ? String(Math.round(prefill)) : '');
    setMethod('CASH'); setRef(''); setNote('');
    setDate(todayISOInAppTZ());
    setBusy(false); setMsg(null); setUnconfirmed(false);
  }, [open, prefill, target?.id]);

  const amt = Number(amount);
  const close = () => { if (!busy) onClose(); };

  const submit = async () => {
    if (busy) return;
    if (!(amt > 0)) { setMsg({ tone: 'bad', text: 'Enter a valid amount' }); return; }
    const common = { method, date, referenceNo: ref, note };
    if (target) {
      if (!supplierId || !target.id) { setMsg({ tone: 'bad', text: 'Could not resolve supplier / order. Reopen and retry.' }); return; }
    } else if (!supplierId) { setMsg({ tone: 'bad', text: 'Could not resolve supplier. Reopen and retry.' }); return; }

    setBusy(true); setMsg(null);
    let res;
    try {
      res = target
        ? await payPurchase({ supplierId, purchaseId: target.id, amount: amt, ...common })
        : await paySupplier({ supplierId, amount: amt, ...common });
    } catch (e) {
      res = { error: e };
    }
    setBusy(false);
    if (res?.error) {
      console.error('[suppliers] payment failed:', res.error);
      const f = classifyWriteFailure(res.error, { noun: 'payment' });
      if (f.maySaved) {
        // The request may have reached the server. Paying again could pay twice.
        setUnconfirmed(true);
        setMsg({ tone: 'warn', text: `${f.title}. It may have been saved. Check the ledger before paying again. (${f.detail})` });
      } else {
        setMsg({ tone: 'bad', text: `${f.title}: ${f.detail}` });
      }
      return;
    }
    onPaid?.({ amount: amt, method, queued: !!res?.queued });
    onClose();
  };

  const recheck = async () => {
    setBusy(true);
    try { await onRecheck?.(); } finally { setBusy(false); }
    onClose();
  };

  const lineDue = target ? Math.max(0, lineAmount(target) - linePaid(target)) : 0;
  const billRef = bill?.bill_no || `#${short(bill?.id || target?.id)}`;
  const title = target ? `Pay Bill ${billRef}` : `Pay ${supplierName || 'Supplier'}`;
  const subtitle = target
    ? `${lineName ? `${lineName} line · ` : ''}line ${short(target.id)}`
    : owed ? `${owed.label} ${money(owed.amount, cur)}. Paid oldest bill first.` : 'Paid oldest bill first.';

  return (
    <Dialog open={open} onClose={close} width={target ? 440 : 600} title={title} subtitle={subtitle}>
      {target && (
        <div className="mb-3.5">
          <div className="flex justify-between py-1 text-[13px] text-body"><span>Line amount</span><span className="font-tight text-[13.5px] font-semibold tabular-nums text-ink">{money(lineAmount(target), cur)}</span></div>
          <div className="flex justify-between py-1 text-[13px] text-body"><span>Already paid</span><span className="font-tight text-[13.5px] font-semibold tabular-nums text-ink">{money(linePaid(target), cur)}</span></div>
          <div className="mt-1.5 flex justify-between border-t border-line pt-2 text-[13px] font-semibold text-ink">
            <span>Line due</span>
            <span className="text-right font-tight text-[13.5px] tabular-nums">{money(lineDue, cur)}
              {bill?.dueOn && lineDue > 0.01 && (
                <small className={`block font-tight text-[12px] font-semibold ${bill.state === 'over' ? 'text-bad-text' : 'text-mute'}`}>
                  bill {bill.state === 'over' ? 'was' : 'is'} due {fmtDate(bill.dueOn, { year: false })}
                </small>
              )}
            </span>
          </div>
        </div>
      )}

      <Label htmlFor="pay-amount">Amount</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-tight text-[16px] font-semibold text-mute">{cur || '₹'}</span>
        <Input id="pay-amount" type="number" min="0" step="0.01" inputMode="decimal" autoFocus value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={target ? String(Math.round(lineDue)) : owed ? String(Math.round(owed.amount)) : ''}
          className="h-[46px] pl-8 font-tight text-[18px] font-semibold" />
      </div>
      {!target && (
        <p className="mt-2 text-[12px] text-mute">
          The server settles the oldest unpaid credit bills first; anything above what is owed stays with the supplier as an advance.
        </p>
      )}

      <Label className="mt-3.5">Method</Label>
      <div role="radiogroup" aria-label="Method" className="grid grid-cols-5 gap-2">
        {METHODS.map(([m, label, Icon]) => (
          <OptionCard key={m} selected={method === m} onClick={() => setMethod(m)} icon={<Icon />} title={label}
            className="flex-col justify-center gap-[5px] px-1 py-2.5 text-center [&_b]:text-[12.5px]" />
        ))}
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pay-date">Date</Label>
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pay-ref">Reference no.</Label>
          <Input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UPI or cheque no." />
        </div>
        <div className="col-span-2">
          <Label htmlFor="pay-note">Note</Label>
          <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {msg && <Msg tone={msg.tone}>{msg.text}</Msg>}

      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={close} disabled={busy} className="shrink-0 px-[18px]">Cancel</Button>
        {unconfirmed ? (
          <Button className="flex-1" onClick={recheck} disabled={busy}>{busy ? 'Checking…' : 'Reload and check'}</Button>
        ) : (
          <Button className="flex-1 tabular-nums" onClick={submit} disabled={busy || !(amt > 0)}>
            {busy ? 'Saving…' : `Pay ${Number.isInteger(amt || 0) ? rupees(amt || 0, cur) : money(amt, cur)}`}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
