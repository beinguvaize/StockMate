import React, { useMemo, useState } from 'react';
import { Plus, X, Minus } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import WriteFailure from '../invoices/WriteFailure';
import { computeOrderTotals } from '../../lib/priceResolver';
import { formTotal, formProblem } from '../../lib/orderView';
import { lbl, field, fieldSm } from '../../pages/purchases/lib/ui';
import { cn } from '../../lib/utils';
import { rupees } from '../estimates/parts';

export const EMPTY_FORM = {
  clientId: '', clientName: '', orderType: 'B2B', priceTier: 'RETAIL',
  requestedDate: '', notes: '', items: [],
};
const EMPTY_ITEM = { productId: '', productName: '', qty: 1, unitPrice: 0, total: 0 };

export const formFromOrder = (order) => ({
  clientId: order.client_id || '',
  clientName: order.client_name || '',
  orderType: order.order_type || 'B2B',
  priceTier: order.price_tier || 'RETAIL',
  requestedDate: order.requested_date || '',
  notes: order.notes || '',
  items: Array.isArray(order.items) ? order.items : [],
});

/**
 * New order / Edit order (orders-04, orders-05). The form's rules are
 * today's, moved here: the client sets type and tier, choosing a product
 * prices the line from the price lists, qty × unit price is the line total,
 * the grand total is the sum (GST is added when it is billed). `onSubmit`
 * returns { error } and the real reason shows; the dialog stays open.
 */
