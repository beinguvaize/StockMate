import React, { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, CheckCircle2, Barcode, AlertCircle, Search, X } from 'lucide-react';
import { todayISOInAppTZ } from '../../../lib/utils';
import QuickCreateProductModal from './QuickCreateProductModal';

// Searchable product combobox — plain <select> is unusable once the catalog
// grows past a few dozen items (no way to filter by typing).
const ProductPicker = ({ products, value, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
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

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
        <input
          type="text"
          className={`w-full bg-white border border-gray-300 shadow-sm rounded-lg pl-6 pr-6 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20 ${selected ? '' : 'text-gray-400'}`}
          placeholder="Search product…"
          value={open ? query : (selected?.name || '')}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {selected && !open && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); onSelect(''); setQuery(''); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
          >
            <X size={11} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-black/10 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">No matches</div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(p.id); setQuery(''); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-bold hover:bg-canvas transition-colors border-b border-black/[0.03] last:border-0 ${p.id === value ? 'text-accent-signature bg-accent-signature/5' : 'text-ink-primary'}`}
            >
              {p.name}
              <span className="block text-[9px] font-medium text-gray-400 mt-0.5">Stock: {p.stock ?? 0}{p.sku ? ` · ${p.sku}` : ''}</span>
            </button>
          ))}
        </div>
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

