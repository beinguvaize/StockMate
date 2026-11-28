import React, { useState } from 'react';
import { UNITS } from '../../../lib/constants';
import Dialog from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/button';
import { lbl, field, footRow } from '../lib/ui';

/**
 * Lightweight product-creation sheet — triggered when a scanned barcode
 * doesn't match any existing product.
 */
const QuickCreateProductModal = ({ barcode, initialName, onSave, onCancel, loading }) => {
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

  return (
    <Dialog open onClose={onCancel} title="New Product" width={500}
      subtitle={barcode ? `Barcode ${barcode} was not found` : 'Added to the catalogue and picked on this line'}>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className={lbl}>Product name *</span>
            <input required className={field} placeholder="e.g. Butter 500 g" autoFocus
              value={form.name} onChange={e => set('name', e.target.value)} />
          </label>
          <label className="block">
            <span className={lbl}>SKU</span>
            <input className={field} placeholder="Auto if blank"
              value={form.sku} onChange={e => set('sku', e.target.value)} />
          </label>
          <label className="block">
            <span className={lbl}>Unit</span>
            <select className={field} value={form.unit} onChange={e => set('unit', e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={lbl}>Cost price *</span>
            <input type="number" min="0" step="0.01" className={field} placeholder="0.00"
              value={form.costPrice} onChange={e => set('costPrice', e.target.value)} />
          </label>
          <label className="block">
            <span className={lbl}>Selling price *</span>
            <input type="number" min="0" step="0.01" className={field} placeholder="0.00"
              value={form.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} />
          </label>
          <label className="block">
            <span className={lbl}>Category</span>
            <input className={field} placeholder="e.g. Dairy, Beverages…"
              value={form.category} onChange={e => set('category', e.target.value)} />
          </label>
          {/* Barcode (pre-filled, editable) */}
          <label className="block">
            <span className={lbl}>Barcode</span>
            <input className={field} placeholder="EAN-13 / UPC / custom"
              value={form.barcode} onChange={e => set('barcode', e.target.value)} />
          </label>
        </div>

        {err && <p role="alert" className="mt-3 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] font-semibold text-bad-text">{err}</p>}

        <div className={footRow}>
          <Button variant="secondary" className="px-[22px]" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={loading} className="flex-1 h-11">
            {loading ? 'Creating…' : 'Create and pick'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default QuickCreateProductModal;
