import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X, TrendingUp, TrendingDown, RotateCcw, Search, Filter, History } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const TYPE_CONFIG = {
  IN:       { label: 'Stock In',    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', Icon: TrendingUp },
  OUT:      { label: 'Stock Out',   color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200',    Icon: TrendingDown },
  ADJUST:   { label: 'Adjustment', color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-200',  Icon: RotateCcw },
  TRANSFER: { label: 'Transfer',   color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    Icon: RotateCcw },
};

const typeFor = (type = '') => TYPE_CONFIG[type.toUpperCase()] || TYPE_CONFIG.ADJUST;

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function StockHistoryModal({ tenantId, products, onClose }) {
  const [log,     setLog]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from('movement_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!error && data) setLog(data);
        setLoading(false);
      });
  }, [tenantId]);

  const productName = (id, fallback) => {
    if (fallback) return fallback;
    return products?.find(p => p.id === id)?.name || id || '—';
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return log.filter(r => {
      const name = (r.product_name || productName(r.product_id, '')).toLowerCase();
      const reason = (r.reason || '').toLowerCase();
      const matchSearch = !q || name.includes(q) || reason.includes(q);
      const matchType = typeFilter === 'ALL' || (r.type || '').toUpperCase() === typeFilter;
      return matchSearch && matchType;
    });
  }, [log, search, typeFilter]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">

      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-black/5 bg-white shrink-0">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full border border-black/5 hover:bg-canvas transition-all text-ink-primary shrink-0">
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-ink-primary leading-tight">Stock History</h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
            {loading ? 'Loading…' : `${filtered.length} movements`}
          </p>
        </div>
        <button onClick={onClose} className="ml-auto w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-gray-400 shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-black/5 bg-white shrink-0 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product or reason…"
            className="w-full pl-8 pr-4 py-2 text-xs font-semibold bg-canvas border border-black/8 rounded-xl outline-none focus:ring-2 focus:ring-accent-signature/25"
          />
        </div>
        <div className="flex gap-1.5">
          {['ALL', 'IN', 'OUT', 'ADJUST', 'TRANSFER'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border ${
                typeFilter === t
                  ? 'bg-ink-primary text-white border-transparent'
                  : 'bg-canvas border-black/8 text-gray-500 hover:border-black/20'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-300">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-accent-signature rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-300">
              <History size={48} strokeWidth={1.5} />
              <p className="text-sm font-bold mt-4 text-gray-400">No movements found</p>
              <p className="text-xs text-gray-300 mt-1">Stock adjustments and sales will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(row => {
                const cfg = typeFor(row.type);
                const Icon = cfg.Icon;
                const name = productName(row.product_id, row.product_name);
                const qty = Number(row.quantity) || 0;
                const isOut = (row.type || '').toUpperCase() === 'OUT';
                return (
                  <div key={row.id} className="flex items-center gap-4 px-4 py-3.5 bg-white rounded-2xl border border-black/5 hover:border-black/10 transition-all">
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl ${cfg.bg} ${cfg.border} border flex items-center justify-center shrink-0`}>
                      <Icon size={15} className={cfg.color} />
                    </div>

                    {/* Product + reason */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-ink-primary truncate">{name}</p>
                      {row.reason && (
                        <p className="text-[10px] text-gray-400 font-medium truncate mt-0.5">{row.reason}</p>
                      )}
                    </div>

                    {/* Type badge */}
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border} hidden sm:inline`}>
                      {cfg.label}
                    </span>

                    {/* Qty */}
                    <span className={`text-base font-black tabular-nums w-16 text-right ${isOut ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {isOut ? '-' : '+'}{qty}
                    </span>

                    {/* Date */}
                    <span className="text-[10px] text-gray-400 font-medium w-36 text-right hidden md:block">
                      {fmt(row.created_at || row.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
