import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Target, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

const TYPES = [
  { key: 'set',      label: 'Set to',    icon: Target,      desc: 'Override stock to exact count (e.g. after physical count)',  color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  { key: 'add',      label: 'Add',       icon: TrendingUp,  desc: 'Add units (received new stock, return from customer)',        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'subtract', label: 'Subtract',  icon: TrendingDown, desc: 'Remove units (damage, loss, correction)',                   color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200'     },
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

export default function StockAdjustModal({ product, currentStock, onConfirm, onClose, saving }) {
  const [type, setType]       = useState('set');
  const [qty, setQty]         = useState('');
  const [reason, setReason]   = useState('');
  const [customReason, setCustomReason] = useState('');
  const [done, setDone]       = useState(false);

  useEffect(() => { setQty(''); setDone(false); }, [type]);

  const qtyNum    = parseFloat(qty) || 0;
  const finalReason = reason === 'Other' ? customReason.trim() : reason;

  const preview = () => {
    if (!qtyNum) return null;
    if (type === 'set')      return { after: qtyNum,               delta: qtyNum - currentStock };
    if (type === 'add')      return { after: currentStock + qtyNum, delta: qtyNum };
    if (type === 'subtract') return { after: currentStock - qtyNum, delta: -qtyNum };
  };
  const p = preview();

  const canSubmit = qtyNum > 0 && finalReason && (type !== 'subtract' || qtyNum <= currentStock);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    const delta = type === 'set'
      ? qtyNum - currentStock
      : type === 'add'
        ? qtyNum
        : -qtyNum;
    const { error } = await onConfirm(product.id, delta, finalReason);
    if (!error) setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-gray-900 px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Stock Adjustment</p>
            <h2 className="text-lg font-black text-white leading-tight">{product.name}</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Current stock: <span className="text-white font-bold">{currentStock} {product.unit || 'pcs'}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
            </div>
            <p className="text-lg font-black text-gray-900">Adjustment Saved</p>
            <p className="text-sm text-gray-500">
              Stock updated to <span className="font-bold text-gray-900">{p?.after ?? '—'} {product.unit || 'pcs'}</span>
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5">

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => {
                const Icon = t.icon;
                const active = type === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setType(t.key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all text-center ${
                      active ? `${t.bg} ${t.border} ${t.color}` : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={18} strokeWidth={active ? 2.5 : 1.5} />
                    <span className="text-xs font-bold">{t.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 -mt-2">{TYPES.find(t => t.key === type)?.desc}</p>

            {/* Quantity */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                {type === 'set' ? 'New stock count' : type === 'add' ? 'Units to add' : 'Units to remove'}
              </label>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 text-2xl font-black text-gray-900 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 transition-colors text-center"
              />
              {type === 'subtract' && qtyNum > currentStock && (
                <p className="text-xs text-red-500 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> Cannot subtract more than current stock ({currentStock})
                </p>
              )}
            </div>

            {/* Preview */}
            {p && qtyNum > 0 && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold">Before</p>
                  <p className="text-xl font-black text-gray-900">{currentStock}</p>
                </div>
                <div className="text-center">
                  <p className={`text-xs font-bold ${p.delta > 0 ? 'text-emerald-600' : p.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {p.delta > 0 ? `+${p.delta}` : p.delta}
                  </p>
                  <div className="w-12 h-0.5 bg-gray-200 mt-1" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold">After</p>
                  <p className={`text-xl font-black ${p.after < 0 ? 'text-red-600' : 'text-gray-900'}`}>{Math.max(0, p.after)}</p>
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Reason *</label>
              <select
                value={reason}
                onChange={e => { setReason(e.target.value); setCustomReason(''); }}
                className="w-full px-4 py-3 text-sm font-semibold text-gray-900 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 transition-colors bg-white"
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
                  className="mt-2 w-full px-4 py-3 text-sm font-semibold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 transition-colors"
                />
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className="w-full flex items-center justify-center gap-2 py-4 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving
                ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
                : 'Save Adjustment'
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
