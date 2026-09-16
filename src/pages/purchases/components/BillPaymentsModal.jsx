import React, { useState, useMemo } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { formatCurrency, formatDate } from '../../../lib/utils';

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

  const field = 'w-28 bg-canvas border border-black/10 rounded-lg px-2 py-1.5 text-sm font-semibold text-right tabular-nums outline-none focus:ring-2 focus:ring-accent-signature/20';

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-center justify-between rounded-xl border border-black/8 px-4 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bill total</div>
          <div className="text-sm font-bold tabular-nums">{formatCurrency(bill.total)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Paid</div>
          <div className="text-sm font-bold tabular-nums text-emerald-600">{formatCurrency(paid)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Still due</div>
          <div className={`text-sm font-bold tabular-nums ${due > 0.005 ? 'text-red-600' : 'text-muted-foreground'}`}>
            {formatCurrency(due)}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700">
          {error}
        </div>
      )}

      {mine.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground font-semibold">
          Nothing has been paid against this bill yet.
          <div className="text-[11px] font-normal mt-1">Use Pay on the bill row to record the first payment.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-black/8 overflow-hidden">
          {mine.map(p => {
            const isEditing = editing === p.id;
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-black/5 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold">
                    {formatDate(p.date)} · {(p.payment_method || 'CASH').toUpperCase()}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {String(p.id).split('-').pop()}
                    {p.reference_no ? ` · ref ${p.reference_no}` : ''}
                  </div>
                </div>

                {isEditing ? (
                  <>
                    <input autoFocus type="number" step="0.01" min="0" value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') setEditing(null); }}
                      className={field} />
                    <button onClick={() => saveEdit(p)} disabled={busy === p.id}
                      className="w-8 h-8 rounded-lg grid place-items-center text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                      title="Save">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditing(null)} disabled={busy === p.id}
                      className="w-8 h-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-black/5"
                      title="Cancel">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(p.amount)}</span>
                    <button onClick={() => { setEditing(p.id); setDraft(String(p.amount ?? '')); setError(''); }}
                      disabled={busy === p.id}
                      className="w-8 h-8 rounded-lg grid place-items-center text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                      title="Change the amount">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => remove(p)} disabled={busy === p.id}
                      className="w-8 h-8 rounded-lg grid place-items-center text-red-500 hover:bg-red-50 disabled:opacity-40"
                      title="Delete this payment">
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Changing an amount moves the supplier&apos;s balance by the difference, in the same
        transaction — the bill and the ledger cannot end up disagreeing.
      </p>

      <div className="flex justify-end">
        <button onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-black/10 text-sm font-semibold">
          Done
        </button>
      </div>
    </div>
  );
};

export default BillPaymentsModal;
