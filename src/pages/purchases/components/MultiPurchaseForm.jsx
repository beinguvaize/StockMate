import SaveButton, { useSaveStatus } from '../../../components/motion/SaveButton';
import RollingNumber from '../../../components/motion/RollingNumber';
import React, { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Search, X, TrendingUp, TrendingDown, ArrowLeft, Banknote, Landmark, Clock } from 'lucide-react';
import Dialog from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/button';
import { Eyebrow } from '../../../components/ui/FigureStrip';
import { lbl, hint, field, fieldSm } from '../lib/ui';
import { todayISOInAppTZ } from '../../../lib/utils';
import QuickCreateProductModal from './QuickCreateProductModal';
import { lineUnitCost, priceChanges, priceKeepingMargin } from '../lib/priceChange';
import { priceCheck } from '../lib/priceCheck';
import PriceCheckDialog from './PriceCheckDialog';
import { useFocusAfterDialog } from '../lib/useFocusAfterDialog';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The step between "Save" and saving, shown only when the bill changes what
 * an item costs. Each changed item can get a new selling price here; leaving
 * the field as it is keeps the current one.
 */
const PriceChangeReview = ({ changes, prices, setPrice, onBack, onConfirm, loading, total }) => {
  const ups = changes.filter((c) => c.direction === 'UP').length;
  const downs = changes.length - ups;
  return (
    <Dialog open onClose={onBack} width={740} label="New selling prices"
      title={changes.length === 1 ? 'This bill changes an item’s cost' : `This bill changes the cost of ${changes.length} items`}
      subtitle={`${[ups && `${ups} went up`, downs && `${downs} came down`].filter(Boolean).join(', ')}. Check the selling prices before saving. Leave a price as it is to keep it.`}
      footer={(
        <>
          <Button variant="secondary" className="!flex-none px-5" onClick={onBack}><ArrowLeft /> Back to bill</Button>
          <Button onClick={onConfirm} disabled={loading} data-testid="price-change-confirm">
            {loading ? 'Saving…' : `Save purchase${total > 0 ? ` · ₹${Math.round(total).toLocaleString('en-IN')}` : ''}`}
          </Button>
        </>
      )}>
      <div className="overflow-x-auto rounded-xl shadow-[inset_0_0_0_1px_var(--color-line)]" data-testid="price-change-review">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead className="bg-tile">
            <tr className="text-left font-tight text-[11.5px] text-mute">
              <th className="px-3 py-[9px] font-semibold">Item</th>
              <th className="px-3 py-[9px] text-right font-semibold">Cost was</th>
              <th className="px-3 py-[9px] text-right font-semibold">Cost now</th>
              <th className="px-3 py-[9px] text-right font-semibold">Margin now</th>
              <th className="px-3 py-[9px] font-semibold">Selling price</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => {
              const typed = parseFloat(prices[c.productId]);
              const sell = typed > 0 ? typed : c.sellingPrice;
              const margin = sell > 0 ? ((sell - c.newCost) / sell) * 100 : null;
              const keep = priceKeepingMargin(c);
              const up = c.direction === 'UP';
              return (
                <tr key={c.productId} data-testid="price-change-row" data-direction={c.direction} className="border-t border-sep">
                  <td className="px-3 py-2.5">
                    <b className="block whitespace-nowrap font-tight text-[13.5px] font-semibold">{c.name}</b>
                    <span className={`mt-0.5 inline-flex items-center gap-1 font-tight text-[12px] font-semibold ${up ? 'text-bad-text' : 'text-good-text'}`}>
                      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {up ? 'Up' : 'Down'} {Math.abs(c.pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-tight text-mute">{inr(c.oldCost)}</td>
                  <td className="px-3 py-2.5 text-right font-tight">{inr(c.newCost)}{c.unit && <small className="text-mute"> /{c.unit}</small>}</td>
                  <td className={`px-3 py-2.5 text-right font-tight ${margin !== null && margin <= 0 ? 'text-bad-text' : ''}`}>
                    {margin === null ? '—' : `${margin.toFixed(1)}%`}
                    {margin !== null && margin <= 0 && <small className="block whitespace-nowrap font-semibold">Sells at a loss</small>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" step="0.01"
                        aria-label={`Selling price for ${c.name}`}
                        placeholder={c.sellingPrice > 0 ? c.sellingPrice.toFixed(2) : 'Set price'}
                        value={prices[c.productId] ?? ''}
                        onChange={(e) => setPrice(c.productId, e.target.value)}
                        className={`${fieldSm} !h-8 !w-[104px] text-right`} />
                      {keep !== null && Math.abs(keep - c.sellingPrice) >= 0.005 && (
                        <button type="button" onClick={() => setPrice(c.productId, keep.toFixed(2))}
                          className="whitespace-nowrap font-tight text-[11.5px] font-semibold text-amber-text hover:underline underline-offset-2">
                          {inr(keep)} keeps {c.marginBefore.toFixed(0)}%
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
};

// Searchable product combobox — plain <select> is unusable once the catalog
// grows past a few dozen items (no way to filter by typing). The results list
// is rendered in a portal (fixed position) so the surrounding form's
// overflow-hidden never clips it.
const ProductPicker = ({ products, value, onSelect, onCreateNew }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState(null);
  const inputWrapRef = useRef(null);
  const selected = products.find(p => p.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase?.().includes(q)
    ).slice(0, 50);
  }, [products, query]);

  // Keep the portal dropdown glued to the input on open / scroll / resize.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = inputWrapRef.current;
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  return (
    <div className="relative">
      <div ref={inputWrapRef} className="relative">
        {!selected && <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute pointer-events-none" />}
        <input
          type="text"
          className={`${fieldSm} ${selected ? 'pr-7' : 'pl-8 pr-7'} truncate`}
          placeholder="Search product…" aria-label="Product"
          value={open ? query : (selected?.name || '')}
          // Seed the query with the current product and select it, instead of
          // blanking the box. Clearing on focus made tabbing through a row look
          // like the product had been wiped, so it got re-entered every time.
          // Text is selected, so typing still replaces it in one keystroke.
          onFocus={e => { setQuery(selected?.name || ''); setOpen(true); e.target.select(); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {selected && !open && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); onSelect(''); setQuery(''); }}
            aria-label="Clear product"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-mute hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && rect && createPortal(
        <div
          // Anchored under the field's left edge, so that is the corner it
          // grows from. It appeared with no transition at all before, which on
          // a list that covers what you were reading reads as a glitch.
          className="menu-pop fixed z-[175] max-h-64 overflow-y-auto rounded-[14px] bg-surface p-1.5 shadow-[0_0_0_1px_rgba(17,20,24,0.06),0_18px_44px_-14px_rgba(17,20,24,0.4)]"
          style={{ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 260), '--menu-origin': 'top left' }}
        >
          {filtered.length === 0 && (
            <div className="px-2.5 py-2.5 text-[12.5px] text-mute">No matches</div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(p.id); setQuery(''); setOpen(false); }}
              data-card
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors hover:bg-tile ${p.id === value ? 'bg-amber-soft text-amber-text' : 'text-ink'}`}
            >
              {p.name}
              <span className="mt-0.5 block text-[12px] font-normal text-mute">Stock {p.stock ?? 0}{p.sku ? ` · ${p.sku}` : ''}</span>
            </button>
          ))}
          {/* Add a brand-new product without leaving the purchase form. */}
          {onCreateNew && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); const q = query.trim(); setOpen(false); setQuery(''); onCreateNew(q); }}
              className="sticky bottom-0 mt-1 flex w-full items-center gap-1.5 rounded-pill border-t border-sep bg-surface px-2.5 py-2 text-left font-tight text-[13px] font-semibold text-amber-text hover:bg-tile"
            >
              <Plus size={13} /> Create new product{query.trim() ? ` “${query.trim()}”` : ''}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

const emptyLine = () => ({
  _key:              Math.random().toString(36).slice(2),
  linked_product_id: '',
  quantity:          '',
  unit_price:        '',
  total_amount:      '',
  expiry_date:       '',
  barcodeInput:      '',
  barcodeStatus:     null, // null | 'found' | 'not_found'
});

const MultiPurchaseForm = ({ products, suppliers, warehouses = [], purchases = [], onSave, loading, onCreateProduct, initialProductId = null, onBack }) => {
  const [header, setHeader] = useState({
    supplier_id:  '',
    location_id:  '',   // target warehouse
    payment_type: 'CASH',
    paid_now: '',   // blank = the payment type decides, as before
    date:         todayISOInAppTZ(),
    bill_no:      '',   // supplier's invoice no — for GSTR-2B invoice-level match
    notes:        '',
  });

  const [lines, setLines] = useState(() => [initialProductId ? { ...emptyLine(), linked_product_id: initialProductId } : emptyLine()]);

  // Quick-create state
  const [quickCreate, setQuickCreate] = useState(null); // { lineKey, barcode }
  const [createLoading, setCreateLoading] = useState(false);

  // Barcode → product lookup
  const productByBarcode = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      if (p.barcode) map.set(String(p.barcode).trim().toLowerCase(), p);
      if (p.sku)     map.set(String(p.sku).trim().toLowerCase(), p);
    });
    return map;
  }, [products]);

  // ── Line helpers ─────────────────────────────────────────────────────────────
  const patchLine = (key, patch) => setLines(prev => prev.map(l => l._key !== key ? l : { ...l, ...patch }));

  // One definition for the column names, so the header and the accessible name
  // of each input cannot drift apart. The inputs are in a grid, not a <table>,
  // and their only visible name is the header above them -- which a screen
  // reader has no way to associate. Each one carries the name itself.
  const LINE_COLUMNS = [
    { key: 'barcode',  label: 'Barcode' },
    { key: 'product',  label: 'Product' },
    { key: 'qty',      label: 'Quantity' },
    { key: 'price',    label: 'Price each' },
    { key: 'total',    label: 'Line total' },
    { key: 'expiry',   label: 'Expiry', optional: true },
    { key: 'remove',   label: '' },
  ];

  const updateLine = (key, patch) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const updated = { ...l, ...patch };
      const q = parseFloat(updated.quantity);
      const u = parseFloat(updated.unit_price);
      const t = parseFloat(updated.total_amount);
      if ('quantity' in patch || 'unit_price' in patch) {
        if (!isNaN(q) && !isNaN(u) && q > 0) updated.total_amount = (q * u).toFixed(2);
      } else if ('total_amount' in patch) {
        if (!isNaN(q) && !isNaN(t) && q > 0) updated.unit_price = (t / q).toFixed(4);
      }
      return updated;
    }));
  };

  // Barcode lookup on Enter / blur
  const handleBarcodeSearch = (key, raw) => {
    const val = raw.trim();
    if (!val) { patchLine(key, { barcodeInput: '', barcodeStatus: null }); return; }
    const found = productByBarcode.get(val.toLowerCase());
    if (found) {
      updateLine(key, {
        barcodeInput:      val,
        barcodeStatus:     'found',
        linked_product_id: found.id,
      });
    } else {
      patchLine(key, { barcodeInput: val, barcodeStatus: 'not_found' });
    }
  };

  const removeLine = (key) => setLines(prev => prev.length > 1 ? prev.filter(l => l._key !== key) : prev);
  const addLine    = ()    => setLines(prev => [...prev, emptyLine()]);

  /**
   * Bring a newly added line into view and put the cursor in it.
   *
   * The bill grows downward inside a scrolling modal, so from roughly the
   * fourth line on, "Add line" appends a row below the fold and leaves the view
   * where it was. The row is there; it just cannot be seen, which reads as the
   * button having done nothing.
   */
  const rowsRef = useRef(null);
  const prevLineCount = useRef(lines.length);
  useEffect(() => {
    if (lines.length > prevLineCount.current) {
      const row = rowsRef.current?.lastElementChild;
      if (row) {
        const still = typeof window !== 'undefined'
          && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        row.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
        row.querySelector('input, select')?.focus();
      }
    }
    prevLineCount.current = lines.length;
  }, [lines.length]);

  // Grand total
  const grandTotal = useMemo(() =>
    lines.reduce((s, l) => s + (parseFloat(l.total_amount) || 0), 0), [lines]);

  // ── Quick-create product ─────────────────────────────────────────────────────
  const handleQuickCreate = async (productData) => {
    setCreateLoading(true);
    const newProd = await onCreateProduct(productData);
    setCreateLoading(false);
    if (!newProd) return;
    // Auto-select new product in the triggering line
    updateLine(quickCreate.lineKey, {
      linked_product_id: newProd.id,
      barcodeStatus:     'found',
    });
    setQuickCreate(null);
  };

  // ── Price changes ────────────────────────────────────────────────────────────
  // null = not reviewing; an array = the review step is showing these.
  const [review, setReview] = useState(null);
  const [newPrices, setNewPrices] = useState({});

  // ── Submit ───────────────────────────────────────────────────────────────────
  const validLines = () =>
    lines.filter(l => l.linked_product_id && parseFloat(l.quantity) > 0 && parseFloat(l.total_amount) > 0);

  // ── Price check ──────────────────────────────────────────────────────────────
  // Lines far from what the item last cost: asked about once, before anything
  // else, because a wrong product looks exactly like a price change.
  const [priceFlags, setPriceFlags] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const valid = validLines();
    if (!valid.length) return;
    const flagged = priceCheck(valid.map(l => ({ ...l, key: l._key })), purchases, products);
    if (flagged.length) { setPriceFlags(flagged); return; }
    proceed(valid);
  };

  const focusAmount = useFocusAfterDialog((key) => rowsRef.current?.querySelector(`[data-line-total="${key}"]`));
  const backToLine = () => {
    focusAmount(priceFlags?.[0]?.key);
    setPriceFlags(null);
  };

  const confirmPrices = () => {
    setPriceFlags(null);
    proceed(validLines());
  };

  const proceed = (valid) => {
    const changes = priceChanges(valid, products);
    if (changes.length) { setReview(changes); return; }
    save(valid, []);
  };

  const confirmReview = () => {
    const priceUpdates = (review || [])
      .map(c => ({ productId: c.productId, name: c.name, sellingPrice: parseFloat(newPrices[c.productId]) }))
      .filter(u => u.sellingPrice > 0 && Math.abs(u.sellingPrice - (review.find(c => c.productId === u.productId)?.sellingPrice || 0)) >= 0.005);
    save(validLines(), priceUpdates);
  };

  const saveState = useSaveStatus();
  const save = async (valid, priceUpdates) => {
    saveState.start();
    let res;
    try { res = await onSave({
      priceUpdates,
      header,
      items: valid.map(l => {
        const total = parseFloat(l.total_amount);
        let qty = parseFloat(l.quantity);
        // Bought by the alternate unit (e.g. packet): convert to the base unit
        // for storage. total_amount is the money truth, so derive unit_price
        // from the base qty to keep qty × price === total.
        const prod = products.find(p => p.id === l.linked_product_id);
        const conv = Number(prod?.conversion_factor);
        if (l.buyUnit === 'ALT' && prod?.secondary_unit && conv > 0) {
          qty = qty * conv;
        }
        return {
          linked_product_id: l.linked_product_id,
          quantity:          qty,
          unit_price:        qty > 0 ? total / qty : (parseFloat(l.unit_price) || 0),
          total_amount:      total,
          expiry_date:       l.expiry_date || null,
        };
      }),
    }); } catch (e) { saveState.fail(); throw e; }
    // Mirrors the real outcome only: handleSaveMultiPurchase reports ok.
    if (res && res.ok === false) saveState.fail(); else if (res && res.ok) saveState.ok(); else saveState.fail();
  };

  // "+ Expiry" opens a line's date field; a set date shows as a chip.
  const [expiryOpen, setExpiryOpen] = useState(() => new Set());
  const openExpiry = (key) => setExpiryOpen((s0) => new Set(s0).add(key));
  const closeExpiry = (key) => setExpiryOpen((s0) => { const n = new Set(s0); n.delete(key); return n; });
  const fmtDay = (d) => {
    const [y, m, dd] = String(d || '').split('-').map(Number);
    if (!y) return d;
    return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const supplierName = suppliers.find((x) => x.id === header.supplier_id)?.name || '';
  const productCount = lines.filter(l => l.linked_product_id).length;
  const paidTyped = parseFloat(header.paid_now);
  const PAY_OPTIONS = [
    { value: 'CASH', title: 'Cash', hint: 'Paid now, from the cash drawer', icon: Banknote },
    { value: 'CREDIT', title: 'Credit', hint: 'Pay the supplier later', icon: Clock },
    { value: 'BANK', title: 'Bank or UPI', hint: 'Transfer, UPI or cheque', icon: Landmark },
  ];
  const card = 'rounded-[14px] border border-line bg-surface px-5 py-[18px]';
  const stepNo = (n, small) => (
    <span className={`mr-2 inline-grid shrink-0 place-items-center rounded-full bg-ink font-tight font-semibold text-white ${small ? 'h-5 w-5 text-[11px]' : 'h-[22px] w-[22px] text-[12px]'}`}>{n}</span>
  );
  const sub = 'mt-1 block pl-0.5 text-[11.5px] leading-[1.35] text-mute';
  const GRID = 'grid grid-cols-[118px_minmax(0,1fr)_74px_106px_94px_22px] gap-1.5';

  return (
    <>
      <div className="m-rise mb-[18px] flex flex-wrap items-center gap-3.5" style={{ '--i': 0 }}>
        {onBack && (
          <button type="button" onClick={onBack}
            className="m-press inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink">
            <ArrowLeft size={15} /> Bills
          </button>
        )}
        <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em]">New Purchase</h3>
        <span className="text-[12px] text-mute">One supplier, many products, saved together</span>
      </div>

      <form onSubmit={handleSubmit} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_284px]">
        <div className="min-w-0">
          {/* ── 1 Details ───────────────────────────────────────────────── */}
          <div className={`${card} m-rise`} style={{ '--i': 1 }}>
            <h3 className="flex items-center font-tight text-[15px] font-semibold">{stepNo(1)}Details</h3>
            <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
              <div>
                <label htmlFor="pf-supplier" className={lbl}>Supplier <span aria-hidden="true">*</span></label>
                <select id="pf-supplier" required aria-required="true" className={field}
                  value={header.supplier_id} onChange={e => setHeader(h => ({ ...h, supplier_id: e.target.value }))}>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s0 => <option key={s0.id} value={s0.id}>{s0.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pf-billno" className={lbl}>Supplier bill no.</label>
                <input id="pf-billno" type="text" className={field}
                  placeholder="Supplier's invoice no." value={header.bill_no}
                  onChange={e => setHeader(h => ({ ...h, bill_no: e.target.value }))} />
                <span className={hint}>For GSTR-2B matching</span>
              </div>
              <div>
                <label htmlFor="pf-date" className={lbl}>Date <span aria-hidden="true">*</span></label>
                <input id="pf-date" required type="date" className={field}
                  value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="pf-warehouse" className={lbl}>Receive into</label>
                <select id="pf-warehouse" className={field}
                  value={header.location_id}
                  onChange={e => setHeader(h => ({ ...h, location_id: e.target.value }))}>
                  <option value="">Auto, main warehouse</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="pf-notes" className={lbl}>Notes</label>
                <input id="pf-notes" type="text" className={field}
                  placeholder="Remarks" aria-label="Notes" value={header.notes}
                  onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* ── 2 Items ─────────────────────────────────────────────────── */}
          <div className={`${card} m-rise mt-4`} style={{ '--i': 2 }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="flex items-center font-tight text-[15px] font-semibold">{stepNo(2)}Items</h3>
              {/* Price each and Line total fill each other in. Watching a field
                  you did not touch change its own value is alarming if nobody
                  said it would. */}
              <span className="text-[12px] text-mute">Enter either price each or line total; the other is worked out from the quantity.</span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[620px]">
                <div className={`${GRID} mt-1.5 border-b border-line pb-2 pt-3`}>
                  {LINE_COLUMNS.filter(c => c.key !== 'expiry').map(c => (
                    <span key={c.key} className={`font-tight text-[12px] font-semibold text-mute ${['qty', 'price', 'total'].includes(c.key) ? 'text-right' : ''}`}>{c.label}</span>
                  ))}
                </div>

                <div ref={rowsRef}>
                  {lines.map((line, idx) => {
                    const product = products.find(p => p.id === line.linked_product_id);
                    // Per base unit, so a packet price is not compared with a piece cost.
                    const unitCost = product ? lineUnitCost(line, product) : null;
                    const costPct = unitCost !== null && product?.costPrice > 0
                      ? ((unitCost - product.costPrice) / product.costPrice) * 100 : null;
                    const alt = line.buyUnit === 'ALT';
                    const hasAlt = product?.secondary_unit && Number(product.conversion_factor) > 0;
                    const showExpiry = expiryOpen.has(line._key);
                    const last = idx === lines.length - 1;

                    return (
                      <div key={line._key} className={`${GRID} items-start py-2.5 ${last ? '' : 'border-b border-sep'}`}>

                        {/* Barcode */}
                        <div>
                          <input
                            type="text"
                            className={`${fieldSm} !px-2 text-[12px] tracking-[-0.01em] ${
                              line.barcodeStatus === 'found' ? '!bg-[#F3FBF6] !shadow-[inset_0_0_0_1px_#A7DDB9]'
                                : line.barcodeStatus === 'not_found' ? '!bg-[#FEF6F6] !shadow-[inset_0_0_0_1px_#F5C2C2]' : ''}`}
                            placeholder="Scan or type"
                            aria-label="Barcode"
                            value={line.barcodeInput}
                            onChange={e => patchLine(line._key, { barcodeInput: e.target.value, barcodeStatus: null })}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeSearch(line._key, line.barcodeInput); } }}
                            onBlur={e => handleBarcodeSearch(line._key, e.target.value)}
                          />
                          {line.barcodeStatus === 'found' && <span className={`${sub} font-semibold !text-good-text`}>Matched</span>}
                          {line.barcodeStatus === 'not_found' && (
                            <>
                              <span className={`${sub} font-semibold !text-bad-text`}>Not found</span>
                              <button type="button" onClick={() => setQuickCreate({ lineKey: line._key, barcode: line.barcodeInput })}
                                className="pl-0.5 font-tight text-[11.5px] font-semibold text-amber-text hover:underline underline-offset-2">
                                Create product
                              </button>
                            </>
                          )}
                        </div>

                        {/* Product */}
                        <div className="min-w-0">
                          <ProductPicker
                            products={products}
                            value={line.linked_product_id}
                            onSelect={(id) => {
                              const prod = products.find(p => p.id === id);
                              updateLine(line._key, {
                                linked_product_id: id,
                                barcodeInput:      prod?.barcode || prod?.sku || line.barcodeInput,
                                barcodeStatus:     id ? 'found' : null,
                              });
                            }}
                            onCreateNew={(name) => setQuickCreate({ lineKey: line._key, barcode: '', name })}
                          />
                          {(product || line.expiry_date || showExpiry) && (
                            <span className={sub}>
                              {product && <>Stock {product.stock ?? 0}{product.costPrice > 0 && ` · last ₹${product.costPrice}`}</>}
                              {/* Expiry (optional): stamped on this line's batch after it saves. */}
                              {line.expiry_date && !showExpiry ? (
                                <>{product && ' · '}
                                  <span className="inline-flex items-center gap-1 rounded-pill bg-well py-px pl-[7px] pr-1 font-tight text-[11px] font-semibold text-ink-2">
                                    <button type="button" onClick={() => openExpiry(line._key)} title="Change the expiry date">Expires {fmtDay(line.expiry_date)}</button>
                                    <button type="button" aria-label="Remove the expiry date" onClick={() => updateLine(line._key, { expiry_date: '' })}><X size={10} /></button>
                                  </span>
                                </>
                              ) : !showExpiry && (
                                <>{product && ' · '}<button type="button" onClick={() => openExpiry(line._key)}
                                  className="font-tight text-[11.5px] font-semibold text-amber-text hover:underline underline-offset-2">+ Expiry</button></>
                              )}
                            </span>
                          )}
                          {!product && !line.expiry_date && !showExpiry && (
                            <button type="button" onClick={() => openExpiry(line._key)}
                              className="mt-1 pl-0.5 font-tight text-[11.5px] font-semibold text-amber-text hover:underline underline-offset-2">+ Expiry</button>
                          )}
                          {showExpiry && (
                            <input type="date" aria-label="Expiry date (optional)" title="Leave blank unless this stock expires"
                              className={`${fieldSm} mt-1 !h-8 !w-[150px] text-[12px]`} autoFocus
                              value={line.expiry_date}
                              onChange={e => updateLine(line._key, { expiry_date: e.target.value })}
                              onBlur={() => closeExpiry(line._key)} />
                          )}
                          {unitCost !== null && product?.sellingPrice > 0 && unitCost > product.sellingPrice && (
                            <span className={`${sub} !mt-px font-semibold !text-bad-text`}>Above sell price ₹{product.sellingPrice}</span>
                          )}
                        </div>

                        {/* Qty + optional buy-by-alternate-unit toggle */}
                        <div>
                          <input required type="number" min="0" placeholder="0" className={`${fieldSm} text-right`}
                            aria-label="Quantity"
                            value={line.quantity}
                            onChange={e => updateLine(line._key, { quantity: e.target.value })} />
                          {product && (hasAlt ? (() => {
                            const conv = Number(product.conversion_factor);
                            const q = parseFloat(line.quantity);
                            return (
                              <span className={`${sub} !pr-0.5 text-right whitespace-nowrap`}>
                                <button type="button" title={`Switch to ${alt ? product.unit : product.secondary_unit}`}
                                  onClick={() => updateLine(line._key, { buyUnit: alt ? 'BASE' : 'ALT' })}
                                  className={`rounded-pill px-[7px] py-px font-tight text-[11px] font-semibold ${alt ? 'bg-amber-soft text-amber-text' : 'bg-well text-ink-2'}`}>
                                  {alt ? product.secondary_unit : product.unit}
                                </button>
                                {alt && q > 0 && <> = {(q * conv).toLocaleString()} {product.unit}</>}
                              </span>
                            );
                          })() : (
                            <span className={`${sub} !pr-0.5 text-right`}>{product.unit}</span>
                          ))}
                        </div>

                        {/* Price each */}
                        <div>
                          <input type="number" min="0" step="0.01" placeholder="0.00" className={`${fieldSm} text-right`}
                            aria-label="Price each"
                            title="Type this or the line total — the other is worked out for you"
                            value={line.unit_price}
                            onChange={e => updateLine(line._key, { unit_price: e.target.value })} />
                          {product?.secondary_unit && alt && (
                            <span className={`${sub} !pr-0.5 text-right whitespace-nowrap`}>per {product.secondary_unit}</span>
                          )}
                          {costPct !== null && Math.abs(unitCost - product.costPrice) >= 0.005 && (
                            <span data-testid="line-cost-change"
                              className={`${sub} !pr-0.5 text-right whitespace-nowrap font-semibold ${costPct > 0 ? '!text-bad-text' : '!text-good-text'}`}>
                              {costPct > 0 ? '▲' : '▼'} {Math.abs(costPct).toFixed(1)}% vs ₹{product.costPrice}
                            </span>
                          )}
                        </div>

                        {/* Line total */}
                        <input required type="number" min="0" step="0.01" placeholder="0.00" className={`${fieldSm} text-right`}
                          aria-label="Line total" data-line-total={line._key}
                          title="Type this or the price each — the other is worked out for you"
                          value={line.total_amount}
                          onChange={e => updateLine(line._key, { total_amount: e.target.value })} />

                        {/* Remove */}
                        <button type="button" onClick={() => removeLine(line._key)} disabled={lines.length === 1}
                          aria-label="Remove this line"
                          className="m-press grid h-[34px] place-items-center rounded-lg text-mute hover:text-bad-text disabled:opacity-30">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3">
              <button type="button" onClick={addLine}
                className="inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-2">
                <Plus size={14} /> Add another product
              </button>
              <span className="text-[12px] text-mute">Empty lines are left out when saving</span>
            </div>
          </div>
        </div>

        {/* ── Total and payment ─────────────────────────────────────────── */}
        <aside className={`${card} m-rise lg:sticky lg:top-3`} style={{ '--i': 2 }}>
          <Eyebrow>Bill total</Eyebrow>
          <div className="mb-0.5 mt-1.5 font-tight text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums">
            <RollingNumber text={`₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />
          </div>
          <span className="text-[12px] text-mute">
            {productCount} product{productCount === 1 ? '' : 's'}{supplierName ? ` from ${supplierName}` : ''}
          </span>

          <div className="mb-2 mt-[18px] flex items-center font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">{stepNo(3, true)}Payment</div>
          <div role="radiogroup" aria-label="Payment type" className="flex flex-col gap-1.5">
            {PAY_OPTIONS.map((o) => {
              const on = header.payment_type === o.value;
              return (
                <button key={o.value} type="button" role="radio" aria-checked={on} data-card
                  onClick={() => setHeader(h => ({ ...h, payment_type: o.value }))}
                  className={`m-press flex items-center gap-[11px] rounded-xl px-3 py-2.5 text-left ${on ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile'}`}>
                  <i className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${on ? 'shadow-[inset_0_0_0_5px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1.5px_#CFCFCD]'}`} />
                  <span className="min-w-0">
                    <b className="block font-tight text-[13.5px] font-semibold">{o.title}</b>
                    <small className="block text-[12px] leading-snug text-mute">{o.hint}</small>
                  </span>
                  <o.icon size={18} strokeWidth={1.8} className="ml-auto shrink-0 text-ink-2" />
                </button>
              );
            })}
          </div>

          {/* Part payment. A bill is often settled with some cash now and the
              rest on credit, which the payment types alone cannot say. */}
          <label htmlFor="pf-paidnow" className={`${lbl} mt-3.5`}>Paid now, optional</label>
          <input id="pf-paidnow" aria-label="Amount paid now" type="number" step="0.01" min="0"
            className={field}
            placeholder={header.payment_type === 'CREDIT' ? 'Nothing paid yet' : grandTotal.toFixed(2)}
            value={header.paid_now}
            onChange={e => setHeader(h => ({ ...h, paid_now: e.target.value }))} />

          <div className="mt-3.5 rounded-xl bg-tile px-3.5 py-3">
            <div className="flex justify-between py-[3px] text-[13px] text-body">
              <span>Grand total</span><span className="font-tight font-medium tabular-nums text-ink-2">{inr(grandTotal)}</span>
            </div>
            {paidTyped > 0 && grandTotal > 0 && (() => {
              const due = Math.max(0, grandTotal - paidTyped);
              return (
                <>
                  <div className="flex justify-between py-[3px] text-[13px] text-body">
                    <span>Paid now</span><span className="font-tight font-medium tabular-nums text-good-text">{inr(paidTyped)}</span>
                  </div>
                  {due > 0.005
                    ? <div className="mt-1.5 flex justify-between border-t border-line pt-[9px] font-tight text-[14px] font-semibold text-amber-text">
                        <span>Pending to supplier</span><span className="tabular-nums">{inr(due)}</span>
                      </div>
                    : <div className="mt-1.5 border-t border-line pt-[9px] font-tight text-[13px] font-semibold text-good-text">Paid in full</div>}
                </>
              );
            })()}
          </div>

          <SaveButton
            type="submit"
            variant="amber"
            size="lg"
            status={saveState.status}
            idleLabel={`Save ${productCount} item${productCount !== 1 ? 's' : ''}${grandTotal > 0 ? ` · ₹${Math.round(grandTotal).toLocaleString('en-IN')}` : ''}`}
            disabled={loading || !header.supplier_id || lines.every(l => !l.linked_product_id)}
            className="mt-4 w-full font-tight !font-semibold !text-[14px]"
          />
        </aside>
      </form>

      {review && (
        <PriceChangeReview
          changes={review}
          prices={newPrices}
          setPrice={(id, v) => setNewPrices(p => ({ ...p, [id]: v }))}
          onBack={() => setReview(null)}
          onConfirm={confirmReview}
          loading={loading}
          total={grandTotal}
        />
      )}

      {priceFlags && (
        <PriceCheckDialog flagged={priceFlags} onChange={backToLine} onConfirm={confirmPrices} saving={loading} />
      )}

      {/* Quick-create product */}
      {quickCreate && (
        <QuickCreateProductModal
          barcode={quickCreate.barcode}
          initialName={quickCreate.name}
          loading={createLoading}
          onSave={handleQuickCreate}
          onCancel={() => setQuickCreate(null)}
        />
      )}
    </>
  );
};

export default MultiPurchaseForm;
