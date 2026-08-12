import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../../../lib/utils';

/**
 * Edit a whole bill: the header once, every line beneath it.
 *
 * A bill is several `purchases` rows, and date / supplier / payment type belong
 * to all of them. Editing line by line meant re-typing the header on each and
 * hoping every save landed — and before `bill_id` existed, changing a date on
 * one line silently moved that line into a bill of its own. The bill-level menu
 * was disabled rather than made to work; this is the thing that was missing.
 *
 * Everything is saved by one RPC in one transaction, which refuses a partial
 * payload. So this form always submits every line, including untouched ones.
 *
 * Products are NOT changeable here. Swapping the product on a line rewrites
 * which batch stock came from, and the single-line Edit already does that with
 * its own guard against products that have already been sold. Offering it in a
 * bulk save would hide that guard behind four other fields.
 */
const PAY_TYPES = ['CASH', 'CREDIT', 'BANK', 'UPI'];

const BillEditForm = ({ bill, suppliers = [], productNameById = {}, onSave, onCancel, saving }) => {
  const [date, setDate]         = useState(bill.date || '');
  const [supplierId, setSupId]  = useState(bill.supplier_id || '');
  const [payType, setPayType]   = useState((bill.payment_type || 'CASH').toUpperCase());
  const [billNo, setBillNo]     = useState(bill.bill_no || '');
  const [lines, setLines]       = useState(() => (bill.lines || []).map(l => ({
    id: l.id,
    linked_product_id: l.linked_product_id,
    quantity: String(l.quantity ?? ''),
    total_amount: String(l.total_amount ?? ''),
    notes: l.notes || '',
  })));

  const setLine = (id, field, value) =>
    setLines(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));

  const total = useMemo(
    () => lines.reduce((s, l) => s + (parseFloat(l.total_amount) || 0), 0),
    [lines]);

  // The bill's total is the sum of its lines, so a changed line changes the
  // bill. Showing the delta means nobody has to hold the old figure in mind.
  const originalTotal = (bill.lines || []).reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
  const delta = total - originalTotal;

  const invalid = lines.some(l => !(parseFloat(l.quantity) > 0) || !(parseFloat(l.total_amount) >= 0))
    || !date || !supplierId;

  const submit = (e) => {
    e.preventDefault();
    if (invalid || saving) return;
    onSave({
      billId: bill.bill_id || bill.id,
      supplierId, paymentType: payType, date, billNo,
      lines: lines.map(l => ({
        id: l.id,
        linked_product_id: l.linked_product_id,
        quantity: parseFloat(l.quantity) || 0,
        total_amount: parseFloat(l.total_amount) || 0,
        // Per-unit cost is derived, not typed: the cashier knows what the whole
        // line cost, not the rate to four decimals.
        unit_cost: (parseFloat(l.quantity) > 0)
          ? (parseFloat(l.total_amount) || 0) / parseFloat(l.quantity)
          : 0,
        notes: l.notes,
      })),
    });
  };

  const field = 'w-full bg-canvas border border-black/10 rounded-lg px-2.5 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent-signature/20';

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">

      {/* Header — applies to every line, which is the whole point */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Bill date</span>
          <input type="date" className={field} value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</span>
          <select className={field} value={supplierId} onChange={e => setSupId(e.target.value)}>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment type</span>
          <select className={field} value={payType} onChange={e => setPayType(e.target.value)}>
            {PAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier bill no.</span>
          <input className={field} value={billNo} placeholder="optional"
            onChange={e => setBillNo(e.target.value)} />
        </label>
      </div>

      <p className="text-[11px] text-muted-foreground -mt-1">
        The four fields above apply to all {lines.length} lines — that is what makes this a bill.
      </p>

      {/* Lines */}
      <div className="rounded-xl border border-black/8 overflow-hidden">
        <div className="grid grid-cols-[1fr_88px_110px] gap-2 px-3 py-2 bg-canvas/60 border-b border-black/8">
          {['Product', 'Qty', 'Amount'].map((h, i) => (
            <span key={h} className={`text-[9px] font-bold uppercase tracking-wider text-muted-foreground ${i ? 'text-right' : ''}`}>{h}</span>
          ))}
        </div>
        {lines.map(l => (
          <div key={l.id} className="grid grid-cols-[1fr_88px_110px] gap-2 items-center px-3 py-2 border-b border-black/5 last:border-0">
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold truncate">
                {productNameById[l.linked_product_id] || 'Product'}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">{l.id.split('-').pop()}</div>
            </div>
            <input type="number" step="any" min="0" value={l.quantity}
              onChange={e => setLine(l.id, 'quantity', e.target.value)}
              className={`${field} !py-1.5 text-right tabular-nums`} />
            <input type="number" step="0.01" min="0" value={l.total_amount}
              onChange={e => setLine(l.id, 'total_amount', e.target.value)}
              className={`${field} !py-1.5 text-right tabular-nums`} />
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-2.5 bg-canvas/60 border-t border-black/8">
          <span className="text-[11px] font-semibold text-muted-foreground">Bill total</span>
          <span className="text-sm font-bold tabular-nums">
            {formatCurrency(total)}
            {Math.abs(delta) > 0.005 && (
              <span className={`ml-2 text-[11px] font-semibold ${delta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {delta > 0 ? '+' : '−'}{formatCurrency(Math.abs(delta))}
              </span>
            )}
          </span>
        </div>
      </div>

      {Math.abs(delta) > 0.005 && (
        <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          This changes what the bill is worth, so what is owed to the supplier moves with it.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} disabled={saving}
          className="px-4 py-2.5 rounded-xl border border-black/10 text-sm font-semibold disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={invalid || saving}
          className="btn-signature !px-5 !py-2.5 !text-sm disabled:opacity-50">
          {saving ? 'Saving…' : `Save bill · ${lines.length} line${lines.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </form>
  );
};

export default BillEditForm;
