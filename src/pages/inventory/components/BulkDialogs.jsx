import React, { useState } from 'react';
import Dialog from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import HoldButton from '../../../components/motion/HoldButton';
import WriteFailure from '../../../components/invoices/WriteFailure';
import { Label, Hint, Select, Notice } from './parts';

/**
 * Bulk edit (approved inventory-04). Blank fields stay as they are on every
 * selected product. The columns written per product come from
 * lib/inventoryView `bulkEditPatch`, unchanged from before; `onApply` runs
 * them one product at a time and hands back any that the server refused.
 */
export function BulkEditDialog({ count, categories, onClose, onApply, onReread }) {
  const [f, setF] = useState({ category: '', pricePct: '', sellPrice: '', reorder: '', gstRate: '' });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(null); // [{ item, error }]
  const dirty = f.category || f.pricePct !== '' || f.sellPrice !== '' || f.reorder !== '' || f.gstRate !== '';
  const apply = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setFailed(null);
    try {
      const res = await onApply(f);
      if (res?.failed?.length) setFailed(res.failed);
    } finally {
      setSaving(false);
    }
  };
  const plural = count === 1 ? 'product' : 'products';
  return (
    <Dialog open onClose={onClose} title="Bulk Edit" subtitle={`${count} ${plural} selected · blank fields stay as they are`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={apply} disabled={!dirty || saving}>{saving ? 'Applying…' : `Apply to ${count} ${plural}`}</Button>
        </>
      )}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="be-cat">Category</Label>
          <Select id="be-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Keep current</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="be-pct">Price change, %</Label>
          <Input id="be-pct" type="number" step="0.1" placeholder="5"
            value={f.pricePct} onChange={(e) => setF({ ...f, pricePct: e.target.value, sellPrice: '' })} />
          <Hint>For example 5 or −10</Hint>
        </div>
        <div>
          <Label htmlFor="be-sell">Or set the selling price</Label>
          <Input id="be-sell" type="number" step="0.01" placeholder="Fixed price"
            value={f.sellPrice} onChange={(e) => setF({ ...f, sellPrice: e.target.value, pricePct: '' })} />
          <Hint>Filling one clears the other</Hint>
        </div>
        <div>
          <Label htmlFor="be-reorder">Reorder level</Label>
          <Input id="be-reorder" type="number" placeholder="10"
            value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} />
          <Hint>Low-stock line</Hint>
        </div>
        <div>
          <Label htmlFor="be-gst">GST rate</Label>
          <Select id="be-gst" value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })}>
            <option value="">Keep current</option>
            <option value="0">0% (exempt or unregistered)</option>
            <option value="5">5%</option>
            <option value="12">12%</option>
            <option value="18">18%</option>
            <option value="28">28%</option>
          </Select>
          <Hint>0%, 5%, 12%, 18% or 28%</Hint>
        </div>
      </div>
      <FailedList failed={failed} total={count} verb="changed" onReread={onReread} />
    </Dialog>
  );
}

/**
 * Delete one or more products (approved inventory-05). Hold to confirm; then
 * the same delete as before runs for each product in turn. Any the server
 * refused stay selected and are listed with its reason.
 */
export function DeleteProductsDialog({ products, onClose, onDelete, onReread }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const n = products.length;
  const names = products.slice(0, 4).map((p) => p.name).join(', ') + (n > 4 ? ` and ${n - 4} more` : '');
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const res = await onDelete(products);
      if (res?.failed?.length) setFailed(res.failed);
    } finally {
      setBusy(false);
    }
  };
  const what = n === 1 ? 'Product' : `${n} Products`;
  return (
    <Dialog open onClose={onClose} title={`Delete ${what}`} subtitle={names} label={`Delete ${what}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <HoldButton onConfirm={run} disabled={busy} title={`Hold to delete ${n === 1 ? 'this product' : `${n} products`}`}
            className="h-10 rounded-pill bg-surface px-[18px] font-tight text-[13.5px] font-semibold text-bad-text shadow-[inset_0_0_0_1px_#F5C2C2] disabled:opacity-50">
            {busy ? 'Deleting…' : `Hold to delete ${n === 1 ? '' : `${n} products`}`.trim()}
          </HoldButton>
        </>
      )}>
      <Notice tone="r" title={n === 1 ? 'It leaves your product list and the till' : 'They leave your product list and the till'}>
        Same delete as before, for each product in turn.
      </Notice>
      <FailedList failed={failed} total={n} verb="deleted" onReread={onReread} />
    </Dialog>
  );
}

/** Which products a bulk write did not reach, each with the server's own words. */
function FailedList({ failed, total = 0, verb, onReread }) {
  if (!failed?.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[12.5px] text-body">
        {failed.length} {failed.length === 1 ? 'product was' : 'products were'} not {verb}.{total > failed.length ? ' The rest went through.' : ''}
      </p>
      {failed.slice(0, 6).map(({ item, error }) => (
        <div key={item.id}>
          <b className="block font-tight text-[12.5px] font-semibold text-ink-2">{item.name}</b>
          <WriteFailure error={error} noun="change" onReread={onReread} />
        </div>
      ))}
      {failed.length > 6 && <p className="text-[12px] text-mute">and {failed.length - 6} more</p>}
    </div>
  );
}
