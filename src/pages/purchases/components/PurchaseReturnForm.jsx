import React, { useState, useMemo } from 'react';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import Button from '../../../shared/Button';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';

const PurchaseReturnForm = ({ purchase, product, supplier, warehouses = [], onSave, loading }) => {
  const maxQty = Number(purchase?.quantity) || 0;

  const [formData, setFormData] = useState({
    quantity:    '',
    reason:      '',
    date:        todayISOInAppTZ(),
    location_id: '',
  });

  const unitPrice = maxQty > 0 ? (Number(purchase?.total_amount) || 0) / maxQty : 0;

  const returnTotal = useMemo(() => {
    const q = parseFloat(formData.quantity);
    if (isNaN(q) || q <= 0) return 0;
    return Math.round(q * unitPrice * 100) / 100;
  }, [formData.quantity, unitPrice]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = parseFloat(formData.quantity);
    if (isNaN(q) || q <= 0) return;
    if (q > maxQty) {
      alert(`Cannot return more than purchased quantity (${maxQty})`);
      return;
    }
    onSave({
      purchase_id:   purchase.id,
      supplier_id:   supplier?.id || purchase.supplier_id || null,
      supplier_name: supplier?.name || purchase.supplier_name || null,
      product_id:    product?.id || purchase.linked_product_id,
      product_name:  product?.name || null,
      quantity:      q,
      unit_price:    unitPrice,
      total_amount:  returnTotal,
      reason:        formData.reason,
      date:          formData.date,
      location_id:   formData.location_id || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Context summary */}
      <div className="bg-canvas rounded-2xl p-4 space-y-1">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Original Purchase</div>
        <div className="text-sm font-black text-ink-primary">{product?.name || 'Unknown Product'}</div>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-xs font-bold text-gray-500">Qty: <span className="text-ink-primary">{maxQty}</span></span>
          <span className="text-xs font-bold text-gray-500">Unit: <span className="text-ink-primary">{formatCurrency(unitPrice)}</span></span>
          <span className="text-xs font-bold text-gray-500">Total: <span className="text-ink-primary">{formatCurrency(purchase?.total_amount)}</span></span>
        </div>
        {supplier && (
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{supplier.name}</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
            Return Quantity <span className="text-gray-400">(max {maxQty})</span>
          </label>
          <input
            required
            type="number"
            min="0.01"
            max={maxQty}
            step="0.01"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder={`0 – ${maxQty}`}
            value={formData.quantity}
            onChange={e => setFormData(f => ({ ...f, quantity: e.target.value }))}
          />
          {returnTotal > 0 && (
            <div className="mt-1.5 text-[10px] font-bold text-gray-500">
              Return value: <span className="text-rose-600 font-black">{formatCurrency(returnTotal)}</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Date</label>
          <input
            required
            type="date"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            value={formData.date}
            onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
          />
        </div>

        {warehouses.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Return Stock To</label>
            <select
              className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={formData.location_id}
              onChange={e => setFormData(f => ({ ...f, location_id: e.target.value }))}
            >
              <option value="">Auto (main warehouse)</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Reason</label>
          <input
            type="text"
            className="w-full bg-canvas border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent-signature/20"
            placeholder="Damaged, wrong item, excess stock..."
            value={formData.reason}
            onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))}
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={loading || !formData.quantity}
        className="w-full !rounded-xl !h-12 shadow-xl !bg-rose-600 hover:!bg-rose-700"
        icon={RotateCcw}
      >
        {loading ? 'Processing...' : `Return ${formData.quantity || 0} units`}
      </Button>
    </form>
  );
};

export default PurchaseReturnForm;
