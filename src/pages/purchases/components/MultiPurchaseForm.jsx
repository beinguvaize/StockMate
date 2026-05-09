import React, { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, PackagePlus } from 'lucide-react';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';

const emptyLine = () => ({
  _key:             Math.random().toString(36).slice(2),
  linked_product_id: '',
  quantity:          '',
  unit_price:        '',
  total_amount:      '',
});

const MultiPurchaseForm = ({ products, suppliers, onSave, loading }) => {
  const [header, setHeader] = useState({
    supplier_id:  '',
    payment_type: 'CASH',
    date:         todayISOInAppTZ(),
    notes:        '',
  });

  const [lines, setLines] = useState([emptyLine()]);

  // ── Line helpers ────────────────────────────────────────────────────────────
  const updateLine = (key, patch) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const updated = { ...l, ...patch };
      // auto-calc
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

  const removeLine = (key) => setLines(prev => prev.length > 1 ? prev.filter(l => l._key !== key) : prev);
  const addLine    = ()    => setLines(prev => [...prev, emptyLine()]);

  // ── Grand total ─────────────────────────────────────────────────────────────
  const grandTotal = useMemo(() =>
    lines.reduce((s, l) => s + (parseFloat(l.total_amount) || 0), 0),
    [lines]
  );

  // ── Submit ──────────────────────────────────────────────────────────────────
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
      })),
    });
  };

  const selectedSupplier = suppliers.find(s => s.id === header.supplier_id);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* ── Purchase Header ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-canvas rounded-2xl border border-black/5">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Supplier <span className="text-red-400">*</span></label>
          <select
            required
            className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={header.supplier_id}
            onChange={e => setHeader(h => ({ ...h, supplier_id: e.target.value }))}
          >
            <option value="">Select supplier...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Type</label>
          <select
            className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={header.payment_type}
            onChange={e => setHeader(h => ({ ...h, payment_type: e.target.value }))}
          >
            <option value="CASH">Cash (paid now)</option>
            <option value="CREDIT">Credit (pay later)</option>
            <option value="BANK">Bank / UPI</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Date</label>
          <input
            required
            type="date"
            className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={header.date}
            onChange={e => setHeader(h => ({ ...h, date: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
          <input
            type="text"
            className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="Invoice no., remarks..."
            value={header.notes}
            onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
          />
        </div>
      </div>

      {/* ── Line Items ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/5 overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 bg-canvas px-4 py-2.5 border-b border-black/5">
          {['Product', 'Qty', 'Unit Price', 'Total', ''].map(h => (
            <span key={h} className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-black/[0.04]">
          {lines.map((line, idx) => {
            const product = products.find(p => p.id === line.linked_product_id);
            const unitCost = parseFloat(line.unit_price) || null;
            return (
              <div key={line._key} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-start px-4 py-3">
                {/* Product */}
                <div>
                  <select
                    required
                    className="w-full bg-canvas border border-black/5 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
                    value={line.linked_product_id}
                    onChange={e => updateLine(line._key, { linked_product_id: e.target.value })}
                  >
                    <option value="">Select product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {product && (
                    <p className="text-[8px] font-bold text-gray-400 mt-1 ml-1">
                      SKU: {product.sku} · Stock: {product.stock ?? 0}
                      {product.costPrice > 0 && ` · Last cost: ₹${product.costPrice}`}
                    </p>
                  )}
                </div>

                {/* Qty */}
                <input
                  required
                  type="number" min="0" placeholder="0"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                  value={line.quantity}
                  onChange={e => updateLine(line._key, { quantity: e.target.value })}
                />

                {/* Unit Price */}
                <div>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    className="w-full bg-canvas border border-black/5 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                    value={line.unit_price}
                    onChange={e => updateLine(line._key, { unit_price: e.target.value })}
                  />
                  {unitCost !== null && product?.costPrice > 0 && (
                    <p className={`text-[8px] font-bold mt-1 ml-1 ${unitCost > product.costPrice ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {unitCost > product.costPrice ? '▲' : '▼'} prev ₹{product.costPrice}
                    </p>
                  )}
                </div>

                {/* Total */}
                <input
                  required
                  type="number" min="0" step="0.01" placeholder="0.00"
                  className="w-full bg-canvas border border-black/5 rounded-lg p-2 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                  value={line.total_amount}
                  onChange={e => updateLine(line._key, { total_amount: e.target.value })}
                />

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeLine(line._key)}
                  disabled={lines.length === 1}
                  className="mt-1 w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-20"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <div className="px-4 py-3 border-t border-black/5 flex items-center justify-between">
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-accent-signature bg-accent-signature/10 hover:bg-accent-signature/20 transition-colors"
          >
            <Plus size={12} /> Add Product
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grand Total</span>
            <span className="text-lg font-black text-ink-primary tabular-nums">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* ── Submit ──────────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading || !header.supplier_id || lines.every(l => !l.linked_product_id)}
        className="w-full h-12 flex items-center justify-center gap-2 bg-ink-primary text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-sm disabled:opacity-40"
      >
        {loading
          ? <span className="animate-pulse">Saving...</span>
          : <><CheckCircle2 size={14} /> Save {lines.filter(l => l.linked_product_id).length} Item{lines.filter(l => l.linked_product_id).length !== 1 ? 's' : ''}</>
        }
      </button>
    </form>
  );
};

export default MultiPurchaseForm;
