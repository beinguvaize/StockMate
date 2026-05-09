import React, { useState, useMemo } from 'react';
import { PackagePlus, CheckCircle2, ShoppingBag } from 'lucide-react';
import Button from '../../../shared/Button';
import { UNITS } from '../../../lib/constants';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';

const PurchaseForm = ({ products, suppliers, onSave, loading, initialData }) => {
  const [formData, setFormData] = useState({
    linked_product_id: initialData?.linked_product_id ?? '',
    supplier_id:       initialData?.supplier_id        ?? '',
    quantity:          initialData?.quantity            ?? '',
    unit_price:        initialData?.quantity > 0 && initialData?.total_amount > 0
                         ? (initialData.total_amount / initialData.quantity).toFixed(4)
                         : '',
    total_amount:      initialData?.total_amount        ?? '',
    payment_type:      initialData?.payment_type        ?? 'CASH',
    date:              initialData?.date                ?? todayISOInAppTZ(),
    notes:             initialData?.notes               ?? ''
  });

  const selectedProduct = useMemo(
    () => products.find(p => p.id === formData.linked_product_id),
    [products, formData.linked_product_id]
  );

  // Sync unit_price → total_amount
  const handleUnitPriceChange = (val) => {
    const q = parseFloat(formData.quantity);
    const u = parseFloat(val);
    const total = (!isNaN(q) && !isNaN(u) && q > 0) ? (u * q).toFixed(2) : '';
    setFormData(f => ({ ...f, unit_price: val, total_amount: total }));
  };

  // Sync total_amount → unit_price
  const handleTotalChange = (val) => {
    const q = parseFloat(formData.quantity);
    const t = parseFloat(val);
    const unit = (!isNaN(q) && !isNaN(t) && q > 0) ? (t / q).toFixed(4) : '';
    setFormData(f => ({ ...f, total_amount: val, unit_price: unit }));
  };

  // When quantity changes, re-derive total from unit_price if set, else unit_price from total
  const handleQuantityChange = (val) => {
    const q = parseFloat(val);
    const u = parseFloat(formData.unit_price);
    const t = parseFloat(formData.total_amount);
    let update = { quantity: val };
    if (!isNaN(q) && q > 0) {
      if (!isNaN(u)) {
        update.total_amount = (u * q).toFixed(2);
      } else if (!isNaN(t)) {
        update.unit_price = (t / q).toFixed(4);
      }
    }
    setFormData(f => ({ ...f, ...update }));
  };

  const unitCost = parseFloat(formData.unit_price) || null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = parseFloat(formData.quantity);
    const t = parseFloat(formData.total_amount);
    const u = unitCost ?? (q > 0 && t > 0 ? t / q : 0);
    onSave({
      ...formData,
      quantity: q,
      total_amount: t,
      unit_cost: u
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Product</label>
          <select
            required
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={formData.linked_product_id}
            onChange={e => setFormData({ ...formData, linked_product_id: e.target.value })}
          >
            <option value="">Select a product...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Supplier</label>
          <select
            required
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={formData.supplier_id}
            onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}
          >
            <option value="">Select a supplier...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Quantity</label>
          <input
            required
            type="number"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="0"
            min="0"
            value={formData.quantity}
            onChange={e => handleQuantityChange(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Unit Price</label>
          <input
            type="number"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={formData.unit_price}
            onChange={e => handleUnitPriceChange(e.target.value)}
          />
          {unitCost !== null && selectedProduct?.costPrice > 0 && (
            <div className="mt-1.5 text-[10px] font-bold">
              <span className={unitCost > selectedProduct.costPrice ? 'text-amber-600' : 'text-emerald-600'}>
                {unitCost > selectedProduct.costPrice ? '▲' : '▼'} vs last {formatCurrency(selectedProduct.costPrice)}
              </span>
            </div>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Total Amount</label>
          <input
            required
            type="number"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={formData.total_amount}
            onChange={e => handleTotalChange(e.target.value)}
          />
          {unitCost !== null && (
            <div className="mt-1.5 text-[10px] font-bold text-gray-500">
              Unit cost: <span className="text-ink-primary">{formatCurrency(unitCost)}</span>
            </div>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Type</label>
          <select
            required
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={formData.payment_type}
            onChange={e => setFormData({ ...formData, payment_type: e.target.value })}
          >
            <option value="CASH">Cash (paid now)</option>
            <option value="CREDIT">Credit (pay later)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Date</label>
          <input
            required
            type="date"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
          <input
            type="text"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="Optional reference or remarks"
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
      </div>

      <Button
        type="submit" 
        disabled={loading} 
        className="w-full !rounded-xl !h-12 shadow-xl"
        icon={CheckCircle2}
      >
        {loading ? 'Saving...' : initialData ? 'Update Purchase' : 'Save Purchase'}
      </Button>
    </form>
  );
};

export default PurchaseForm;
