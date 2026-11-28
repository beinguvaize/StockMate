import React, { useState, useMemo, useRef } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { priceCheck } from '../lib/priceCheck';
import PriceCheckDialog from './PriceCheckDialog';
import { useFocusAfterDialog } from '../lib/useFocusAfterDialog';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { lbl, field, fieldSm, footRow } from '../lib/ui';

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
 * Used for EVERY purchase bill, one line or ten. A one-line bill is a bill; it
 * had its own form and its own write path anyway, which is two writers for the
 * same data and how a line came to leave its own bill in the first place.
 *
 * The product on a line can be changed. resync_purchase_batch refuses it once
 * units have been sold, naming how many and telling the user to correct the
 * sales first — a better message than any check made here, and one fewer thing
 * to keep true in two places.
 */
const PAY_TYPES = ['CASH', 'CREDIT', 'BANK', 'UPI'];
const PAY_LABEL = { CASH: 'Cash', CREDIT: 'Credit', BANK: 'Bank', UPI: 'UPI' };

const BillEditForm = ({ bill, suppliers = [], products = [], productNameById = {}, payments = [],
                       purchases = [], onSave, onCancel, saving }) => {
  const [date, setDate]         = useState(bill.date || '');
  const [supplierId, setSupId]  = useState(bill.supplier_id || '');
  const [payType, setPayType]   = useState((bill.payment_type || 'CASH').toUpperCase());
  const [billNo, setBillNo]     = useState(bill.bill_no || '');
  // Money handed over now, recorded as a real payment rather than written onto
  // paid_amount. paid_amount is one half of a pair -- the payment row is the
  // other, and the supplier balance derives from both -- so setting the number
  // here would leave the bill saying one thing and the ledger another.
  const [paidNow, setPaidNow]   = useState('');
  const [lines, setLines]       = useState(() => (bill.lines || []).map(l => ({
    id: l.id,
    linked_product_id: l.linked_product_id,
    quantity: String(l.quantity ?? ''),
    total_amount: String(l.total_amount ?? ''),
    notes: l.notes || '',
  })));

  // Keyed by id for saved lines; a new line has no id yet, so it carries a
  // local key instead. Nothing downstream reads the key -- the ABSENCE of an
  // id is what tells the save handler this line has to be inserted.
  const keyOf = (l) => l.id || l.__key;
  const setLine = (key, field, value) =>
    setLines(prev => prev.map(l => (keyOf(l) === key ? { ...l, [field]: value } : l)));

  const addLine = () => setLines(prev => [...prev, {
    id: null,
    __key: `new-${Date.now()}-${prev.length}`,
    linked_product_id: products[0]?.id || '',
    quantity: '',
    total_amount: '',
    notes: '',
  }]);

  // Only an unsaved line can be dropped here. Removing a SAVED line is a
  // different act -- stock has moved, the ledger has a row -- and belongs to
  // the line's own Delete, which reverses all of that.
  const dropNewLine = (key) => setLines(prev => prev.filter(l => keyOf(l) !== key));

  const total = useMemo(
    () => lines.reduce((s, l) => s + (parseFloat(l.total_amount) || 0), 0),
    [lines]);

  // The bill's total is the sum of its lines, so a changed line changes the
  // bill. Showing the delta means nobody has to hold the old figure in mind.
  const originalTotal = (bill.lines || []).reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
  const delta = total - originalTotal;

  // What has already been settled against this bill's lines.
  const lineIds = new Set((bill.lines || []).map(l => l.id));
  const alreadyPaid = (payments || [])
    .filter(p => !p.deleted_at && p.purchase_id && lineIds.has(p.purchase_id))
    .reduce((s2, p) => s2 + (Number(p.amount) || 0), 0);
  const stillDue = Math.max(0, total - alreadyPaid);
  const payNum = parseFloat(paidNow) || 0;

  const isCredit = ['CREDIT', 'UDHAAR', 'POST-CAPITAL'].includes(payType);
  // Paying more than the bill still owes is not a part payment; it is an
  // on-account advance, and that belongs on the supplier, not on this bill.
  const payTooMuch = payNum > stillDue + 0.005;

  const invalid = lines.some(l => !(parseFloat(l.quantity) > 0) || !(parseFloat(l.total_amount) >= 0)
      || !l.linked_product_id)
    || !date || !supplierId || payTooMuch;

  // Lines whose price is far from the item's last purchase. Only lines this
  // edit touched -- a new line, or a changed product, quantity or amount --
  // so changing the date does not re-ask about prices nobody altered. An
  // edited line is compared with the purchase before it, never with itself.
  const [priceFlags, setPriceFlags] = useState(null);
  const formRef = useRef(null);
  const focusAmount = useFocusAfterDialog((key) => formRef.current?.querySelector(`[data-line-total="${key}"]`));

  const touchedLines = () => {
    const before = new Map((bill.lines || []).map(l => [l.id, l]));
    return lines.filter(l => {
      const was = l.id && before.get(l.id);
      return !was || was.linked_product_id !== l.linked_product_id
        || Math.abs((Number(was.quantity) || 0) - (parseFloat(l.quantity) || 0)) > 1e-9
        || Math.abs((Number(was.total_amount) || 0) - (parseFloat(l.total_amount) || 0)) > 0.005;
    }).map(l => ({ ...l, key: keyOf(l) }));
  };

  const submit = (e) => {
    e.preventDefault();
    if (invalid || saving) return;
    const flagged = priceCheck(touchedLines(), purchases, products);
    if (flagged.length) { setPriceFlags(flagged); return; }
    save();
  };

  const save = () => {
    setPriceFlags(null);
    onSave({
      billId: bill.bill_id || bill.id,
      supplierId, paymentType: payType, date, billNo,
      // Recorded after the bill saves, as a payment against the bill's lines.
      paidNow: isCredit && payNum > 0 ? payNum : 0,
      lines: lines.map(l => ({
        // null on an added line. The save handler splits on this: saved lines
        // go through edit_purchase_bill, which refuses an id it does not know,
        // and new ones are inserted the way any purchase is.
        id: l.id || null,
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

  return (
    <form ref={formRef} onSubmit={submit}>

      {/* Header — applies to every line, which is the whole point */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Bill date</span>
          <input type="date" className={field} value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className={lbl}>Supplier</span>
          <select className={field} value={supplierId} onChange={e => setSupId(e.target.value)}>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Payment type</span>
          <select className={field} value={payType} onChange={e => setPayType(e.target.value)}>
            {!PAY_TYPES.includes(payType) && <option value={payType}>{payType}</option>}
            {PAY_TYPES.map(t => <option key={t} value={t}>{PAY_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Supplier bill no.</span>
          <input className={field} value={billNo} placeholder="optional"
            onChange={e => setBillNo(e.target.value)} />
        </label>
      </div>

      <p className="mb-3 mt-2 text-[12px] text-mute">
        These four apply to all {lines.length} line{lines.length === 1 ? '' : 's'}; that is what makes this one bill.
      </p>

      {/* Lines */}
      <div className="grid grid-cols-[minmax(0,1fr)_84px_110px_26px] items-center gap-2 pb-1.5 pt-1">
        <span className="font-tight text-[12px] font-semibold text-mute">Product</span>
        <span className="text-right font-tight text-[12px] font-semibold text-mute">Qty</span>
        <span className="text-right font-tight text-[12px] font-semibold text-mute">Amount</span>
        <span />
      </div>
      {lines.map(l => (
        <div key={keyOf(l)} className={`grid grid-cols-[minmax(0,1fr)_84px_110px_26px] items-center gap-2 border-t border-sep py-2 ${
          l.id ? '' : '-mx-2.5 rounded-[10px] border-t-transparent bg-[#FFF9F0] px-2.5'}`}>
          <div className="min-w-0">
            {/* Changing the product rewrites which batch the stock came from.
                edit_purchase already refuses that once units have been sold,
                naming the sales in the way -- so the guard is not repeated
                here, and its message reaches the user through the save. */}
            <select
              value={l.linked_product_id || ''}
              onChange={e => setLine(keyOf(l), 'linked_product_id', e.target.value)}
              className={`${fieldSm} truncate`}
              aria-label="Product"
            >
              {!products.some(p2 => p2.id === l.linked_product_id) && (
                <option value={l.linked_product_id}>
                  {productNameById[l.linked_product_id] || 'Product'}
                </option>
              )}
              {products.map(p2 => <option key={p2.id} value={p2.id}>{p2.name}</option>)}
            </select>
            <small className="mt-[3px] block text-[11px] text-mute tabular-nums">
              {l.id ? l.id.split('-').pop() : 'New line'}
            </small>
          </div>
          <input type="number" step="any" min="0" value={l.quantity} aria-label="Quantity"
            onChange={e => setLine(keyOf(l), 'quantity', e.target.value)}
            className={`${fieldSm} self-start text-right`} />
          <input type="number" step="0.01" min="0" value={l.total_amount}
            aria-label="Amount" data-line-total={keyOf(l)}
            onChange={e => setLine(keyOf(l), 'total_amount', e.target.value)}
            className={`${fieldSm} self-start text-right`} />
          {l.id ? <span /> : (
            <button type="button" onClick={() => dropNewLine(keyOf(l))}
              aria-label="Remove this new line"
              className="m-press grid h-[34px] w-[26px] self-start place-items-center rounded-[9px] text-mute hover:bg-well hover:text-bad-text">
              <X size={14} />
            </button>
          )}
        </div>
      ))}

      {/* A delivery is not always counted in one go: five things are booked
          in and the sixth turns up in the van an hour later. Without this the
          only way to record it was a second bill for the same delivery --
          which is the same split this form exists to prevent, reached from
          the other side. */}
      <div className="mt-1 flex items-center justify-between border-t border-sep pt-3">
        <button type="button" onClick={addLine}
          className="inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-2">
          <Plus size={14} /> Add another product
        </button>
        <span className="font-tight text-[13.5px] font-semibold tabular-nums">
          Bill total {formatCurrency(total)}
          {Math.abs(delta) > 0.005 && (
            <span className={`ml-1 text-[12.5px] ${delta > 0 ? 'text-amber-text' : 'text-good-text'}`}>
              {delta > 0 ? '+' : '−'}{formatCurrency(Math.abs(delta))}
            </span>
          )}
        </span>
      </div>

      {Math.abs(delta) > 0.005 && (
        <div className="mt-2.5 flex items-start gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[12.5px] leading-snug text-amber-text">
          <AlertTriangle size={16} className="mt-px shrink-0" />
          <span>This changes what the bill is worth, so what is owed to the supplier moves with it.</span>
        </div>
      )}

      {/* Part payment. Only for credit terms: a cash or bank bill is paid in
          full at entry, so "paid now" there would contradict the payment type. */}
      {isCredit && (
        <div className="mt-3 rounded-xl px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <div className="flex justify-between py-1 text-[13px] text-body">
            <span>Already paid</span>
            <span className="font-tight text-[13.5px] font-semibold tabular-nums text-good-text">{formatCurrency(alreadyPaid)}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px] text-body">
            <span>Still due</span>
            <span className={`font-tight text-[13.5px] font-semibold tabular-nums ${stillDue > 0.005 ? 'text-bad-text' : 'text-mute'}`}>
              {formatCurrency(stillDue)}
            </span>
          </div>
          <label className="mt-2 block">
            <span className={lbl}>Pay now, optional</span>
            <input type="number" step="0.01" min="0" value={paidNow}
              onChange={e => setPaidNow(e.target.value)}
              placeholder={stillDue > 0.005 ? `Up to ${formatCurrency(stillDue)}` : 'Nothing left to pay'}
              disabled={stillDue <= 0.005}
              className={`${field} text-right`} />
          </label>
          {payTooMuch ? (
            <p className="mt-1.5 text-[12px] font-semibold text-bad-text">
              That is more than the {formatCurrency(stillDue)} still owed. Anything beyond the
              bill is an advance and belongs on the supplier, not here.
            </p>
          ) : payNum > 0 ? (
            <p className="mt-1.5 text-[12px] text-mute">
              Recorded as a payment against this bill once it saves, leaving{' '}
              <b className="text-ink">{formatCurrency(stillDue - payNum)}</b> owing. It is not written onto the bill,
              so the ledger and the balance move with it.
            </p>
          ) : null}
        </div>
      )}

      <div className={footRow}>
        <Button variant="secondary" className="px-[22px]" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={invalid || saving} className="flex-1 h-11">
          {saving ? 'Saving…' : `Save bill · ${lines.length} line${lines.length === 1 ? '' : 's'}`}
        </Button>
      </div>

      {priceFlags && (
        <PriceCheckDialog flagged={priceFlags} saving={saving} onConfirm={save}
          onChange={() => { focusAmount(priceFlags[0]?.key); setPriceFlags(null); }} />
      )}
    </form>
  );
};

export default BillEditForm;
