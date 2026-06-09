import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useEstimates } from '../hooks/useEstimates';
import { usePeople } from '../hooks/usePeople';
import { useInventory } from '../hooks/useInventory';
import { calculateGST, formatINR } from '../lib/gstEngine';
import { Plus, Search, Trash2, X, FileText, Send, CheckCircle2, ArrowRight, MessageCircle } from 'lucide-react';

const STATUS_STYLE = {
  DRAFT:     'bg-gray-100 text-gray-600',
  SENT:      'bg-blue-50 text-blue-600',
  ACCEPTED:  'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-50 text-red-600',
  EXPIRED:   'bg-amber-50 text-amber-600',
  CONVERTED: 'bg-purple-50 text-purple-600',
};

const Estimates = () => {
  const { currentTenantId, businessProfile } = useTenant();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { estimates, create, setStatus, remove } = useEstimates(currentTenantId);
  const { clients } = usePeople(currentTenantId);
  const { products } = useInventory(currentTenantId);

  const cur = businessProfile?.currencySymbol || '₹';
  const bizState = businessProfile?.state || '';

  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState('');
  const [lines, setLines] = useState([]); // {id,name,qty,rate,taxRate,hsn_code}
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const client = clients?.find(c => c.id === clientId);
  const totals = useMemo(
    () => calculateGST(lines, bizState, client?.state || ''),
    [lines, bizState, client],
  );

  const prodMatches = useMemo(() => {
    const q = prodSearch.trim().toLowerCase();
    if (!q) return [];
    return (products || []).filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [prodSearch, products]);

  const addLine = (p) => {
    setLines(prev => [...prev, {
      id: p.id, name: p.name, qty: 1,
      rate: Number(p.sellingPrice || 0),
      taxRate: Number(p.taxRate ?? 18),
      hsn_code: p.hsn_code || p.sku || '',
    }]);
    setProdSearch('');
  };
  const patchLine = (i, patch) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const delLine = (i) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const reset = () => { setClientId(''); setLines([]); setValidUntil(''); setNotes(''); setProdSearch(''); };

  const save = async () => {
    if (!lines.length) return;
    setSaving(true);
    const t = totals;
    const { error } = await create({
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
    });
    setSaving(false);
    if (!error) { setAdding(false); reset(); }
  };

  // Convert → hand the line items to the POS via sessionStorage, mark CONVERTED.
  const convert = async (est) => {
    try {
      sessionStorage.setItem('estimate_cart', JSON.stringify({
        estimateId: est.id, clientId: est.client_id, items: est.items || [],
      }));
    } catch (_) {/* ignore */}
    await setStatus(est.id, 'CONVERTED');
    navigate(`/${tenantSlug}/sales`);
  };

  const shareWhatsApp = (est) => {
    const lines = (est.items || []).map(i => `• ${i.name} × ${i.qty} = ${formatINR((i.qty || 0) * (i.rate || 0))}`).join('\n');
    const msg = `*${businessProfile?.name || ''}*\n*Quotation: ${est.estimate_number}*\n${est.valid_until ? `Valid until: ${est.valid_until}\n` : ''}\n${lines}\n\n*Total: ${formatINR(est.grand_total)}*\n\nReply to confirm. Thank you!`;
    const phone = (est.client_phone || '').replace(/[^0-9]/g, '');
    const target = phone.length === 10 ? `91${phone}` : phone;
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="animate-fade-in flex flex-col gap-4 pb-12">
      <div className="flex justify-between items-center gap-3 pb-3 border-b border-black/5 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-extrabold text-ink-primary leading-none">Estimates<span className="text-amber-500">.</span></h1>
          <span className="text-[11px] font-semibold text-gray-400 hidden sm:block">Quotations · convert to sale</span>
        </div>
        <button onClick={() => setAdding(true)} className="h-10 px-4 rounded-xl bg-amber-600 text-white text-[13px] font-bold flex items-center gap-2 hover:bg-amber-700">
          <Plus size={15} strokeWidth={2.6} /> New estimate
        </button>
      </div>

      <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[8rem_1fr_7rem_8rem_9rem] gap-4 px-5 py-2.5 text-[10px] uppercase tracking-wider font-bold text-gray-400 border-b border-black/5">
          <div>Number</div><div>Client</div><div className="text-right">Total</div><div className="text-center">Status</div><div className="text-right">Actions</div>
        </div>
        {estimates.length === 0 && <div className="px-5 py-16 text-center text-sm font-semibold text-gray-400">No estimates yet.</div>}
        <div className="divide-y divide-black/5">
          {estimates.map(e => (
            <div key={e.id} className="grid grid-cols-2 md:grid-cols-[8rem_1fr_7rem_8rem_9rem] gap-x-4 gap-y-1 px-5 py-3 items-center hover:bg-amber-50/30">
              <div className="font-mono text-[12px] font-bold text-ink-primary">{e.estimate_number}</div>
              <div className="text-[13px] font-semibold text-ink-primary truncate">{e.client_name || '—'}</div>
              <div className="text-right font-mono tabular-nums text-[13px] font-bold">{cur}{Math.round(e.grand_total).toLocaleString('en-IN')}</div>
              <div className="md:text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[e.status] || STATUS_STYLE.DRAFT}`}>{e.status}</span></div>
              <div className="flex items-center justify-end gap-1" onClick={ev => ev.stopPropagation()}>
                <button onClick={() => shareWhatsApp(e)} title="WhatsApp" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><MessageCircle size={15} /></button>
                {e.status === 'DRAFT' && <button onClick={() => setStatus(e.id, 'SENT')} title="Mark sent" className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"><Send size={14} /></button>}
                {['DRAFT','SENT'].includes(e.status) && <button onClick={() => setStatus(e.id, 'ACCEPTED')} title="Accept" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><CheckCircle2 size={15} /></button>}
                {e.status !== 'CONVERTED' && <button onClick={() => convert(e)} title="Convert to sale" className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600"><ArrowRight size={15} /></button>}
                <button onClick={() => remove(e.id)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {adding && (
        <div className="modal-overlay" onClick={() => setAdding(false)}>
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[1.75rem] shadow-2xl flex flex-col overflow-hidden" onClick={ev => ev.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-black/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center"><FileText size={18} /></div>
                <div>
                  <h2 className="text-base font-extrabold text-ink-primary leading-none">New Estimate</h2>
                  <p className="text-[11px] font-semibold text-gray-400 mt-1">Quotation · no stock or payment impact</p>
                </div>
              </div>
              <button onClick={() => setAdding(false)} className="w-8 h-8 rounded-lg hover:bg-black/5 text-gray-400 hover:text-ink-primary flex items-center justify-center"><X size={18} /></button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Client</span>
                  <select value={clientId} onChange={e => setClientId(e.target.value)} className="mt-1 w-full h-11 px-3 bg-white border border-black/10 rounded-xl text-[13px] font-semibold text-ink-primary outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20">
                    <option value="">Walk-in (no client)</option>
                    {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Valid until</span>
                  <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="mt-1 w-full h-11 px-3 bg-white border border-black/10 rounded-xl text-[13px] font-semibold text-ink-primary outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" />
                </label>
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Search & add product…" className="w-full h-11 pl-10 pr-3 bg-white border border-black/10 rounded-xl text-[13px] font-medium outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" />
                {prodMatches.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-black/10 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {prodMatches.map(p => (
                      <button key={p.id} onClick={() => addLine(p)} className="w-full text-left px-3.5 py-2.5 hover:bg-amber-50 text-[13px] font-medium flex justify-between items-center border-b border-black/[0.04] last:border-0">
                        <span className="truncate">{p.name}</span><span className="font-mono tabular-nums text-gray-500 shrink-0 ml-3">{cur}{Number(p.sellingPrice || 0).toLocaleString('en-IN')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Line items */}
              <div className="border border-black/[0.07] rounded-2xl overflow-hidden">
                <div className="grid grid-cols-[1fr_4rem_5.5rem_5.5rem_2rem] gap-2 px-4 py-2 bg-black/[0.025] text-[9px] uppercase tracking-widest font-bold text-gray-400 border-b border-black/5">
                  <div>Item</div><div className="text-center">Qty</div><div className="text-right">Rate</div><div className="text-right">Amount</div><div />
                </div>
                {lines.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <FileText size={28} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-[12px] font-semibold text-gray-400">No items yet — search a product above.</p>
                  </div>
                )}
                <div className="divide-y divide-black/[0.05]">
                  {lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_4rem_5.5rem_5.5rem_2rem] gap-2 px-4 py-2.5 items-center">
                      <div className="min-w-0"><div className="text-[13px] font-semibold text-ink-primary truncate">{l.name}</div><div className="text-[10px] font-bold text-gray-400">GST {l.taxRate}%</div></div>
                      <input type="number" min="1" value={l.qty} onChange={e => patchLine(i, { qty: Number(e.target.value) })} className="h-8 px-1 border border-black/10 rounded-lg text-[12px] text-center font-mono tabular-nums outline-none focus:border-amber-400" />
                      <input type="number" min="0" value={l.rate} onChange={e => patchLine(i, { rate: Number(e.target.value) })} className="h-8 px-2 border border-black/10 rounded-lg text-[12px] text-right font-mono tabular-nums outline-none focus:border-amber-400" />
                      <span className="text-right font-mono tabular-nums text-[12px] font-bold text-ink-primary">{cur}{Math.round((l.qty || 0) * (l.rate || 0)).toLocaleString('en-IN')}</span>
                      <button onClick={() => delLine(i)} className="text-gray-300 hover:text-red-500 flex justify-end"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-amber-50/60 border border-amber-100 rounded-2xl px-4 py-3">
                <div className="flex justify-between text-[12px] mb-1.5"><span className="font-semibold text-gray-500">Taxable</span><span className="font-mono tabular-nums font-bold text-ink-primary">{cur}{Math.round(totals.taxable || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-[12px] mb-2"><span className="font-semibold text-gray-500">Tax (GST)</span><span className="font-mono tabular-nums font-bold text-ink-primary">{cur}{Math.round(totals.totalTax || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between items-baseline pt-2 border-t border-amber-200/70"><span className="text-[13px] font-extrabold text-ink-primary">Total</span><span className="font-mono tabular-nums text-lg font-extrabold text-amber-700">{cur}{Math.round(totals.grandTotal || 0).toLocaleString('en-IN')}</span></div>
              </div>

              <label className="block">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Notes</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Terms, delivery, validity…" rows={2} className="mt-1 w-full p-3 bg-white border border-black/10 rounded-xl text-[12px] outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 resize-none" />
              </label>
            </div>

            {/* Sticky footer */}
            <div className="flex gap-2 justify-end px-6 py-4 border-t border-black/5 bg-white">
              <button onClick={() => setAdding(false)} className="h-11 px-5 rounded-xl border border-black/10 text-[13px] font-bold text-gray-600 hover:bg-black/5">Cancel</button>
              <button onClick={save} disabled={saving || !lines.length} className="h-11 px-6 rounded-xl bg-amber-600 text-white text-[13px] font-bold disabled:opacity-40 hover:bg-amber-700 flex items-center gap-2 transition-colors"><FileText size={15} /> {saving ? 'Saving…' : 'Save estimate'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Estimates;