export default function OrderForm({ order, clients = [], products = [], priceLists = [], sym = '₹', onSubmit, onClose, onReread }) {
  const editing = !!order;
  const [form, setForm] = useState(() => (order ? formFromOrder(order) : EMPTY_FORM));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const total = useMemo(() => formTotal(form.items), [form.items]);
  const problem = formProblem(form.items);

  const onClientChange = (clientId) => {
    const client = clients.find((c) => c.id === clientId);
    setForm((prev) => ({
      ...prev,
      clientId,
      clientName: client?.name || '',
      orderType: client ? (client.client_type || 'B2B') : prev.orderType,
      priceTier: client ? (client.price_tier || 'RETAIL') : prev.priceTier,
    }));
  };
  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));
  const removeItem = (idx) => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx, key, value) => {
    setForm((prev) => {
      const items = prev.items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [key]: value };
        if (key === 'productId') {
          const p = products.find((pr) => pr.id === value);
          if (p) {
            updated.productName = p.name;
            const { items: priced } = computeOrderTotals([{ ...updated, qty: updated.qty || 1 }], priceLists, prev.priceTier, products);
            return { ...updated, unitPrice: priced[0].unitPrice, total: priced[0].total };
          }
        }
        if (key === 'qty' || key === 'unitPrice') {
          const qty = key === 'qty' ? Number(value) : (updated.qty || 1);
          const up = key === 'unitPrice' ? Number(value) : updated.unitPrice;
          updated.total = qty * up;
        }
        return updated;
      });
      return { ...prev, items };
    });
  };

  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true); setError(null);
    let res;
    try { res = await onSubmit(form); } catch (e) { res = { error: e }; }
    setBusy(false);
    if (res?.error) { console.error('[orders] save failed', res.error); setError(res.error); return; }
    onClose();
  };

  return (
    <Dialog open onClose={busy ? () => {} : onClose} width={760}
      title={editing ? `Edit order ${order.order_number || ''}` : 'New order'}
      subtitle={editing ? 'Only a draft order can be changed' : 'B2B or B2C sales order · delivered and billed later'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create order'}</Button>
        </>
      )}>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={lbl}>Client</span>
          <select className={field} value={form.clientId} onChange={(e) => onClientChange(e.target.value)}>
            <option value="">Walk-in / no client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.client_type ? ` (${c.client_type})` : ''}</option>)}
          </select>
        </label>
        <div>
          <span className={lbl}>Order type</span>
          <div role="radiogroup" aria-label="Order type" className="flex w-full rounded-pill bg-well p-[3px]">
            {['B2B', 'B2C'].map((t) => (
              <button key={t} type="button" role="radio" aria-checked={form.orderType === t}
                onClick={() => setForm((prev) => ({ ...prev, orderType: t }))}
                className={cn('m-press flex-1 rounded-pill py-[7px] font-tight text-[13px] font-semibold',
                  form.orderType === t ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(17,20,24,0.12)]' : 'text-body')}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className={lbl}>Price tier</span>
          <select className={field} value={form.priceTier} onChange={(e) => setForm((prev) => ({ ...prev, priceTier: e.target.value }))}>
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="DISTRIBUTOR">Distributor</option>
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Requested date</span>
          <input type="date" className={field} value={form.requestedDate} onChange={(e) => setForm((prev) => ({ ...prev, requestedDate: e.target.value }))} />
        </label>
        <label className="block">
          <span className={lbl}>Notes</span>
          <input type="text" className={field} placeholder="Special instructions" value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className={cn(lbl, 'mb-0')}>Line items</span>
        <button type="button" onClick={addItem} className="inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">
          <Plus size={14} /> Add item
        </button>
      </div>

      {form.items.length === 0 ? (
        <div className="mt-1.5 rounded-xl border-[1.5px] border-dashed border-line p-[22px] text-center text-[13px] text-mute">No items yet. Use Add item.</div>
      ) : (
        <div className="mt-1.5 overflow-x-auto rounded-xl shadow-[inset_0_0_0_1px_var(--color-line)]">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_100px_28px] gap-2.5 bg-tile px-3 py-2 font-tight text-[11.5px] font-semibold text-mute">
              <span>Product</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Total</span><span />
            </div>
            {form.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[minmax(0,1fr)_110px_120px_100px_28px] items-center gap-2.5 border-t border-sep px-3 py-[9px] text-[13px]">
                <select aria-label={`Product on line ${idx + 1}`} className={cn(fieldSm, tried && !item.productId && 'shadow-[inset_0_0_0_2px_var(--color-bad)]')}
                  value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}>
                  <option value="">Select product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="inline-flex items-center justify-self-end overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <button type="button" aria-label="Less" className="grid h-[34px] w-8 place-items-center text-body hover:bg-tile"
                    onClick={() => updateItem(idx, 'qty', Math.max(1, (item.qty || 1) - 1))}><Minus size={13} /></button>
                  <span className="w-9 text-center font-tight text-[13px] font-semibold tabular-nums">{item.qty || 1}</span>
                  <button type="button" aria-label="More" className="grid h-[34px] w-8 place-items-center text-body hover:bg-tile"
                    onClick={() => updateItem(idx, 'qty', (item.qty || 1) + 1)}><Plus size={13} /></button>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-mute">{sym}</span>
                  <input type="number" step="0.01" min="0" aria-label={`Unit price on line ${idx + 1}`} className={cn(fieldSm, 'pl-6 text-right')}
                    value={item.unitPrice || 0} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} />
                </div>
                <span className="text-right font-tight text-[13.5px] font-semibold tabular-nums">{rupees(item.total, sym)}</span>
                <button type="button" aria-label={`Remove line ${idx + 1}`} title="Remove" onClick={() => removeItem(idx)}
                  className="m-press grid h-7 w-7 place-items-center rounded-xl text-mute hover:bg-bad-soft hover:text-bad-text"><X size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {form.items.length > 0 && (
        <div className="mt-2.5 flex items-baseline justify-end gap-3 font-tight text-[14px] font-semibold">
          <small className="font-sans text-[12px] font-medium text-mute">GST is added when it is billed</small>
          <span>Grand total</span><span className="text-[20px] tracking-[-0.02em] tabular-nums">{rupees(total, sym)}</span>
        </div>
      )}
      {tried && problem && <p role="alert" className="mt-2.5 text-right text-[12.5px] text-bad-text">{problem}</p>}
      {error && <WriteFailure error={error} noun="order" onReread={onReread} className="mt-3" />}
    </Dialog>
  );
}
