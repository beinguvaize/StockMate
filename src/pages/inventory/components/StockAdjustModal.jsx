import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { X, TrendingUp, TrendingDown, Target, AlertCircle, Loader2, CheckCircle2, ArrowRight, Minus, Plus, ChevronLeft } from 'lucide-react';

const TYPES = [
  { key: 'set',      label: 'Set to',   icon: Target,       desc: 'Override to exact count after physical count', color: 'text-accent-signature', bg: 'bg-accent-signature/10', border: 'border-accent-signature/25', accent: 'bg-accent-signature' },
  { key: 'add',      label: 'Add',      icon: TrendingUp,   desc: 'Add units — new stock or customer return',      color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'bg-emerald-600' },
  { key: 'subtract', label: 'Remove',   icon: TrendingDown, desc: 'Remove units — damage, loss or correction',     color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200',    accent: 'bg-rose-600'    },
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

export default function StockAdjustModal({ product, currentStock, onConfirm, onClose, saving }) {
  useDialogClose(onClose);
  const [type, setType]           = useState('set');
  const [qty, setQty]             = useState('');
  const [reason, setReason]       = useState('');
  const [customReason, setCR]     = useState('');
  const [unitCost, setUnitCost]   = useState('');
  const [done, setDone]           = useState(false);
  // Last price actually PAID for this product — the newest batch that traces to
  // a purchase. Adjustments used to fall back to products.costPrice (a blend of
  // open batches, or a typed number), so stock added by adjustment was costed
  // from an average rather than from a bill, and the batch it created carried no
  // purchase reference. Defaulting to the real last price makes that number
  // answerable: "₹150, bought 10 Jul on PUR-6EI5RO".
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

  const preview = () => {
    if (!qtyNum) return null;
    if (type === 'set')      return { after: qtyNum,                delta: qtyNum - currentStock };
    if (type === 'add')      return { after: currentStock + qtyNum, delta: qtyNum };
    if (type === 'subtract') return { after: currentStock - qtyNum, delta: -qtyNum };
  };
  const p = preview();

  const overStock  = type === 'subtract' && qtyNum > currentStock;
  const canSubmit  = qtyNum > 0 && finalReason && !overStock;

  const isAddition = (type === 'add') || (type === 'set' && qtyNum > currentStock);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    const delta = type === 'set' ? qtyNum - currentStock : type === 'add' ? qtyNum : -qtyNum;
    const cost = parseFloat(unitCost);
    const priceArg = isAddition && Number.isFinite(cost) && cost > 0 ? cost : undefined;
    const { error } = await onConfirm(product.id, delta, finalReason, undefined, priceArg);
    if (!error) setDone(true);
  };

  const stepQty = (dir) => {
    const next = Math.max(0, (parseFloat(qty) || 0) + dir);
    setQty(String(next));
  };

  /* ── Success screen ── */
  if (done) return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border/60 bg-card shrink-0">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full border border-border/60 hover:bg-canvas transition-all text-foreground shrink-0">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Stock Adjustment</h1>
        <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-muted-foreground shrink-0"><X size={16} /></button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm w-full px-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Stock Updated</p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{product.name}</span> is now{' '}
              <span className="font-semibold text-emerald-600">{p?.after ?? '—'} {product.unit || 'pcs'}</span>
            </p>
          </div>
          <button onClick={onClose} className="btn-signature w-full text-xs font-semibold h-12 rounded-2xl">Done</button>
        </div>
      </div>
    </div>,
    document.body
  );

  /* ── Main modal ── */
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border/60 bg-card shrink-0">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full border border-border/60 hover:bg-canvas transition-all text-foreground shrink-0">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground leading-tight">Stock Adjustment</h1>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">
            {product.name} · Current: {currentStock} {product.unit || 'pcs'}
          </p>
        </div>
        <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-muted-foreground shrink-0"><X size={16} /></button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-6 space-y-6">

          {/* ── Type pills ── */}
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(t => {
              const Icon  = t.icon;
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={`relative flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-2xl border-2 transition-all ${
                    active
                      ? `${t.bg} ${t.border} ${t.color}`
                      : 'bg-canvas border-transparent hover:border-border text-muted-foreground'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                    active ? `${t.accent} text-white` : 'bg-black/5'
                  }`}>
                    <Icon size={15} strokeWidth={2} />
                  </div>
                  <span className="text-[10px] font-semibold leading-none">{t.label}</span>
                  {active && (
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${t.accent}`} />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground -mt-3">{activeType.desc}</p>

          {/* ── Quantity ── */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-3">
              {type === 'set' ? 'New count' : type === 'add' ? 'Units to add' : 'Units to remove'}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => stepQty(-1)}
                className="w-11 h-11 shrink-0 rounded-2xl border border-black/8 bg-canvas flex items-center justify-center text-muted-foreground hover:bg-black/5 hover:border-black/20 transition-all active:scale-95"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                className="flex-1 text-center text-2xl font-semibold bg-card border border-border shadow-sm rounded-2xl py-3 outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all"
              />
              <button
                onClick={() => stepQty(1)}
                className="w-11 h-11 shrink-0 rounded-2xl border border-black/8 bg-canvas flex items-center justify-center text-muted-foreground hover:bg-black/5 hover:border-black/20 transition-all active:scale-95"
              >
                <Plus size={14} />
              </button>
            </div>
            {overStock && (
              <p className="text-[10px] text-rose-500 font-semibold mt-2 flex items-center gap-1">
                <AlertCircle size={11} /> Cannot exceed current stock ({currentStock} {product.unit || 'pcs'})
              </p>
            )}
          </div>

          {/* ── Preview bar ── */}
          {p && qtyNum > 0 && !overStock && (
            <div className="flex items-center gap-3 px-4 py-3.5 bg-card border border-border shadow-sm rounded-2xl">
              <div className="flex-1 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mb-0.5">Before</p>
                <p className="text-lg font-semibold text-foreground">{currentStock}</p>
                <p className="text-[9px] text-muted-foreground font-medium">{product.unit || 'pcs'}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  p.delta > 0 ? 'bg-emerald-50 text-emerald-600' :
                  p.delta < 0 ? 'bg-rose-50 text-rose-600' :
                  'bg-black/5 text-muted-foreground'
                }`}>
                  {p.delta > 0 ? `+${p.delta}` : p.delta}
                </span>
                <ArrowRight size={14} className="text-muted-foreground" />
              </div>
              <div className="flex-1 text-center">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mb-0.5">After</p>
                <p className={`text-lg font-semibold ${p.after < 0 ? 'text-rose-500' : 'text-foreground'}`}>
                  {Math.max(0, p.after)}
                </p>
                <p className="text-[9px] text-muted-foreground font-medium">{product.unit || 'pcs'}</p>
              </div>
            </div>
          )}

          {/* ── Reason ── */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
              Reason <span className="text-rose-400">*</span>
            </label>
            <select
              value={reason}
              onChange={e => { setReason(e.target.value); setCR(''); }}
              className="w-full bg-card border border-border shadow-sm rounded-2xl px-4 py-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all appearance-none"
            >
              <option value="">Select a reason…</option>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Other' && (
              <input
                type="text"
                placeholder="Describe the reason…"
                value={customReason}
                onChange={e => setCR(e.target.value)}
                className="w-full bg-card border border-border shadow-sm rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all mt-2"
              />
            )}
          </div>

          {/* ── Purchase price (only when adding stock) ── */}
          {isAddition && qtyNum > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-2 gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Purchase price / unit
                </label>
                {/* Name the source of the default so the figure is answerable. */}
                {lastBuy && (
                  <span className="text-[10px] text-muted-foreground truncate">
                    last bought {formatDate(lastBuy.date)} · {lastBuy.ref}
                  </span>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder={`Cost each — blank uses saved ₹${Number(product.costPrice ?? product.cost ?? 0)}`}
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
                className="w-full bg-card border border-border shadow-sm rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all"
              />
              {/* Stock added without a cost still creates a batch, but priced at
                  the product's saved cost. On products stocked this way and
                  never purchased, that saved figure is a typed-in assertion —
                  which is how ~31% of COGS ended up resting on unverified
                  numbers. Say so at the moment of entry. */}
              {unitCost.trim() === '' ? (
                <p className="text-[11px] text-accent-signature-hover font-medium mt-1.5 px-1">
                  Leaving this blank costs these {qtyNum} {product.unit || 'units'} at the saved
                  ₹{Number(product.costPrice ?? product.cost ?? 0)} each
                  {lastBuy ? `, not the ₹${lastBuy.cost} you last paid` : ''}. Profit on them is only as
                  accurate as that figure — enter the supplier's price if you have the bill.
                </p>
              ) : (
                <p className="text-[11px] text-emerald-700 font-medium mt-1.5 px-1">
                  Creates a cost batch of {qtyNum} {product.unit || 'units'} at ₹{Number(unitCost)} each
                  ({formatCurrency(qtyNum * Number(unitCost || 0))} total), so profit on these units is exact.
                </p>
              )}
            </div>
          )}

        </div>

        {/* ── Submit ── */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          className="btn-signature w-full flex items-center justify-center gap-2 text-xs font-semibold h-12 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : <><CheckCircle2 size={14} /> Save Adjustment</>
          }
        </button>

      </div>
    </div>,
    document.body
  );
}
