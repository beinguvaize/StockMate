import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Tag, ChevronDown, ChevronUp, AlertCircle, ChevronLeft } from 'lucide-react';

const TIERS = [
  { id: 'WHOLESALE',   label: 'Wholesale',   color: 'blue',   desc: 'Trade buyers, bulk purchasers' },
  { id: 'DISTRIBUTOR', label: 'Distributor', color: 'purple', desc: 'Regional distributors, sub-dealers' },
];

const TIER_STYLES = {
  blue:   { tab: 'bg-blue-600 text-white', tabInactive: 'bg-blue-50 text-blue-700 hover:bg-blue-100', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  purple: { tab: 'bg-purple-600 text-white', tabInactive: 'bg-purple-50 text-purple-700 hover:bg-purple-100', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const QTY_BREAKS = [1, 5, 10, 20, 50, 100, 200, 500];

const EMPTY_FORM = { productId: '', minQty: 1, price: '' };

/**
 * PriceListsModal
 * Props:
 *   isOpen        boolean
 *   onClose       () => void
 *   products      Product[]       from useInventory
 *   priceLists    PriceListEntry[]  from useOrders
 *   onUpsert      ({ productId, tier, minQty, price }) => Promise<{success, error}>
 *   onDelete      ({ productId, tier, minQty }) => Promise<{success, error}>
 *   currencySymbol string
 */
const PriceListsModal = ({ isOpen, onClose, products, priceLists, onUpsert, onDelete, currencySymbol = '' }) => {
  const [activeTier, setActiveTier]   = useState('WHOLESALE');
  const [form,       setForm]         = useState(EMPTY_FORM);
  const [saving,     setSaving]       = useState(false);
  const [error,      setError]        = useState(null);
  const [expandedId, setExpandedId]   = useState(null); // productId
  const [search,     setSearch]       = useState('');

  // Entries for active tier
  const tierEntries = useMemo(
    () => priceLists.filter(p => p.tier === activeTier),
    [priceLists, activeTier],
  );

  // Group by product
  const grouped = useMemo(() => {
    const map = {};
    tierEntries.forEach(e => {
      if (!map[e.product_id]) map[e.product_id] = [];
      map[e.product_id].push(e);
    });
    // Sort each product's breaks by min_qty asc
    Object.values(map).forEach(arr => arr.sort((a, b) => a.min_qty - b.min_qty));
    return map;
  }, [tierEntries]);

  // Products that have at least one entry + any product in search
  const productName = (id) => products.find(p => p.id === id)?.name || id;

  const productList = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p =>
      !q || (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const handleSave = async () => {
    if (!form.productId) { setError('Select a product.'); return; }
    if (!form.price || Number(form.price) <= 0) { setError('Enter valid price.'); return; }
    setSaving(true); setError(null);
    const { success, error: err } = await onUpsert({
      productId: form.productId,
      tier:      activeTier,
      minQty:    Number(form.minQty),
      price:     Number(form.price),
    });
    setSaving(false);
    if (success) {
      setForm(EMPTY_FORM);
    } else {
      setError(err?.message || 'Failed to save.');
    }
  };

  const handleDelete = async (entry) => {
    await onDelete({ productId: entry.product_id, tier: entry.tier, minQty: entry.min_qty });
  };

  if (!isOpen) return null;

  const tier = TIERS.find(t => t.id === activeTier);
  const style = TIER_STYLES[tier.color];

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas animate-fade-in">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-black/5 bg-white shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-black/5 hover:bg-canvas transition-all text-ink-primary shrink-0"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-ink-primary leading-tight">Price Lists</h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
            Wholesale &amp; distributor tier pricing with quantity breaks
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-gray-400 shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col gap-4">

        {/* Tier tabs */}
        <div className="flex gap-2">
          {TIERS.map(t => {
            const st = TIER_STYLES[t.color];
            const active = t.id === activeTier;
            return (
              <button
                key={t.id}
                onClick={() => { setActiveTier(t.id); setForm(EMPTY_FORM); setError(null); }}
                className={`px-4 py-2 rounded-full text-xs font-black transition-all border ${
                  active ? st.tab + ' border-transparent' : st.tabInactive + ' border-transparent'
                }`}
              >
                {t.label}
                <span className="ml-1.5 opacity-60">
                  {priceLists.filter(p => p.tier === t.id).length > 0
                    ? `(${new Set(priceLists.filter(p => p.tier === t.id).map(p => p.product_id)).size} products)`
                    : ''}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[10px] font-semibold text-gray-400">{tier.desc}</div>

        <div className="flex flex-col gap-4">

          {/* Add form */}
          <div className="bg-gray-50 rounded-2xl p-4 border border-black/5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Add / Update Price Break</p>
            <div className="grid grid-cols-12 gap-2 items-end">
              {/* Product */}
              <div className="col-span-5">
                <label className="text-[10px] font-semibold text-gray-500 block mb-1">Product</label>
                <select
                  value={form.productId}
                  onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                  className="w-full text-xs font-semibold bg-white border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-black/30 appearance-none"
                >
                  <option value="">Select product…</option>
                  {productList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                  ))}
                </select>
              </div>
              {/* Min Qty */}
              <div className="col-span-3">
                <label className="text-[10px] font-semibold text-gray-500 block mb-1">Min Qty</label>
                <select
                  value={form.minQty}
                  onChange={e => setForm(f => ({ ...f, minQty: Number(e.target.value) }))}
                  className="w-full text-xs font-semibold bg-white border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-black/30 appearance-none"
                >
                  {QTY_BREAKS.map(q => <option key={q} value={q}>{q}+</option>)}
                </select>
              </div>
              {/* Price */}
              <div className="col-span-3">
                <label className="text-[10px] font-semibold text-gray-500 block mb-1">Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full text-xs font-semibold bg-white border border-black/10 rounded-xl pl-6 pr-3 py-2.5 outline-none focus:border-black/30 tabular-nums"
                  />
                </div>
              </div>
              {/* Save btn */}
              <div className="col-span-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full h-[38px] bg-ink-primary text-white rounded-xl flex items-center justify-center hover:bg-ink-primary/80 transition-colors disabled:opacity-40"
                >
                  {saving ? (
                    <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 mt-2 text-[11px] font-semibold text-red-500">
                <AlertCircle size={12} /> {error}
              </div>
            )}
          </div>

          {/* Existing entries */}
          {Object.keys(grouped).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-300">
              <Tag size={40} strokeWidth={1.5} />
              <p className="text-sm font-bold mt-3 text-gray-400">No {tier.label.toLowerCase()} prices set</p>
              <p className="text-xs text-gray-300 mt-1">Add price breaks above</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(grouped).map(([productId, entries]) => {
                const name = productName(productId);
                const basePrice = products.find(p => p.id === productId)?.sellingPrice;
                const isOpen = expandedId === productId;
                return (
                  <div key={productId} className="rounded-2xl border border-black/5 overflow-hidden bg-white">
                    {/* Product header row */}
                    <button
                      onClick={() => setExpandedId(isOpen ? null : productId)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
                          <Tag size={14} className="text-gray-400" />
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-black text-ink-primary">{name}</div>
                          {basePrice != null && (
                            <div className="text-[10px] font-semibold text-gray-400">
                              Base retail: {currencySymbol}{Number(basePrice).toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${style.badge}`}>
                          {entries.length} break{entries.length !== 1 ? 's' : ''}
                        </span>
                        {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                      </div>
                    </button>

                    {/* Price break rows */}
                    {isOpen && (
                      <div className="border-t border-black/5 divide-y divide-black/5">
                        {entries.map(entry => (
                          <div key={`${entry.product_id}-${entry.min_qty}`} className="flex items-center justify-between px-4 py-3 bg-gray-50/50">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black text-gray-500 w-16">{entry.min_qty}+ units</span>
                              <span className="text-sm font-black text-ink-primary tabular-nums">
                                {currencySymbol}{Number(entry.price).toFixed(2)}
                              </span>
                              {basePrice != null && Number(entry.price) < Number(basePrice) && (
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  -{Math.round((1 - Number(entry.price) / Number(basePrice)) * 100)}% off retail
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDelete(entry)}
                              className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors group"
                            >
                              <Trash2 size={13} className="text-gray-300 group-hover:text-red-400 transition-colors" />
                            </button>
                          </div>
                        ))}
                        {/* Quick-add row for this product */}
                        <div className="px-4 py-2 bg-white">
                          <button
                            onClick={() => setForm(f => ({ ...f, productId }))}
                            className="text-[10px] font-black text-gray-400 hover:text-ink-primary transition-colors flex items-center gap-1"
                          >
                            <Plus size={10} /> Add break for this product
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
};

export default PriceListsModal;
