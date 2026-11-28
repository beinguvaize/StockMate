import React, { useState, useMemo, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { formatCurrency, todayISOInAppTZ } from '../../../lib/utils';
import { lbl, field, footRow } from '../lib/ui';
import { priceCheck } from '../lib/priceCheck';
import PriceCheckDialog from './PriceCheckDialog';
import { useFocusAfterDialog } from '../lib/useFocusAfterDialog';

const PurchaseForm = ({ products, suppliers, purchases = [], onSave, loading, initialData, onCancel }) => {
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

  // Unit conversion — buy in base unit or the product's alternate unit.
  const [purchaseUnit, setPurchaseUnit] = useState('BASE'); // BASE | SECONDARY
  const convFactor = parseFloat(selectedProduct?.conversion_factor) || 0;
  const hasAltUnit = !!selectedProduct?.secondary_unit && convFactor > 0;
  const buyUnit = (purchaseUnit === 'SECONDARY' && hasAltUnit)
    ? selectedProduct.secondary_unit
    : (selectedProduct?.unit || 'unit');

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
  // Cost per BASE unit — what FIFO/inventory actually store.
  const baseUnitCost = (unitCost && purchaseUnit === 'SECONDARY' && hasAltUnit)
    ? unitCost / convFactor
    : unitCost;

  // Far from what the item last cost? Asked once; never blocks the save.
  const [priceFlags, setPriceFlags] = useState(null);
  const totalRef = useRef(null);
  const focusAmount = useFocusAfterDialog(() => totalRef.current);

  const handleSubmit = (e) => {
    e.preventDefault();
    const flagged = priceCheck([{
      key: 'single',
      linked_product_id: formData.linked_product_id,
      quantity: formData.quantity,
      total_amount: formData.total_amount,
      buyUnit: purchaseUnit === 'SECONDARY' ? 'ALT' : 'BASE',
    }], purchases, products);
    if (flagged.length) { setPriceFlags(flagged); return; }
    save();
  };

  const save = () => {
    setPriceFlags(null);
    let q = parseFloat(formData.quantity);
    const t = parseFloat(formData.total_amount);
    // Convert quantity to the product's base unit when buying in the alternate unit.
    if (purchaseUnit === 'SECONDARY' && hasAltUnit) q = q * convFactor;
    const u = (q > 0 && t > 0) ? t / q : 0;
    onSave({
      ...formData,
      quantity: q,
      total_amount: t,
      unit_cost: u
    });
  };

  const totalNum = parseFloat(formData.total_amount);
  const whole = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Product</span>
          <select required className={field} value={formData.linked_product_id}
            onChange={e => setFormData({ ...formData, linked_product_id: e.target.value })}>
            <option value="">Select a product...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Supplier</span>
          <select required className={field} value={formData.supplier_id}
            onChange={e => setFormData({ ...formData, supplier_id: e.target.value })}>
            <option value="">Select a supplier...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="dup-qty" className={lbl}>
              Quantity {selectedProduct && <span className="font-medium text-mute">({buyUnit})</span>}
            </label>
            {hasAltUnit && (
              <div className="mb-1.5 flex items-center gap-0.5 rounded-pill bg-well p-0.5">
                {[
                  { k: 'BASE', l: selectedProduct.unit },
                  { k: 'SECONDARY', l: selectedProduct.secondary_unit },
                ].map(o => (
                  <button key={o.k} type="button" onClick={() => setPurchaseUnit(o.k)}
                    className={`m-press rounded-pill px-2 py-0.5 font-tight text-[11px] font-semibold ${
                      purchaseUnit === o.k ? 'bg-surface text-ink shadow-sm' : 'text-body'}`}>{o.l}</button>
                ))}
              </div>
            )}
          </div>
          <input id="dup-qty" required type="number" className={field} placeholder="0" min="0"
            value={formData.quantity} onChange={e => handleQuantityChange(e.target.value)} />
          {hasAltUnit && purchaseUnit === 'SECONDARY' && Number(formData.quantity) > 0 && (
            <span className="mt-1 block font-tight text-[12px] font-semibold text-amber-text">
              = {(Number(formData.quantity) * convFactor).toLocaleString()} {selectedProduct.unit} stored
            </span>
          )}
        </div>
        <label className="block">
          <span className={lbl}>Unit price {selectedProduct && <span className="font-medium text-mute">(per {buyUnit})</span>}</span>
          <input type="number" className={field} placeholder="0.00" min="0" step="0.01"
            value={formData.unit_price} onChange={e => handleUnitPriceChange(e.target.value)} />
          {baseUnitCost !== null && selectedProduct?.costPrice > 0 && (
            <span className={`mt-1 block font-tight text-[12px] font-semibold ${baseUnitCost > selectedProduct.costPrice ? 'text-amber-text' : 'text-good-text'}`}>
              {baseUnitCost > selectedProduct.costPrice ? '▲' : '▼'} vs last {formatCurrency(selectedProduct.costPrice)}/{selectedProduct.unit}
            </span>
          )}
          {baseUnitCost !== null && selectedProduct?.sellingPrice > 0 && baseUnitCost > selectedProduct.sellingPrice && (
            <span className="mt-1.5 flex items-start gap-1.5 rounded-[10px] bg-bad-soft px-2.5 py-1.5 text-[12px] font-semibold text-bad-text">
              <AlertTriangle size={12} className="mt-px shrink-0" />
              <span>Unit cost is above the selling price ({formatCurrency(selectedProduct.sellingPrice)}). Check for a data-entry error.</span>
            </span>
          )}
        </label>
        <label className="block">
          <span className={lbl}>Total amount</span>
          <input ref={totalRef} required type="number" aria-label="Total amount" className={field}
            placeholder="0.00" min="0" step="0.01"
            value={formData.total_amount} onChange={e => handleTotalChange(e.target.value)} />
          {unitCost !== null && (
            <span className="mt-1 block text-[12px] text-mute">Unit cost: <b className="font-tight font-semibold text-ink">{formatCurrency(unitCost)}</b></span>
          )}
        </label>
        <label className="block">
          <span className={lbl}>Payment type</span>
          <select required className={field} value={formData.payment_type}
            onChange={e => setFormData({ ...formData, payment_type: e.target.value })}>
            <option value="CASH">Cash, paid now</option>
            <option value="CREDIT">Credit, pay later</option>
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Date</span>
          <input required type="date" className={field} value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })} />
        </label>
        <label className="block">
          <span className={lbl}>Notes</span>
          <input type="text" className={field} placeholder="Optional reference or remarks"
            value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
        </label>
      </div>

      <div className={footRow}>
        {onCancel && <Button variant="secondary" className="px-[22px]" onClick={onCancel}>Cancel</Button>}
        {/* Was "Update Purchase" when duplicating, though it saves a NEW
            purchase. The owner allowed this label fix. */}
        <Button type="submit" disabled={loading} className="flex-1 h-11">
          {loading ? 'Saving…' : `Save purchase${totalNum > 0 ? ` · ${whole(totalNum)}` : ''}`}
        </Button>
      </div>

      {priceFlags && (
        <PriceCheckDialog flagged={priceFlags} saving={loading} onConfirm={save}
          onChange={() => { focusAmount('single'); setPriceFlags(null); }} />
      )}
    </form>
  );
};

export default PurchaseForm;
