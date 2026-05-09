import React, { useState } from 'react';
import { PackagePlus, CheckCircle2, X } from 'lucide-react';
import { UNITS } from '../../../lib/constants';

/**
 * Lightweight product-creation sheet — triggered when a scanned barcode
 * doesn't match any existing product.
 */
const QuickCreateProductModal = ({ barcode, onSave, onCancel, loading }) => {
  const [form, setForm] = useState({
    name:         '',
    sku:          '',
    unit:         UNITS[0],
    costPrice:    '',
    sellingPrice: '',
    category:     '',
    barcode:      barcode || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      costPrice:    parseFloat(form.costPrice)    || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      stock:        0,
      taxRate:      0,
    });
  };

  const inp = 'w-full bg-canvas border border-black/5 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
          <div className="flex items-center gap-2">
            <PackagePlus size={16} className="text-accent-signature" />
            <div>
              <p className="text-sm font-black text-ink-primary">New Product</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                Barcode: <span className="font-mono text-ink-primary">{barcode}</span>
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-canvas text-gray-400">
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Product Name <span className="text-red-400">*</span></label>
            <input required className={inp} placeholder="e.g. Amul Butter 500g"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">SKU</label>
              <input className={inp} placeholder="Auto if blank"
                value={form.sku} onChange={e => set('sku', e.target.value)} />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Unit</label>
              <select className={inp} value={form.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Cost Price</label>
              <input type="number" min="0" step="0.01" className={inp} placeholder="0.00"
                value={form.costPrice} onChange={e => set('costPrice', e.target.value)} />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Selling Price</label>
              <input type="number" min="0" step="0.01" className={inp} placeholder="0.00"
                value={form.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Category</label>
            <input className={inp} placeholder="e.g. Dairy, Beverages…"
              value={form.category} onChange={e => set('category', e.target.value)} />
          </div>

          {/* Barcode (pre-filled, editable) */}
          <div>
            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Barcode</label>
            <input className={`${inp} font-mono`} placeholder="EAN-13 / UPC / custom"
              value={form.barcode} onChange={e => set('barcode', e.target.value)} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCancel}
              className="flex-1 h-10 rounded-xl border border-black/5 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-canvas transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-10 flex items-center justify-center gap-2 bg-ink-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-40">
              <CheckCircle2 size={12} />
              {loading ? 'Creating…' : 'Create & Select'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickCreateProductModal;
