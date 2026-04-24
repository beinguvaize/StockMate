import React, { useState, useMemo } from 'react';
import { PackagePlus, CheckCircle2, ShoppingBag } from 'lucide-react';
import Button from '../../../shared/Button';
import { UNITS } from '../../../lib/constants';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';

const PurchaseForm = ({ products, suppliers, onSave, loading }) => {
  const [formData, setFormData] = useState({
    linked_product_id: '',
    supplier_id: '',
    quantity: '',
    total_amount: '',
    payment_type: 'CASH',
    date: todayISOInAppTZ(),
    notes: ''
  });

  const unitCost = useMemo(() => {
    const q = parseFloat(formData.quantity);
    const t = parseFloat(formData.total_amount);
    if (!q || !t || q <= 0) return null;
    return t / q;
  }, [formData.quantity, formData.total_amount]);

  const selectedProduct = useMemo(
    () => products.find(p => p.id === formData.linked_product_id),
    [products, formData.linked_product_id]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      quantity: parseFloat(formData.quantity),
      total_amount: parseFloat(formData.total_amount),
      unit_cost: unitCost
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
            placeholder="0.00"
            value={formData.quantity}
            onChange={e => setFormData({ ...formData, quantity: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Total Amount</label>
          <input
            required
            type="number"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="0.00"
            value={formData.total_amount}
            onChange={e => setFormData({ ...formData, total_amount: e.target.value })}
          />
          {unitCost !== null && (
            <div className="mt-1.5 text-[10px] font-bold text-gray-500 flex gap-3">
              <span>Unit cost: <span className="text-ink-primary">{formatCurrency(unitCost)}</span></span>
              {selectedProduct?.costPrice > 0 && (
                <span className={unitCost > selectedProduct.costPrice ? 'text-amber-600' : 'text-emerald-600'}>
                  {unitCost > selectedProduct.costPrice ? '▲' : '▼'} vs last {formatCurrency(selectedProduct.costPrice)}
                </span>
              )}
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
        {loading ? 'Saving...' : 'Save Purchase'}
      </Button>
    </form>
  );
};

export default PurchaseForm;
