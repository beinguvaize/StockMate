import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Trash2, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import WriteFailure from '../invoices/WriteFailure';
import { calculateGST } from '../../lib/gstEngine';
import { resolvePrice } from '../../lib/priceResolver';
import { supabase } from '../../lib/supabase';
import { lbl, field } from '../../pages/purchases/lib/ui';
import { amt2, rupees2, EstimateStatusPill } from './parts';
import { lineAmount } from '../../lib/estimateView';

/**
 * Edit estimate (estimates-05), drawn as a page inside Estimates. The logic
 * is today's editor, moved here unchanged: the client sets the price tier,
 * changing the tier re-prices every line from the price lists, totals come
 * from calculateGST, and the same payload goes to useEstimates.update (or
 * create when there is no estimate). The New estimate button opens the
 * shared New document page instead.
 */
export default function EstimateEditor({ estimate, tenantId, clients = [], products = [], businessProfile, onSave, onClose, onReread }) {
  const editingId = estimate?.id || null;
  const cur = businessProfile?.currencySymbol || '₹';
  const bizState = businessProfile?.state || '';
  const [clientId, setClientId] = useState(estimate?.client_id || '');
  const [lines, setLines] = useState(Array.isArray(estimate?.items) ? estimate.items : []);
  const [validUntil, setValidUntil] = useState(estimate?.valid_until || '');
  const [notes, setNotes] = useState(estimate?.notes || '');
  const [prodSearch, setProdSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [priceTier, setPriceTier] = useState('RETAIL');
  const [priceLists, setPriceLists] = useState([]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('price_lists').select('*').eq('tenant_id', tenantId).is('deleted_at', null)
      .then(({ data }) => setPriceLists(data || []));
  }, [tenantId]);

  const client = clients.find((c) => c.id === clientId);
  const totals = useMemo(() => calculateGST(lines, bizState, client?.state || ''), [lines, bizState, client]);

  const prodMatches = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return [];
    return (products || []).filter((p) => (p.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [prodSearch, products]);

  const addLine = (p) => {
    const base = Number(p.sellingPrice || 0);
    const rate = resolvePrice(priceLists, p.id, priceTier, 1, base);
    setLines((prev) => [...prev, {
      id: p.id, name: p.name, qty: 1,
      rate: Number(rate) || base,
      taxRate: Number(p.taxRate ?? 18),
      hsn_code: p.hsn_code || p.sku || '',
    }]);
    setProdSearch('');
  };

  // Switch tier → re-price existing lines from their product's tier price.
  const applyTier = (tier) => {
    setPriceTier(tier);
    setLines((prev) => prev.map((l) => {
      const p = products.find((x) => x.id === l.id);
      const base = Number(p?.sellingPrice || l.rate || 0);
      return { ...l, rate: Number(resolvePrice(priceLists, l.id, tier, l.qty || 1, base)) || base };
    }));
  };
  const patchLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const delLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!lines.length) return;
    setSaving(true); setSaveErr(null);
    const t = totals;
    const payload = {
      client_id: clientId || null,
      client_name: client?.name || 'Walk-in',
      client_gstin: client?.gst_no || null,
      client_phone: client?.contact || null,
      place_of_supply: client?.state || null,
      is_interstate: t.isInterstate,
      valid_until: validUntil || null,
      items: lines,
      taxable_amount: t.taxable, tax_total: t.totalTax,
      cgst_amount: t.cgst, sgst_amount: t.sgst, igst_amount: t.igst,
      discount_total: t.discount, round_off: t.roundOff, grand_total: t.grandTotal,
      notes,
    };
    try {
      const { error } = await onSave(editingId, payload);
      if (error) { setSaveErr(error); return; }
      onClose();
    } catch (e) {
      setSaveErr(e || new Error('Save failed'));
    } finally {
      setSaving(false); // never leave the button stuck on "Saving…"
    }
  };

  const round = Number(totals.roundOff) || 0;
  return (
    <div className="m-rise max-w-[980px] pb-16">
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <div className="min-w-0">
          <button type="button" onClick={onClose}
            className="inline-flex items-center gap-1 font-tight text-[13px] font-semibold text-body hover:text-ink">
            <ArrowLeft size={14} /> Estimates
          </button>
          <h3 className="mt-1 font-tight text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {editingId ? 'Edit estimate' : 'New estimate'}
            {estimate?.estimate_number && <span className="ml-2 font-medium text-mute tabular-nums">{estimate.estimate_number}</span>}
          </h3>
        </div>
        <span className="flex-1" />
        {estimate && <EstimateStatusPill estimate={estimate} />}
      </div>
      <p className="mb-4 text-[12.5px] text-mute">Quotation · no stock or payment impact</p>

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 rounded-2xl p-4 shadow-[inset_0_0_0_1px_var(--color-line)] sm:grid-cols-3">
        <label className="block">
          <span className={lbl}>Client</span>
          <select value={clientId} className={field}
            onChange={(ev) => { const id = ev.target.value; setClientId(id); const c = clients.find((x) => x.id === id); if (c?.price_tier) applyTier(String(c.price_tier).toUpperCase()); }}>
            <option value="">Walk-in (no client)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Price tier</span>
          <select value={priceTier} onChange={(ev) => applyTier(ev.target.value)} className={field}>
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="DISTRIBUTOR">Distributor</option>
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Valid until</span>
          <input type="date" value={validUntil} onChange={(ev) => setValidUntil(ev.target.value)} className={field} />
        </label>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
        <input value={prodSearch} onChange={(ev) => setProdSearch(ev.target.value)} placeholder="Search and add a product" aria-label="Search and add a product"
          className="h-10 w-full rounded-pill bg-surface pl-10 pr-4 text-[13.5px] text-ink outline-none shadow-[inset_0_0_0_1px_var(--color-line)] placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
        {prodMatches.length > 0 && (
          <div role="listbox" className="m-dialog absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-xl bg-surface p-1.5 shadow-[0_0_0_1px_rgba(17,20,24,0.06),0_18px_40px_-14px_rgba(17,20,24,0.35)]">
            {prodMatches.map((p) => (
              <button key={p.id} type="button" onClick={() => addLine(p)}
                className="flex w-full items-center justify-between rounded-pill px-3 py-2 text-left text-[13.5px] hover:bg-tile">
                <span className="truncate">{p.name}</span>
                <span className="ml-3 shrink-0 tabular-nums text-mute">{cur}{Number(p.sellingPrice || 0).toLocaleString('en-IN')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl shadow-[inset_0_0_0_1px_var(--color-line)]">
        <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-tile font-tight text-[12px] font-semibold text-mute">
              <th className="w-10 px-3.5 py-2.5 text-left font-semibold">#</th>
              <th className="px-3.5 py-2.5 text-left font-semibold">Item</th>
              <th className="w-[84px] px-2 py-2.5 text-right font-semibold">Qty</th>
              <th className="w-[120px] px-2 py-2.5 text-right font-semibold">Rate</th>
              <th className="w-[130px] px-3.5 py-2.5 text-right font-semibold">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-sep">
                <td className="px-3.5 py-2 text-mute tabular-nums">{i + 1}</td>
                <td className="px-3.5 py-2"><b className="block font-semibold">{l.name}</b><small className="block text-[12px] text-mute">GST {l.taxRate}%</small></td>
                <td className="px-2 py-2"><input type="number" min="1" aria-label={`Quantity of ${l.name}`} value={l.qty} onChange={(ev) => patchLine(i, { qty: Number(ev.target.value) })} className={`${field} h-8 text-right`} /></td>
                <td className="px-2 py-2"><input type="number" min="0" aria-label={`Rate of ${l.name}`} value={l.rate} onChange={(ev) => patchLine(i, { rate: Number(ev.target.value) })} className={`${field} h-8 text-right`} /></td>
                <td className="px-3.5 py-2 text-right font-tight font-medium tabular-nums">{rupees2(lineAmount(l), cur)}</td>
                <td className="pr-2 text-right">
                  <button type="button" onClick={() => delLine(i)} aria-label={`Remove ${l.name}`} title="Remove"
                    className="m-press inline-grid h-7 w-7 place-items-center rounded-xl text-mute hover:bg-bad-soft hover:text-bad-text"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px] text-mute">
                <FileText size={26} className="mx-auto mb-2 text-faint" />No items yet. Search a product above.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_360px]">
        <label className="block rounded-2xl p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <span className={lbl}>Notes</span>
          <textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Terms, delivery, validity…" rows={3}
            className="w-full resize-none rounded-[10px] bg-surface p-3 text-[13.5px] text-ink outline-none shadow-[inset_0_0_0_1px_var(--color-line)] placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
        </label>
        <div className="rounded-[14px] px-[18px] py-3.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
          <div className="flex justify-between py-[3px] text-[13px] text-body"><span>Taxable value</span><span className="font-tight font-medium tabular-nums text-ink-2">{rupees2(totals.taxable, cur)}</span></div>
          <div className="flex justify-between py-[3px] text-[13px] text-body"><span>GST</span><span className="font-tight font-medium tabular-nums text-ink-2">{rupees2(totals.totalTax, cur)}</span></div>
          {round !== 0 && <div className="flex justify-between py-[3px] text-[13px] text-body"><span>Round off</span><span className="font-tight font-medium tabular-nums text-ink-2">{round > 0 ? '+' : '−'}{amt2(Math.abs(round))}</span></div>}
          <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2.5 font-tight text-[15px] font-semibold">
            <span>Total</span><span className="text-[22px] tracking-[-0.02em] tabular-nums">{rupees2(totals.grandTotal, cur)}</span>
          </div>
        </div>
      </div>

      {saveErr && <WriteFailure error={saveErr} noun="estimate" onReread={onReread} className="mt-4" />}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-sep pt-4">
        <span className="mr-auto text-[12.5px] text-mute">Changing the price tier re-prices every line.</span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || !lines.length}>{saving ? 'Saving…' : editingId ? 'Update estimate' : 'Save estimate'}</Button>
      </div>
    </div>
  );
}
