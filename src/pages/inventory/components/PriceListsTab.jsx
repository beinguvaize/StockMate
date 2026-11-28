import React, { useState, useMemo } from 'react';
import { Trash2, Tag, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import SegmentedTabs from '../../../components/motion/SegmentedTabs';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import WriteFailure from '../../../components/invoices/WriteFailure';
import { ProductAvatar, Label, Select } from './parts';

const TIERS = [
  { id: 'WHOLESALE',   label: 'Wholesale',   desc: 'Trade buyers and bulk purchasers' },
  { id: 'DISTRIBUTOR', label: 'Distributor', desc: 'Regional distributors and sub-dealers' },
];

const QTY_BREAKS = [1, 5, 10, 20, 50, 100, 200, 500];

const EMPTY_FORM = { productId: '', minQty: 1, price: '' };

const money = (cur, n) => `${cur}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Price lists (approved inventory-15): wholesale and distributor prices with
 * quantity breaks. The same useOrders upsert / delete as before; a refusal is
 * now shown in the server's words, for a delete as well as a save.
 *
 *   products       Product[]         from useInventory
 *   priceLists     PriceListEntry[]  from useOrders
 *   onUpsert       ({ productId, tier, minQty, price }) => Promise<{ success, error }>
 *   onDelete       ({ productId, tier, minQty }) => Promise<{ success, error }>
 */
const PriceListsTab = ({ products, priceLists = [], onUpsert, onDelete, currencySymbol = '₹' }) => {
  const [activeTier, setActiveTier] = useState('WHOLESALE');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);          // a typed check, in words
  const [writeError, setWriteError] = useState(null); // what the server said
  const [expandedId, setExpandedId] = useState(null);

  const tierEntries = useMemo(() => priceLists.filter(p => p.tier === activeTier), [priceLists, activeTier]);

  const grouped = useMemo(() => {
    const map = {};
    tierEntries.forEach(e => { (map[e.product_id] = map[e.product_id] || []).push(e); });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.min_qty - b.min_qty));
    return map;
  }, [tierEntries]);

  const productOf = (id) => products.find(p => p.id === id);
  const tierCount = (id) => new Set(priceLists.filter(p => p.tier === id).map(p => p.product_id)).size;

  const handleSave = async () => {
    if (!form.productId) { setError('Select a product.'); return; }
    if (!form.price || Number(form.price) <= 0) { setError('Enter valid price.'); return; }
    setSaving(true); setError(null); setWriteError(null);
    const { success, error: err } = await onUpsert({
      productId: form.productId,
      tier: activeTier,
      minQty: Number(form.minQty),
      price: Number(form.price),
    });
    setSaving(false);
    if (success) setForm(EMPTY_FORM);
    else setWriteError(err || new Error('The server gave no reason.'));
  };

  const handleDelete = async (entry) => {
    setWriteError(null);
    const res = await onDelete({ productId: entry.product_id, tier: entry.tier, minQty: entry.min_qty });
    if (res && res.success === false) setWriteError(res.error || new Error('The server gave no reason.'));
  };

  const tier = TIERS.find(t => t.id === activeTier);

  return (
    <div className="flex flex-col">
      <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 1 }}>
        <SegmentedTabs
          items={TIERS.map(t => ({ key: t.id, label: `${t.label}${tierCount(t.id) ? ` · ${tierCount(t.id)} ${tierCount(t.id) === 1 ? 'product' : 'products'}` : ''}` }))}
          value={activeTier}
          onChange={(k) => { setActiveTier(k); setForm(EMPTY_FORM); setError(null); setWriteError(null); }}
          trackClass="bg-well" indicatorClass="bg-ink" activeClass="text-white"
          className="[&_button]:font-tight [&_button]:text-[12.5px] [&_button]:font-semibold [&_button]:px-[13px] [&_button]:h-[30px] [&_button:not([aria-selected=true])]:text-body"
        />
        <span className="text-[13px] text-mute">{tier.desc}</span>
        <span className="flex-1" />
        <span className="hidden text-[13px] text-mute md:inline">Wholesale and distributor prices with quantity breaks</span>
      </div>

      {/* Add / update a break */}
      <div className="m-rise mb-3.5 grid grid-cols-1 items-end gap-2.5 rounded-[14px] bg-tile px-4 py-3.5 sm:grid-cols-[1fr_130px_150px_auto]" style={{ '--i': 2 }}>
        <div className="min-w-0">
          <Label htmlFor="pl-product">Product</Label>
          <Select id="pl-product" value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}>
            <option value="">Select product…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-min">Minimum quantity</Label>
          <Select id="pl-min" value={form.minQty} onChange={e => setForm(f => ({ ...f, minQty: Number(e.target.value) }))}>
            {QTY_BREAKS.map(q => <option key={q} value={q}>{q}+</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-price">Price</Label>
          <div className="flex h-9 items-center gap-1.5 rounded-[10px] bg-surface px-3 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
            <span className="text-[13.5px] text-mute">{currencySymbol}</span>
            <input id="pl-price" type="number" step="0.01" min="0" placeholder="0.00" value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] tabular-nums text-ink outline-none" />
          </div>
        </div>
        <Button variant="dark" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add price break'}</Button>
        {error && <p className="text-[12.5px] font-medium text-bad-text sm:col-span-4">{error}</p>}
      </div>
      <WriteFailure error={writeError} noun="price" className="mb-3" />

      {Object.keys(grouped).length === 0 ? (
        <div className="m-rise rounded-[14px] px-5 py-[54px] text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
          <span className="mx-auto mb-3.5 grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-tile text-mute"><Tag size={22} strokeWidth={1.7} /></span>
          <b className="block font-tight text-[15px] font-semibold text-ink">No {tier.label.toLowerCase()} prices set</b>
          <p className="mt-1 text-[13px] text-body">Add price breaks above</p>
        </div>
      ) : (
        <div className="m-rise" style={{ '--i': 3 }}>
          {Object.entries(grouped).map(([productId, entries]) => {
            const product = productOf(productId);
            const name = product?.name || productId;
            const basePrice = product?.sellingPrice;
            const isOpen = expandedId === productId;
            return (
              <div key={productId} className="mb-2 overflow-hidden rounded-[14px] shadow-[inset_0_0_0_1px_var(--color-line)]">
                <button type="button" onClick={() => setExpandedId(isOpen ? null : productId)} aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--dur-press) hover:bg-tile">
                  <ProductAvatar product={product || { name }} name={name} />
                  <div className="min-w-0">
                    <b className="block truncate font-tight text-[13.5px] font-semibold">{name}</b>
                    {basePrice != null && <small className="block text-[12px] text-mute tabular-nums">Base retail {money(currencySymbol, basePrice)}</small>}
                  </div>
                  <span className="flex-1" />
                  <Badge tone="info">{entries.length} break{entries.length !== 1 ? 's' : ''}</Badge>
                  {isOpen ? <ChevronUp size={15} className="text-mute" /> : <ChevronDown size={15} className="text-mute" />}
                </button>
                {isOpen && (
                  <div>
                    {entries.map(entry => (
                      <div key={`${entry.product_id}-${entry.min_qty}`}
                        className="grid grid-cols-[90px_110px_1fr_auto] items-center gap-2.5 border-t border-sep bg-tile px-4 py-[9px] text-[13px]">
                        <span className="text-mute">{entry.min_qty}+ units</span>
                        <b className="font-tight font-semibold tabular-nums">{money(currencySymbol, entry.price)}</b>
                        <span>
                          {basePrice != null && Number(entry.price) < Number(basePrice) && (
                            <Badge tone="good">{Math.round((1 - Number(entry.price) / Number(basePrice)) * 100)}% off retail</Badge>
                          )}
                        </span>
                        <button type="button" onClick={() => handleDelete(entry)} aria-label={`Remove the ${entry.min_qty}+ break`}
                          className="m-press grid h-7 w-7 place-items-center rounded-xl text-faint hover:bg-bad-soft hover:text-bad-text">
                          <Trash2 size={15} strokeWidth={1.8} />
                        </button>
                      </div>
                    ))}
                    <div className="border-t border-sep px-4 py-[9px]">
                      <button type="button" onClick={() => setForm(f => ({ ...f, productId }))}
                        className="inline-flex items-center gap-1 font-tight text-[12.5px] font-semibold text-amber-text hover:underline">
                        <Plus size={12} /> Add break for this product
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PriceListsTab;