const MultiPurchaseForm = ({ products, suppliers, warehouses = [], onSave, loading, onCreateProduct }) => {
  const [header, setHeader] = useState({
    supplier_id:  '',
    location_id:  '',   // target warehouse
    payment_type: 'CASH',
    date:         todayISOInAppTZ(),
    bill_no:      '',   // supplier's invoice no — for GSTR-2B invoice-level match
    notes:        '',
  });

  const [lines, setLines] = useState([emptyLine()]);

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

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    const valid = lines.filter(l => l.linked_product_id && parseFloat(l.quantity) > 0 && parseFloat(l.total_amount) > 0);
    if (!valid.length) return;
    onSave({
      header,
      items: valid.map(l => ({
        linked_product_id: l.linked_product_id,
        quantity:          parseFloat(l.quantity),
        unit_price:        parseFloat(l.unit_price) || (parseFloat(l.total_amount) / parseFloat(l.quantity)),
        total_amount:      parseFloat(l.total_amount),
        expiry_date:       l.expiry_date || null,
      })),
    });
  };

  const inp = 'w-full bg-white border border-gray-300 shadow-sm rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums';

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-canvas rounded-2xl border border-black/5">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Supplier <span className="text-red-400">*</span></label>
            <select required className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={header.supplier_id} onChange={e => setHeader(h => ({ ...h, supplier_id: e.target.value }))}>
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              Receive Into Warehouse
              {warehouses.length === 0 && <span className="ml-1 text-gray-400">(auto)</span>}
            </label>
            <select
              className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={header.location_id}
              onChange={e => setHeader(h => ({ ...h, location_id: e.target.value }))}
            >
              <option value="">Auto (main warehouse)</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Type</label>
            <select className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={header.payment_type} onChange={e => setHeader(h => ({ ...h, payment_type: e.target.value }))}>
              <option value="CASH">Cash (paid now)</option>
              <option value="CREDIT">Credit (pay later)</option>
              <option value="BANK">Bank / UPI</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Date</label>
            <input required type="date" className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={header.date} onChange={e => setHeader(h => ({ ...h, date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Supplier Bill No</label>
            <input type="text" className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
              placeholder="Supplier's invoice no. (for GSTR-2B)" value={header.bill_no}
              onChange={e => setHeader(h => ({ ...h, bill_no: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
            <input type="text" className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
              placeholder="Remarks..." value={header.notes}
              onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} />
          </div>
        </div>

        {/* ── Line Items ───────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-black/5 overflow-hidden">

          {/* Column headers */}
          <div className="grid grid-cols-[140px_1fr_72px_92px_92px_112px_32px] gap-2 bg-canvas px-4 py-2.5 border-b border-black/5">
            {['Barcode / SKU', 'Product', 'Qty', 'Unit Price', 'Total', 'Expiry', ''].map(h => (
              <span key={h} className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-black/[0.04]">
            {lines.map((line) => {
              const product = products.find(p => p.id === line.linked_product_id);
              const unitCost = parseFloat(line.unit_price) || null;

              return (
                <div key={line._key} className="grid grid-cols-[140px_1fr_72px_92px_92px_112px_32px] gap-2 items-start px-4 py-3">

                  {/* Barcode input */}
                  <div>
                    <div className="relative">
                      <Barcode size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                      <input
                        type="text"
                        className={`w-full bg-canvas border rounded-lg pl-6 pr-2 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-accent-signature/20 ${
                          line.barcodeStatus === 'found'     ? 'border-emerald-300 bg-emerald-50' :
                          line.barcodeStatus === 'not_found' ? 'border-red-200 bg-red-50' :
                          'border-black/5'
                        }`}
                        placeholder="Scan / type…"
                        value={line.barcodeInput}
                        onChange={e => patchLine(line._key, { barcodeInput: e.target.value, barcodeStatus: null })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeSearch(line._key, line.barcodeInput); } }}
                        onBlur={e => handleBarcodeSearch(line._key, e.target.value)}
                      />
                    </div>
                    {line.barcodeStatus === 'not_found' && (
                      <button
                        type="button"
                        onClick={() => setQuickCreate({ lineKey: line._key, barcode: line.barcodeInput })}
                        className="mt-1 flex items-center gap-1 text-[8px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest"
                      >
                        <AlertCircle size={9} /> Create product
                      </button>
                    )}
                    {line.barcodeStatus === 'found' && (
                      <p className="mt-1 text-[8px] font-bold text-emerald-600 uppercase tracking-widest">✓ Matched</p>
                    )}
                  </div>

                  {/* Product picker — searchable */}
                  <div>
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
                    />
                    {product && (
                      <p className="text-[8px] font-bold text-gray-400 mt-1 ml-1">
                        Stock: {product.stock ?? 0}
                        {product.costPrice > 0 && ` · Last ₹${product.costPrice}`}
                      </p>
                    )}
                  </div>

                  {/* Qty */}
                  <input required type="number" min="0" placeholder="0" className={inp}
                    value={line.quantity}
                    onChange={e => updateLine(line._key, { quantity: e.target.value })} />

                  {/* Unit Price */}
                  <div>
                    <input type="number" min="0" step="0.01" placeholder="0.00" className={inp}
                      value={line.unit_price}
                      onChange={e => updateLine(line._key, { unit_price: e.target.value })} />
                    {unitCost !== null && product?.costPrice > 0 && (
                      <p className={`text-[8px] font-bold mt-1 ml-1 ${unitCost > product.costPrice ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {unitCost > product.costPrice ? '▲' : '▼'} ₹{product.costPrice}
                      </p>
                    )}
                    {unitCost !== null && product?.sellingPrice > 0 && unitCost > product.sellingPrice && (
                      <p className="text-[8px] font-bold mt-1 ml-1 text-red-600">
                        ⚠ Above sell price ₹{product.sellingPrice}
                      </p>
                    )}
                  </div>

                  {/* Total */}
                  <input required type="number" min="0" step="0.01" placeholder="0.00" className={inp}
                    value={line.total_amount}
                    onChange={e => updateLine(line._key, { total_amount: e.target.value })} />

                  {/* Expiry (optional — creates a dated batch) */}
                  <input type="date" title="Expiry date (optional)" className={inp}
                    value={line.expiry_date}
                    onChange={e => updateLine(line._key, { expiry_date: e.target.value })} />

                  {/* Remove */}
                  <button type="button" onClick={() => removeLine(line._key)} disabled={lines.length === 1}
                    className="mt-1 w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-20">
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add row + grand total */}
          <div className="px-4 py-3 border-t border-black/5 flex items-center justify-between">
            <button type="button" onClick={addLine}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-accent-signature bg-accent-signature/10 hover:bg-accent-signature/20 transition-colors">
              <Plus size={12} /> Add Row
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grand Total</span>
              <span className="text-lg font-black text-ink-primary tabular-nums">
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !header.supplier_id || lines.every(l => !l.linked_product_id)}
          className="w-full h-12 flex items-center justify-center gap-2 bg-ink-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-sm disabled:opacity-40"
        >
          {loading
            ? <span className="animate-pulse">Saving…</span>
            : <><CheckCircle2 size={14} /> Save {lines.filter(l => l.linked_product_id).length} Item{lines.filter(l => l.linked_product_id).length !== 1 ? 's' : ''}</>
          }
        </button>
      </form>

      {/* Quick-create product modal */}
      {quickCreate && (
        <QuickCreateProductModal
          barcode={quickCreate.barcode}
          loading={createLoading}
          onSave={handleQuickCreate}
          onCancel={() => setQuickCreate(null)}
        />
      )}
    </>
  );
};

export default MultiPurchaseForm;
