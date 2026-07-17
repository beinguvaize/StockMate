import React, { useState } from 'react';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { PackagePlus, CheckCircle2, X } from 'lucide-react';
import { UNITS } from '../../../lib/constants';

/**
 * Lightweight product-creation sheet — triggered when a scanned barcode
 * doesn't match any existing product.
 */
const QuickCreateProductModal = ({ barcode, initialName, onSave, onCancel, loading }) => {
  useDialogClose(onCancel);
  const [form, setForm] = useState({
    name:         initialName || '',
    sku:          '',
    unit:         UNITS[0],
    costPrice:    '',
    sellingPrice: '',
    category:     '',
    barcode:      barcode || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [err, setErr] = React.useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!(parseFloat(form.costPrice) > 0)) { setErr('Cost price required and must be > 0.'); return; }
    if (!(parseFloat(form.sellingPrice) > 0)) { setErr('Selling price required and must be > 0.'); return; }
    setErr('');
    onSave({
      ...form,
      costPrice:    parseFloat(form.costPrice)    || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      stock:        0,
      taxRate:      0,
    });
  };

  const inp = 'w-full bg-white border border-gray-300 shadow-sm rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-canvas animate-fade-in">
      <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-black/5 bg-white shrink-0">
          <button onClick={onCancel} className="w-9 h-9 flex items-center justify-center rounded-full border border-black/5 hover:bg-canvas transition-all text-ink-primary shrink-0">
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <PackagePlus size={16} className="text-accent-signature shrink-0" />
            <div>
              <p className="text-lg font-black text-ink-primary">New Product</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                Barcode: <span className="font-mono text-ink-primary">{barcode}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 max-w-lg mx-auto w-full">
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

          {err && <p className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}

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
