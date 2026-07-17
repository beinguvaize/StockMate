/**
 * VanLoadBuilder
 * Premium POS-style UI for loading stock from the warehouse onto a vehicle.
 * Mirrors VanSaleBuilder's layout (left product list, right load list).
 *
 * Props:
 *  vehicle        — target vehicle object ({ name, plate, plateNumber })
 *  warehouseItems — [{ productId, productName, available, image }]
 *  onSubmit       — async fn({ items:[{productId,quantity}] }) → { success, error }
 *  onClose        — fn() to close
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import {
  Search, Plus, Minus, X, Package, Truck, Check,
  CheckCircle2, ArrowRight, Warehouse,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

const VanLoadBuilder = ({ vehicle, warehouseItems = [], onSubmit, onClose, mode = 'load' }) => {
  useDialogClose(onClose);
  const unload = mode === 'unload';
  const L = {
    title:   unload ? 'Unload Van'  : 'Load Van',
    list:    unload ? 'Unload List' : 'Load List',
    search:  unload ? 'Search van products…' : 'Search warehouse products…',
    empty:   unload ? 'No stock on van.'     : 'No warehouse stock available.',
    tap:     unload ? 'Tap products to unload' : 'Tap products to load',
    inWord:  unload ? 'to unload' : 'to load',
    stockTag: unload ? 'on van'   : 'in WH',
    done:    unload ? 'Van Unloaded' : 'Van Loaded',
    cta:     unload ? 'Unload Vehicle' : 'Load Vehicle',
    cap:     unload ? 'Only %n on van' : 'Only %n in warehouse',
  };
  const { addNotification } = useNotifications();

  const [loadList, setLoadList]     = useState([]);   // [{productId, name, quantity, max}]
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone]             = useState(false);

  const searchRef = useRef(null);
  useEffect(() => { searchRef.current?.focus(); }, []);

  const stockMap = useMemo(() => {
    const m = {};
    warehouseItems.forEach(i => { m[i.productId] = i.available; });
    return m;
  }, [warehouseItems]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return warehouseItems;
    return warehouseItems.filter(p => (p.productName || '').toLowerCase().includes(q));
  }, [warehouseItems, searchTerm]);

  const maxOf = (pid) => stockMap[pid] ?? 0;

  const addItem = (item) => {
    const avail = maxOf(item.productId);
    setLoadList(prev => {
      const ex = prev.find(c => c.productId === item.productId);
      if (ex) {
        if (ex.quantity >= avail) {
          addNotification(L.cap.replace('%n', avail), 'error');
          return prev;
        }
        return prev.map(c => c.productId === item.productId
          ? { ...c, quantity: c.quantity + 1 } : c);
      }
      if (avail <= 0) { addNotification(`${item.productName} out of stock`, 'error'); return prev; }
      return [...prev, { productId: item.productId, name: item.productName, quantity: 1, max: avail }];
    });
  };

  const stepQty = (pid, delta) => {
    const avail = maxOf(pid);
    setLoadList(prev => prev.map(c => {
      if (c.productId !== pid) return c;
      const next = Math.max(0, c.quantity + delta);
      if (next > avail) { addNotification(L.cap.replace('%n', avail), 'error'); return c; }
      return { ...c, quantity: next };
    }).filter(c => c.quantity > 0));
  };

  const setQty = (pid, val) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    const avail = maxOf(pid);
    if (qty === 0) { setLoadList(prev => prev.filter(c => c.productId !== pid)); return; }
    if (qty > avail) {
      addNotification(L.cap.replace('%n', avail), 'error');
      setLoadList(prev => prev.map(c => c.productId === pid ? { ...c, quantity: avail } : c));
      return;
    }
    setLoadList(prev => prev.map(c => c.productId === pid ? { ...c, quantity: qty } : c));
  };

  const removeItem = (pid) => setLoadList(prev => prev.filter(c => c.productId !== pid));

  const totalUnits = loadList.reduce((s, c) => s + c.quantity, 0);

  const handleConfirm = async () => {
    if (submitting || !loadList.length) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const result = await onSubmit({
        items: loadList.map(c => ({ productId: c.productId, quantity: c.quantity })),
      });
      if (result?.success === false) {
        setSubmitError(result.error?.message || result.error?.toString() || 'Load failed');
        return;
      }
      setDone(true);
    } catch (err) {
      setSubmitError(err?.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  const vanName  = vehicle?.name || 'Vehicle';
  const vanPlate = vehicle?.plate || vehicle?.plateNumber || '';

  /* ── Success screen — single-page, premium ──────────────────────────── */
  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
        {/* Hero band */}
        <div className="bg-emerald-500 text-white shrink-0">
          <div className="max-w-5xl mx-auto w-full px-6 py-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <CheckCircle2 size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-70">{L.done}</div>
              <div className="text-2xl font-black tabular-nums leading-tight">{totalUnits} units</div>
              <div className="text-[11px] opacity-70">{vanName} · {loadList.length} products</div>
            </div>
            <button onClick={onClose}
              className="shrink-0 px-6 h-11 rounded-xl bg-white text-emerald-700 font-black text-sm hover:bg-white/90 transition-all">
              Done
            </button>
          </div>
        </div>

        {/* Product grid — fits one page via multi-column layout */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full px-6 py-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {loadList.map(c => (
                <div key={c.productId}
                  className="flex items-center justify-between gap-2 bg-white border border-black/5 rounded-xl px-3 py-2.5 shadow-sm">
                  <span className="text-xs font-semibold text-ink-primary truncate">{c.name}</span>
                  <span className="text-xs font-black tabular-nums text-emerald-600 shrink-0">×{c.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main UI ────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col">
      <div className="w-full flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-black/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <Truck size={15} className="text-blue-600" />
            </div>
            <div>
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{L.title}</div>
              <div className="text-sm font-black text-ink-primary leading-tight">
                {vanName}
                {vanPlate && <span className="ml-2 text-[10px] font-mono text-gray-400">{vanPlate}</span>}
              </div>
            </div>
          </div>
          <div className="flex-1" />
          <button onClick={onClose}
            className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center text-gray-400 hover:text-ink-primary hover:border-black/20 transition-all">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

          {/* LEFT: warehouse products */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                ref={searchRef}
                type="text"
                placeholder={L.search}
                className="w-full bg-white rounded-2xl py-4 pl-12 pr-4 border border-black/5 outline-none focus:ring-2 focus:ring-accent-signature/20 shadow-sm font-medium"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-px overflow-y-auto pr-1 pb-4">
              {filtered.length === 0 && (
                <div className="py-16 text-center text-sm text-gray-400">
                  {L.empty}
                </div>
              )}
              {filtered.map(item => {
                const stock = item.available ?? 0;
                const out   = stock <= 0;
                const inList = loadList.find(c => c.productId === item.productId);
                return (
                  <div key={item.productId}
                    onClick={() => !out && addItem(item)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border group ${
                      out
                        ? 'opacity-40 cursor-not-allowed border-transparent'
                        : inList
                        ? 'border-accent-signature/30 bg-accent-signature/5 hover:bg-accent-signature/8'
                        : 'border-transparent bg-white/60 hover:bg-white hover:border-accent-signature/20 hover:shadow-sm'
                    }`}>
                    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-white border border-gray-300 shadow-sm">
                      <span className="text-[11px] font-black text-ink-primary/30 uppercase">
                        {(item.productName || '?').slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-primary truncate leading-tight">{item.productName}</div>
                      {inList && <div className="text-[10px] text-accent-signature font-bold">{inList.quantity} {L.inWord}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-xs font-semibold ${out ? 'text-red-400' : 'text-gray-400'}`}>
                        {out ? 'OUT' : `${stock} ${L.stockTag}`}
                      </div>
                    </div>
                    {inList && (
                      <div className="w-5 h-5 rounded-full bg-accent-signature text-button-text text-[9px] font-black flex items-center justify-center shrink-0">
                        {inList.quantity}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: load list */}
          <div className="w-full lg:w-[480px] xl:w-[520px] glass-panel !p-0 flex flex-col overflow-hidden border-l border-black/5 shadow-2xl">
            <div className="px-4 py-3 border-b border-black/5 flex justify-between items-center bg-canvas/30">
              <div className="flex items-center gap-2">
                <Warehouse size={18} className="text-accent-signature" />
                <h2 className="font-semibold text-sm text-ink-primary">{L.list}</h2>
              </div>
              <div className="bg-accent-signature text-button-text text-[10px] font-black px-2 py-1 rounded-pill ring-4 ring-accent-signature/10">
                {totalUnits} units
              </div>
            </div>

            {loadList.length > 0 && (
              <div className="grid grid-cols-[1fr_120px_20px] gap-2 px-4 py-2 bg-canvas/50 border-b border-black/5">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Product</span>
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest text-center">Qty</span>
                <span />
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loadList.map(item => (
                <div key={item.productId}
                  className="grid grid-cols-[1fr_120px_20px] gap-2 items-center px-4 py-2.5 border-b border-black/5 last:border-0 hover:bg-canvas/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink-primary truncate uppercase">{item.name}</div>
                    <div className="text-[10px] text-gray-400 font-medium">max {item.max}</div>
                  </div>
                  <div className="flex items-center justify-center gap-0.5 bg-white border border-black/8 rounded-lg p-0.5">
                    <button onClick={() => stepQty(item.productId, -1)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-canvas transition-all text-ink-primary shrink-0">
                      <Minus size={9} strokeWidth={3} />
                    </button>
                    <input type="number" min="1" value={item.quantity}
                      onChange={e => setQty(item.productId, e.target.value)}
                      className="w-12 text-center text-sm font-black text-ink-primary bg-transparent outline-none tabular-nums" />
                    <button onClick={() => stepQty(item.productId, 1)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-canvas transition-all text-ink-primary shrink-0">
                      <Plus size={9} strokeWidth={3} />
                    </button>
                  </div>
                  <button onClick={() => removeItem(item.productId)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex items-center justify-center">
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
              {loadList.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none p-10 text-center">
                  <Package size={48} className="mb-4" />
                  <div className="text-xs font-bold uppercase tracking-widest">{L.tap}</div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-black/5 bg-canvas/10">
              {submitError && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-3">
                  <X size={13} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-bold leading-snug">{submitError}</p>
                </div>
              )}
              <button
                disabled={!loadList.length || submitting}
                onClick={handleConfirm}
                className="w-full h-14 rounded-xl bg-ink-primary text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-ink-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xl shadow-ink-primary/20">
                {submitting
                  ? <><span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Working…</>
                  : <><ArrowRight size={16} /> {L.cta} ({totalUnits})</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VanLoadBuilder;
