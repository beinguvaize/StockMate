import React, { useState, useMemo } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import { Button } from '../../../components/ui/button';
import { Eyebrow } from '../../../components/ui/FigureStrip';
import { fmtDate } from '../lib/register';
import { fieldSm } from '../lib/ui';

const METHOD = { CASH: 'Cash', BANK: 'Bank', UPI: 'UPI', CHEQUE: 'Cheque', CARD: 'Card' };
const ib = 'm-press grid h-[30px] w-[30px] place-items-center rounded-[9px] hover:bg-tile disabled:opacity-40';

/**
 * The part payments made against one bill, editable where the bill is.
 *
 * Correcting a part payment was only possible from the Supplier Ledger. The
 * capability existed — `edit_supplier_payment` and `delete_supplier_payment`
 * have been there since the payment-correction work — it simply was not
 * reachable from the Purchases page, which is where someone looking at a bill
 * marked "Credit · ₹3,920 due" actually is.
 *
 * Both actions go through those RPCs rather than writing `paid_amount`
 * directly. `paid_amount` is one half of a pair: the payment row is the other,
 * and the supplier balance is derived from both. Editing the number here would
 * leave the bill saying one thing and the supplier's balance another, which is
 * the class of drift the balance invariant exists to prevent.
 */
const BillPaymentsModal = ({ bill, payments = [], onEdit, onDelete, onClose }) => {
  const [editing, setEditing] = useState(null);   // payment id
  const [draft, setDraft]     = useState('');
  const [busy, setBusy]       = useState(null);
  const [error, setError]     = useState('');

  // Payments booked against any line of this bill. A bill is several purchase
  // rows, so a payment can be attached to any of them.
  const lineIds = useMemo(() => new Set((bill.lines || []).map(l => l.id)), [bill]);
  const mine = useMemo(
    () => (payments || [])
      .filter(p => !p.deleted_at && p.purchase_id && lineIds.has(p.purchase_id))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))),
    [payments, lineIds]);

  const paid = mine.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const due  = Math.max(0, (Number(bill.total) || 0) - paid);

  const run = async (fn, id) => {
    setBusy(id); setError('');
    const res = await fn();
    setBusy(null);
    if (res && res.success === false) {
      setError(res.message || res.error?.message || 'That did not save. Nothing was changed.');
      return false;
    }
    return true;
  };

  const saveEdit = async (p) => {
    const amount = parseFloat(draft);
    if (!(amount > 0)) { setError('Enter an amount greater than zero.'); return; }
    const ok = await run(() => onEdit(p.id, amount), p.id);
    if (ok) setEditing(null);
  };

  const remove = async (p) => {
    const ok = window.confirm(
      `Delete this ${formatCurrency(p.amount)} payment?\n\n` +
      `The bill goes back to owing that much, and the supplier's balance rises by the same amount.`
    );
    if (!ok) return;
    await run(() => onDelete(p.id), p.id);
  };

  return (
    <div>
      <div className="mb-3.5 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-tile px-3.5 py-3"><Eyebrow>Bill total</Eyebrow>
          <b className="mt-0.5 block font-tight text-[18px] font-semibold tabular-nums">{formatCurrency(bill.total)}</b></div>
        <div className="rounded-xl bg-tile px-3.5 py-3"><Eyebrow>Paid</Eyebrow>
          <b className="mt-0.5 block font-tight text-[18px] font-semibold tabular-nums text-good-text">{formatCurrency(paid)}</b></div>
        <div className="rounded-xl bg-amber-soft px-3.5 py-3"><Eyebrow className="text-amber-text">Still due</Eyebrow>
          <b className={`mt-0.5 block font-tight text-[18px] font-semibold tabular-nums ${due > 0.005 ? 'text-bad-text' : 'text-mute'}`}>{formatCurrency(due)}</b></div>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-[10px] bg-bad-soft px-3 py-2.5 text-[12.5px] font-semibold text-bad-text">{error}</div>
      )}

      {mine.length === 0 ? (
        <div className="py-10 text-center">
          <b className="block font-tight text-[14px] font-semibold text-ink-2">Nothing has been paid against this bill yet.</b>
          <span className="mt-1 block text-[12.5px] text-mute">Use Record payment on the bill to record the first payment.</span>
        </div>
      ) : (
        <div>
          {mine.map(p => {
            const isEditing = editing === p.id;
            return (
              <div key={p.id} className={`flex items-center gap-3 border-t border-sep py-2.5 first:border-t-0 ${isEditing ? '-mx-2.5 rounded-[10px] border-t-transparent bg-tile px-2.5' : ''}`}>
                <div className="min-w-0 flex-1">
                  <b className="block font-tight text-[13.5px] font-semibold">
                    {fmtDate(p.date, { year: false })} · {METHOD[(p.payment_method || 'CASH').toUpperCase()] || p.payment_method}
                  </b>
                  <small className="block text-[12px] text-mute tabular-nums">
                    {String(p.id).split('-').pop()}
                    {p.reference_no ? ` · ref ${p.reference_no}` : ''}
                  </small>
                </div>

                {isEditing ? (
                  <>
                    <input autoFocus type="number" step="0.01" min="0" value={draft} aria-label="Payment amount"
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') setEditing(null); }}
                      className={`${fieldSm} !w-[116px] text-right`} />
                    <button type="button" onClick={() => saveEdit(p)} disabled={busy === p.id} className={`${ib} text-good-text`} title="Save" aria-label="Save">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} disabled={busy === p.id} className={`${ib} text-body`} title="Cancel" aria-label="Cancel">
                      <X size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-tight text-[14px] font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                    <button type="button" onClick={() => { setEditing(p.id); setDraft(String(p.amount ?? '')); setError(''); }}
                      disabled={busy === p.id} className={`${ib} text-body`} title="Change the amount" aria-label="Change the amount">
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => remove(p)} disabled={busy === p.id} className={`${ib} text-bad-text`} title="Delete this payment" aria-label="Delete this payment">
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[12px] text-mute">
        Changing an amount moves the supplier&apos;s balance by the difference, in the same step, so the bill
        and the ledger cannot disagree. Deleting asks first.
      </p>

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" className="px-[22px]" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
};

export default BillPaymentsModal;
