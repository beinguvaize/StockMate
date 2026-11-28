import React, { useState, useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { Eyebrow } from '../../../components/ui/FigureStrip';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';
import { lbl, hint, field, footRow } from '../lib/ui';

const PurchaseReturnForm = ({ purchase, product, supplier, warehouses = [], onSave, loading, onCancel }) => {
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

  const whole = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <form onSubmit={handleSubmit}>
      {/* What is being returned against */}
      <div className="mb-3.5 rounded-xl bg-tile px-3.5 py-3">
        <Eyebrow>Original purchase{supplier ? ` · ${supplier.name}` : ''}</Eyebrow>
        <b className="mb-1 mt-0.5 block font-tight text-[14px] font-semibold">{product?.name || 'Unknown Product'}</b>
        <div className="flex flex-wrap gap-4 text-[12.5px] text-body">
          <span>Qty <b className="font-tight font-semibold text-ink tabular-nums">{maxQty}</b></span>
          <span>Unit <b className="font-tight font-semibold text-ink tabular-nums">{formatCurrency(unitPrice)}</b></span>
          <span>Total <b className="font-tight font-semibold text-ink tabular-nums">{formatCurrency(purchase?.total_amount)}</b></span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Return quantity, max {maxQty}</span>
          <input required type="number" min="0.01" max={maxQty} step="0.01" className={field}
            placeholder={`0 – ${maxQty}`} value={formData.quantity}
            onChange={e => setFormData(f => ({ ...f, quantity: e.target.value }))} />
          {returnTotal > 0 && (
            <span className={hint}>Return value <b className="font-tight font-semibold text-ink tabular-nums">{formatCurrency(returnTotal)}</b></span>
          )}
        </label>
        <label className="block">
          <span className={lbl}>Date</span>
          <input required type="date" className={field} value={formData.date}
            onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} />
        </label>
        {warehouses.length > 0 && (
          <label className="block sm:col-span-2">
            <span className={lbl}>Return stock from</span>
            <select className={field} value={formData.location_id}
              onChange={e => setFormData(f => ({ ...f, location_id: e.target.value }))}>
              <option value="">Auto, main warehouse</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className={lbl}>Reason</span>
          <input type="text" className={field} placeholder="Damaged, wrong item, excess stock..."
            value={formData.reason} onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))} />
        </label>
      </div>

      <div className={footRow}>
        {onCancel && <Button variant="secondary" className="px-[22px]" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={loading || !formData.quantity} className="flex-1 h-11">
          {loading ? 'Processing…' : `Return ${formData.quantity || 0} units${returnTotal > 0 ? ` · ${whole(returnTotal)}` : ''}`}
        </Button>
      </div>
    </form>
  );
};

export default PurchaseReturnForm;
