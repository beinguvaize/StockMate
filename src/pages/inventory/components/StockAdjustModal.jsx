import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Target, AlertCircle, Loader2, CheckCircle2, ArrowRight, Minus, Plus } from 'lucide-react';

const TYPES = [
  { key: 'set',      label: 'Set to',   icon: Target,       desc: 'Override to exact count after physical count', color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', accent: 'bg-violet-600' },
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
  const [type, setType]           = useState('set');
  const [qty, setQty]             = useState('');
  const [reason, setReason]       = useState('');
  const [customReason, setCR]     = useState('');
  const [done, setDone]           = useState(false);

  useEffect(() => { setQty(''); setDone(false); }, [type]);

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

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    const delta = type === 'set' ? qtyNum - currentStock : type === 'add' ? qtyNum : -qtyNum;
    const { error } = await onConfirm(product.id, delta, finalReason);
    if (!error) setDone(true);
  };

  const stepQty = (dir) => {
    const next = Math.max(0, (parseFloat(qty) || 0) + dir);
    setQty(String(next));
  };

  /* ── Success screen ── */
  if (done) return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-8 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 size={32} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-base font-black text-ink-primary">Stock Updated</p>
          <p className="text-xs text-gray-400 mt-1">
            <span className="font-bold text-ink-primary">{product.name}</span> is now{' '}
            <span className="font-black text-emerald-600">{p?.after ?? '—'} {product.unit || 'pcs'}</span>
          </p>
        </div>
        <button onClick={onClose} className="btn-signature w-full text-xs font-black">
          Done
        </button>
      </div>
    </div>
  );

  /* ── Main modal ── */
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-8 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-5 border-b border-black/5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-block text-[9px] font-black uppercase tracking-[0.15em] text-gray-400 mb-1.5">
              Stock Adjustment
            </span>
            <h2 className="text-sm font-black text-ink-primary leading-tight truncate">{product.name}</h2>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] text-gray-400 font-medium">Current stock</span>
              <span className="px-2 py-0.5 rounded-full bg-black/5 text-[10px] font-black text-ink-primary">
                {currentStock} {product.unit || 'pcs'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-xl border border-black/8 flex items-center justify-center hover:bg-black/5 transition-all text-gray-400"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">

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
                      : 'bg-canvas border-transparent hover:border-black/10 text-gray-400'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                    active ? `${t.accent} text-white` : 'bg-black/5'
                  }`}>
                    <Icon size={15} strokeWidth={2} />
                  </div>
                  <span className="text-[10px] font-black leading-none">{t.label}</span>
                  {active && (
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${t.accent}`} />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 -mt-3">{activeType.desc}</p>

          {/* ── Quantity ── */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-3">
              {type === 'set' ? 'New count' : type === 'add' ? 'Units to add' : 'Units to remove'}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => stepQty(-1)}
                className="w-11 h-11 shrink-0 rounded-2xl border border-black/8 bg-canvas flex items-center justify-center text-gray-500 hover:bg-black/5 hover:border-black/20 transition-all active:scale-95"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                className="flex-1 text-center text-2xl font-black bg-canvas border border-black/8 rounded-2xl py-3 outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all"
              />
              <button
                onClick={() => stepQty(1)}
                className="w-11 h-11 shrink-0 rounded-2xl border border-black/8 bg-canvas flex items-center justify-center text-gray-500 hover:bg-black/5 hover:border-black/20 transition-all active:scale-95"
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
            <div className="flex items-center gap-3 px-4 py-3.5 bg-canvas border border-black/5 rounded-2xl">
              <div className="flex-1 text-center">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Before</p>
                <p className="text-lg font-black text-ink-primary">{currentStock}</p>
                <p className="text-[9px] text-gray-400 font-medium">{product.unit || 'pcs'}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                  p.delta > 0 ? 'bg-emerald-50 text-emerald-600' :
                  p.delta < 0 ? 'bg-rose-50 text-rose-600' :
                  'bg-black/5 text-gray-400'
                }`}>
                  {p.delta > 0 ? `+${p.delta}` : p.delta}
                </span>
                <ArrowRight size={14} className="text-gray-300" />
              </div>
              <div className="flex-1 text-center">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">After</p>
                <p className={`text-lg font-black ${p.after < 0 ? 'text-rose-500' : 'text-ink-primary'}`}>
                  {Math.max(0, p.after)}
                </p>
                <p className="text-[9px] text-gray-400 font-medium">{product.unit || 'pcs'}</p>
              </div>
            </div>
          )}

          {/* ── Reason ── */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
              Reason <span className="text-rose-400">*</span>
            </label>
            <select
              value={reason}
              onChange={e => { setReason(e.target.value); setCR(''); }}
              className="w-full bg-canvas border border-black/8 rounded-2xl px-4 py-3 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all appearance-none"
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
                className="w-full bg-canvas border border-black/8 rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent-signature/25 transition-all mt-2"
              />
            )}
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="btn-signature w-full flex items-center justify-center gap-2 text-xs font-black h-12 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><CheckCircle2 size={14} /> Save Adjustment</>
            }
          </button>
        </div>

      </div>
    </div>
  );
}
