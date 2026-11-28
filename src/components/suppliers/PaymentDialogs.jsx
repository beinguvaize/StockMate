import React, { useEffect, useState } from 'react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { fmtDate } from '../../pages/purchases/lib/register';
import { HoldConfirmDialog, Label, Msg, money, rupees } from './parts';

/**
 * Change or delete a supplier payment (mockups 08 and 09).
 *
 * Both go to the server exactly as before: `editSupplierPayment`
 * (edit_supplier_payment: reverse, then re-apply the new amount across the
 * open bills by the same oldest-first rule) and `deleteSupplierPayment`
 * (delete_supplier_payment: the receipt goes and the bills get their debt
 * back, in one statement).
 *
 *   target  { id, amount, date, method, many, ref }
 */
const failureText = (error, noun) => {
  const f = classifyWriteFailure(error, { noun });
  return f.maySaved
    ? { tone: 'warn', message: `${f.title}. It may have gone through: reload the ledger to check before trying again. (${f.detail})` }
    : { tone: 'bad', message: `${f.title}: ${f.detail}` };
};

export function EditPaymentDialog({ open, target, onClose, cur = '₹', editSupplierPayment, onSaved }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (open && target) { setAmount(String(Math.round(target.amount))); setBusy(false); setMsg(null); }
  }, [open, target]);

  const next = Number(amount);
  // How this one payment changes: words about the edit, not a new owed figure.
  const diff = target && next > 0 ? Math.round((next - Number(target.amount)) * 100) / 100 : 0;

  const save = async () => {
    if (busy || !(next > 0)) return;
    setBusy(true); setMsg(null);
    let res;
    try { res = await editSupplierPayment(target.id, { amount: next }); } catch (e) { res = { success: false, error: e }; }
    setBusy(false);
    if (res?.success) { onSaved?.(next); onClose(); return; }
    console.error('[suppliers] edit payment failed:', res?.error);
    const f = failureText(res?.error || 'Could not save the change.', 'change');
    setMsg({ tone: f.tone, text: f.message });
  };

  return (
    <Dialog open={open && !!target} onClose={busy ? () => {} : onClose} width={440} title="Edit Payment"
      subtitle={target ? `Paid ${fmtDate(target.date, { year: false })}${target.method ? ` by ${target.method}` : ''} · now ${money(target.amount, cur)}` : ''}>
      <Label htmlFor="edit-pay-amount">New amount</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-tight text-[16px] font-semibold text-mute">{cur || '₹'}</span>
        <Input id="edit-pay-amount" type="number" inputMode="decimal" autoFocus value={amount}
          onChange={(e) => setAmount(e.target.value)} className="h-11 pl-8 font-tight text-[16px] font-semibold" />
      </div>
      {Math.abs(diff) >= 0.01 && (
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-tile px-3.5 py-2.5 text-[13px] text-body">
          <span>This payment {diff < 0 ? 'goes down' : 'goes up'} by</span>
          <b className="font-tight text-[16px] font-semibold tabular-nums text-ink">{money(Math.abs(diff), cur)}</b>
        </div>
      )}
      <p className="mt-2.5 text-[12px] text-mute">The new amount is spread over the open bills by the same rule that placed the first one, so the ledger and the bills stay in step.</p>
      {msg && <Msg tone={msg.tone}>{msg.text}</Msg>}
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy} className="shrink-0 px-[18px]">Cancel</Button>
        <Button className="flex-1 tabular-nums" onClick={save} disabled={busy || !(next > 0)}>
          {busy ? 'Saving…' : `Save · ${Number.isInteger(next) ? rupees(next, cur) : money(next, cur)}`}
        </Button>
      </div>
    </Dialog>
  );
}

export function DeletePaymentDialog({ open, target, onClose, cur = '₹', supplierName, deleteSupplierPayment, onDeleted }) {
  return (
    <HoldConfirmDialog open={open && !!target} onClose={onClose}
      title="Delete this payment?" text="This cannot be undone."
      holdLabel={target ? `Hold to delete ${rupees(target.amount, cur)}` : 'Hold to delete'}
      onConfirm={async () => {
        let res;
        try { res = await deleteSupplierPayment(target.id); } catch (e) { res = { success: false, error: e }; }
        if (res?.success) { onDeleted?.(target); return null; }
        console.error('[suppliers] delete payment failed:', res?.error);
        return failureText(res?.error || 'Could not delete the payment.', 'delete');
      }}>
      {target && (
        <div className="rounded-xl bg-tile px-3.5 py-[11px] text-[13px] leading-[1.45] tabular-nums">
          {money(target.amount, cur)} paid on {fmtDate(target.date, { year: false })}{target.method ? ` by ${target.method}` : ''} will be removed
          {target.many > 1 ? ` from the ${target.many} bills it settled` : ` from the bill it settled${target.ref ? `, ${target.ref}` : ''}`},
          and {supplierName || 'this supplier'} will be owed that much again.
        </div>
      )}
    </HoldConfirmDialog>
  );
}
