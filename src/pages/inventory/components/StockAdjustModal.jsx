import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate, cn } from '../../../lib/utils';
import Dialog from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/button';
import WriteFailure from '../../../components/invoices/WriteFailure';
import { Label, Hint, Select, Notice, BigQty, BeforeAfter, BASide } from './parts';

/**
 * Adjust stock (approved inventory-12).
 *
 * Only the look is new. The change still goes to `onConfirm` as the same
 * delta, reason and optional unit cost as before, which the page hands to
 * adjust_inventory_atomic: the database moves the balance, consumes FIFO
 * batches on a reduction, and makes a cost batch on an addition with a price.
 * No location is passed, as before.
 */
const TYPES = [
  { key: 'set',      label: 'Set to', desc: 'Exact count after a physical count' },
  { key: 'add',      label: 'Add',    desc: 'New stock or a customer return' },
  { key: 'subtract', label: 'Remove', desc: 'Damage, loss or a correction' },
];

const REASONS = [
  'Physical stock count',
  'Received new stock',
  'Customer return',
  'Supplier return',
  'Damaged / expired',
  'Lost / stolen',
  'Internal use',
  'Data correction',
  'Other',
];

export default function StockAdjustModal({ product, currentStock, onConfirm, onClose, onReread, saving }) {
  const [type, setType]           = useState('set');
  const [qty, setQty]             = useState('');
  const [reason, setReason]       = useState('');
  const [customReason, setCR]     = useState('');
  const [unitCost, setUnitCost]   = useState('');
  const [done, setDone]           = useState(false);
  const [failure, setFailure]     = useState(null);
  // Last price actually PAID for this product — the newest batch that traces to
  // a purchase. Defaulting to the real last price makes the cost of added stock
  // answerable: "₹150, bought 10 Jul on PUR-…".
  const [lastBuy, setLastBuy]     = useState(null); // { cost, date, ref }

  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    supabase
      .from('product_batches')
      .select('unit_cost, received_date, purchase_id')
      .eq('product_id', product.id)
      .not('purchase_id', 'is', null)
      .order('received_date', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled || error || !data?.length) return;
        const b = data[0];
        setLastBuy({ cost: Number(b.unit_cost), date: b.received_date, ref: b.purchase_id });
      });
    return () => { cancelled = true; };
  }, [product?.id]);

  // Pre-fill the cost when adding stock, so the default is the real last price
  // rather than a silent fallback. Still fully editable.
  useEffect(() => {
    setQty(''); setDone(false);
    setUnitCost(type === 'add' && lastBuy?.cost > 0 ? String(lastBuy.cost) : '');
  }, [type, lastBuy]);

  const activeType  = TYPES.find(t => t.key === type);
  const qtyNum      = parseFloat(qty) || 0;
  const finalReason = reason === 'Other' ? customReason.trim() : reason;
  const unit        = (product.unit || 'pcs').toUpperCase();

  const preview = () => {
    if (!qtyNum) return null;
    if (type === 'set')      return { after: qtyNum,                delta: qtyNum - currentStock };
    if (type === 'add')      return { after: currentStock + qtyNum, delta: qtyNum };
    if (type === 'subtract') return { after: currentStock - qtyNum, delta: -qtyNum };
    return null;
  };
  const p = preview();

  const overStock  = type === 'subtract' && qtyNum > currentStock;
  const canSubmit  = qtyNum > 0 && finalReason && !overStock;

  const isAddition = (type === 'add') || (type === 'set' && qtyNum > currentStock);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setFailure(null);
    const delta = type === 'set' ? qtyNum - currentStock : type === 'add' ? qtyNum : -qtyNum;
    const cost = parseFloat(unitCost);
    const priceArg = isAddition && Number.isFinite(cost) && cost > 0 ? cost : undefined;
    try {
      const { error } = await onConfirm(product.id, delta, finalReason, undefined, priceArg);
      // A refusal used to leave the dialog sitting there with no word of why.
      if (error) { setFailure(error); return; }
      setDone(true);
    } catch (err) {
      setFailure(err);
    }
  };

  const stepQty = (dir) => {
    const next = Math.max(0, (parseFloat(qty) || 0) + dir);
    setQty(String(next));
  };

  if (done) {
    return (
      <Dialog open onClose={onClose} width={440} title="Stock updated" subtitle={product.name}
        footer={<Button onClick={onClose}>Done</Button>}>
        <div className="flex items-center gap-3 rounded-xl bg-good-soft px-3.5 py-3 text-[13px] text-good-text">
          <CheckCircle2 size={20} className="shrink-0" />
          <span><b className="font-tight font-semibold">{product.name}</b> is now <b className="font-tight font-semibold tabular-nums">{p?.after ?? '—'} {unit}</b></span>
        </div>
      </Dialog>
    );
  }

  const unitsLabel = type === 'set' ? 'New count' : type === 'add' ? 'Units to add' : 'Units to remove';
  const savedCost = Number(product.costPrice ?? product.cost ?? 0);

  return (
    <Dialog open onClose={onClose} width={560} title="Adjust Stock" subtitle={`${product.name} · now ${currentStock} ${unit}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>{saving ? 'Saving…' : 'Save adjustment'}</Button>
        </>
      )}>
      <div role="radiogroup" aria-label="Kind of adjustment" className="grid grid-cols-3 gap-2">
        {TYPES.map(t => {
          const on = type === t.key;
          return (
            <button key={t.key} type="button" data-card role="radio" aria-checked={on} onClick={() => setType(t.key)}
              className={cn('m-press flex select-none flex-col items-start gap-[3px] rounded-xl bg-surface px-[13px] py-[11px] text-left',
                on ? (t.key === 'add' ? 'shadow-[inset_0_0_0_2px_var(--color-good)]' : t.key === 'subtract' ? 'shadow-[inset_0_0_0_2px_var(--color-bad)]' : 'shadow-[inset_0_0_0_2px_var(--color-ink)]')
                  : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile')}>
              <b className="font-tight text-[13.5px] font-semibold">{t.label}</b>
              <small className="text-[12px] text-mute">{t.desc}</small>
            </button>
          );
        })}
      </div>
      <span className="sr-only">{activeType.desc}</span>

      <Label htmlFor="adj-qty" className="mt-4">{unitsLabel}</Label>
      <BigQty id="adj-qty" label={unitsLabel} value={qty} onChange={setQty} onStep={stepQty} />
      {overStock && (
        <p className="mt-2 flex items-center gap-1 text-[12.5px] font-medium text-bad-text">
          <AlertCircle size={13} /> Cannot exceed current stock ({currentStock} {unit})
        </p>
      )}
      {p && qtyNum > 0 && !overStock && (
        <BeforeAfter
          left={<BASide label="Before" value={currentStock} unit={unit} />}
          right={<BASide label="After" value={Math.max(0, p.after)} unit={unit} />}
          delta={p.delta > 0 ? `+${p.delta}` : `${p.delta}`}
          deltaTone={p.delta < 0 ? 'r' : p.delta === 0 ? 'a' : 'g'} />
      )}

      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="adj-reason">Reason *</Label>
          <Select id="adj-reason" value={reason} onChange={e => { setReason(e.target.value); setCR(''); }}>
            <option value="">Select a reason…</option>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
          {reason === 'Other' && (
            <input type="text" aria-label="Describe the reason" placeholder="Describe the reason…" value={customReason}
              onChange={e => setCR(e.target.value)}
              className="mt-2 h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
          )}
        </div>
        {/* Purchase price, only when adding stock */}
        {isAddition && qtyNum > 0 && (
          <div>
            <Label htmlFor="adj-cost">Purchase price per unit</Label>
            <div className="flex h-9 items-center gap-1.5 rounded-[10px] bg-surface px-3 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
              <span className="text-[13.5px] text-mute">₹</span>
              <input id="adj-cost" type="number" min="0" step="0.01" inputMode="decimal"
                placeholder={`Blank uses the saved ₹${savedCost}`}
                value={unitCost} onChange={e => setUnitCost(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] tabular-nums text-ink outline-none placeholder:text-mute" />
            </div>
            {/* Name the source of the default so the figure is answerable. */}
            {lastBuy && <Hint>Last bought {formatDate(lastBuy.date)} · {lastBuy.ref}</Hint>}
          </div>
        )}
      </div>

      {isAddition && qtyNum > 0 && (
        unitCost.trim() === '' ? (
          // Stock added without a cost still creates a batch, priced at the
          // product's saved cost. On a product never purchased, that figure
          // is a typed-in assertion. Say so at the moment of entry.
          <Notice tone="a" className="mt-3">
            Leaving this blank costs these {qtyNum} {unit} at the saved ₹{savedCost} each
            {lastBuy ? `, not the ₹${lastBuy.cost} you last paid` : ''}. Profit on them is only as
            accurate as that figure, so enter the supplier's price if you have the bill.
          </Notice>
        ) : (
          <Notice tone="g" className="mt-3">
            Makes a cost batch of {qtyNum} {unit} at ₹{Number(unitCost)} each
            ({formatCurrency(qtyNum * Number(unitCost || 0))} in all), so profit on these units is exact.
          </Notice>
        )
      )}

      <WriteFailure error={failure} noun="adjustment" onReread={onReread} className="mt-3" />
    </Dialog>
  );
}
