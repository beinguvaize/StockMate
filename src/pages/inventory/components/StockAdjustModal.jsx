import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Target, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

const TYPES = [
  { key: 'set',      label: 'Set to',   icon: Target,       desc: 'Override stock to exact count (e.g. after physical count)',  color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  { key: 'add',      label: 'Add',      icon: TrendingUp,   desc: 'Add units (received new stock, return from customer)',        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'subtract', label: 'Subtract', icon: TrendingDown, desc: 'Remove units (damage, loss, correction)',                    color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200'     },
];

const REASONS = [
  'Physical stock count',
  'Damaged / expired',
  'Lost / stolen',
  'Received new stock',
  'Customer return',
  'Supplier return',
  'Internal use',
  'Data correction',
  'Other',
];

const labelCls = 'text-[10px] font-semibold text-gray-500 block mb-1.5 uppercase tracking-widest';
const inputCls = 'w-full bg-canvas border border-black/8 rounded-xl px-4 py-3 font-semibold text-sm outline-none focus:ring-2 focus:ring-accent-signature/30 transition-all';

export default function StockAdjustModal({ product, currentStock, onConfirm, onClose, saving }) {
  const [type, setType]     = useState('set');
  const [qty, setQty]       = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [done, setDone]     = useState(false);

  useEffect(() => { setQty(''); setDone(false); }, [type]);

  const qtyNum     = parseFloat(qty) || 0;
  const finalReason = reason === 'Other' ? customReason.trim() : reason;

  const preview = () => {
    if (!qtyNum) return null;
    if (type === 'set')      return { after: qtyNum,                delta: qtyNum - currentStock };
    if (type === 'add')      return { after: currentStock + qtyNum, delta: qtyNum };
    if (type === 'subtract') return { after: currentStock - qtyNum, delta: -qtyNum };
  };
  const p = preview();

  const canSubmit = qtyNum > 0 && finalReason && (type !== 'subtract' || qtyNum <= currentStock);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    const delta = type === 'set' ? qtyNum - currentStock : type === 'add' ? qtyNum : -qtyNum;
    const { error } = await onConfirm(product.id, delta, finalReason);
    if (!error) setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Stock Adjustment</p>
            <h2 className="text-sm font-black text-ink-primary leading-tight">{product.name}</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Current: <span className="text-ink-primary font-black">{currentStock} {product.unit || 'pcs'}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all">
            <X size={14} />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-500" />
              </div>
            </div>
            <p className="text-sm font-black text-ink-primary">Adjustment Saved</p>
            <p className="text-xs text-gray-400">
              Stock updated to <span className="font-bold text-ink-primary">{p?.after ?? '—'} {product.unit || 'pcs'}</span>
            </p>
            <button onClick={onClose} className="btn-signature w-full flex items-center justify-center text-xs font-black">
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5">

            {/* Type selector */}
            <div>
              <label className={labelCls}>Adjustment type</label>
              <div className="flex gap-2">
                {TYPES.map(t => {
                  const Icon = t.icon;
                  const active = type === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setType(t.key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black transition-all ${
                        active
                          ? `${t.bg} ${t.border} ${t.color}`
                          : 'bg-canvas border-black/8 text-gray-400 hover:border-black/20'
                      }`}
                    >
                      <Icon size={12} strokeWidth={active ? 2.5 : 1.5} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">{TYPES.find(t => t.key === type)?.desc}</p>
            </div>

            {/* Quantity */}
            <div>
              <label className={labelCls}>
                {type === 'set' ? 'New stock count' : type === 'add' ? 'Units to add' : 'Units to remove'}
              </label>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                className={`${inputCls} text-center text-lg font-black`}
              />
              {type === 'subtract' && qtyNum > currentStock && (
                <p className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle size={11} /> Cannot exceed current stock ({currentStock})
                </p>
              )}
            </div>

            {/* Preview */}
            {p && qtyNum > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-canvas border border-black/5 rounded-xl">
                <div className="text-center">
                  <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-widest">Before</p>
                  <p className="text-lg font-black text-ink-primary">{currentStock}</p>
                </div>
                <div className="text-center">
                  <p className={`text-xs font-black ${p.delta > 0 ? 'text-emerald-600' : p.delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {p.delta > 0 ? `+${p.delta}` : p.delta}
                  </p>
                  <div className="w-10 h-px bg-black/10 mt-1" />
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-widest">After</p>
                  <p className={`text-lg font-black ${p.after < 0 ? 'text-red-500' : 'text-ink-primary'}`}>{Math.max(0, p.after)}</p>
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className={labelCls}>Reason *</label>
              <select
                value={reason}
                onChange={e => { setReason(e.target.value); setCustomReason(''); }}
                className={inputCls}
              >
                <option value="">Select reason…</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {reason === 'Other' && (
                <input
                  type="text"
                  placeholder="Describe reason…"
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                  className={`${inputCls} mt-2`}
                />
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className="btn-signature w-full flex items-center justify-center gap-2 text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : <>Save Adjustment <div className="icon-nest !w-7 !h-7"><CheckCircle2 size={14} /></div></>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
