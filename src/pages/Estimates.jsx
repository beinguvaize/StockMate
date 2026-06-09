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
          <div className="glass-modal !max-w-2xl" onClick={ev => ev.stopPropagation()}>
            <div className="flex justify-between items-start mb-3 border-b border-black/5 pb-3">
              <h2 className="text-lg font-bold text-ink-primary">New Estimate</h2>
              <button onClick={() => setAdding(false)}><X size={18} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <select value={clientId} onChange={e => setClientId(e.target.value)} className="h-10 px-3 border border-black/10 rounded-xl text-[13px] font-semibold">
                <option value="">Walk-in (no client)</option>
                {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="h-10 px-3 border border-black/10 rounded-xl text-[13px] font-semibold" placeholder="Valid until" />
            </div>

            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Add product…" className="w-full h-10 pl-9 pr-3 border border-black/10 rounded-xl text-[13px]" />
              {prodMatches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-black/10 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {prodMatches.map(p => (
                    <button key={p.id} onClick={() => addLine(p)} className="w-full text-left px-3 py-2 hover:bg-amber-50 text-[13px] flex justify-between">
                      <span>{p.name}</span><span className="font-mono text-gray-500">{cur}{Number(p.sellingPrice || 0).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto border border-black/5 rounded-xl divide-y divide-black/5 mb-3">
              {lines.length === 0 && <div className="px-3 py-8 text-center text-[12px] text-gray-400">Add products above.</div>}
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{l.name}</div><div className="text-[10px] text-gray-400">GST {l.taxRate}%</div></div>
                  <input type="number" min="1" value={l.qty} onChange={e => patchLine(i, { qty: Number(e.target.value) })} className="w-14 h-8 px-2 border border-black/10 rounded text-[12px] text-center" />
                  <span className="text-gray-400 text-xs">×</span>
                  <input type="number" min="0" value={l.rate} onChange={e => patchLine(i, { rate: Number(e.target.value) })} className="w-20 h-8 px-2 border border-black/10 rounded text-[12px] text-right font-mono" />
                  <span className="w-20 text-right font-mono text-[12px] font-bold">{cur}{Math.round((l.qty || 0) * (l.rate || 0)).toLocaleString('en-IN')}</span>
                  <button onClick={() => delLine(i)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>

            <div className="flex justify-between text-[12px] mb-1"><span className="text-gray-500">Taxable</span><span className="font-mono">{cur}{Math.round(totals.taxable || 0).toLocaleString('en-IN')}</span></div>
            <div className="flex justify-between text-[12px] mb-1"><span className="text-gray-500">Tax</span><span className="font-mono">{cur}{Math.round(totals.totalTax || 0).toLocaleString('en-IN')}</span></div>
            <div className="flex justify-between text-[14px] font-bold mb-3 pt-2 border-t border-black/5"><span>Total</span><span className="font-mono text-amber-700">{cur}{Math.round(totals.grandTotal || 0).toLocaleString('en-IN')}</span></div>

            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full p-2 border border-black/10 rounded-xl text-[12px] mb-3" />

            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdding(false)} className="h-10 px-4 rounded-xl border border-black/10 text-[13px] font-bold">Cancel</button>
              <button onClick={save} disabled={saving || !lines.length} className="h-10 px-5 rounded-xl bg-amber-600 text-white text-[13px] font-bold disabled:opacity-40 flex items-center gap-2"><FileText size={15} /> Save estimate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Estimates;
