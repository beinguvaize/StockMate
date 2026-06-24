import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ScanLine, Search, X } from 'lucide-react';

// Shared building blocks for the document builder (PartyPicker, DocItemGrid,
// TotalsPanel). Extracted from CreateDocument so the same parts can power
// other builders later. All presentational — state stays with the parent.

export const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Field = ({ label, value, mono }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</div>
    <div className={`text-[13px] font-bold text-ink-primary ${mono ? 'font-mono' : ''}`}>{value}</div>
  </div>
);

export const Row = ({ label, value, muted }) => (
  <div className="flex justify-between text-[13px] py-1.5">
    <span className="text-gray-500">{label}</span>
    <span className={`font-mono ${muted ? 'text-gray-400' : 'text-ink-primary'}`}>{value}</span>
  </div>
);

export const PartyPicker = ({ label, party, clients = [], onChange, manual = false }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">{label}</div>
      {manual && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={party?.name || ''} placeholder="Customer name"
            onChange={(e) => onChange({ ...(party || {}), name: e.target.value, manual: true })}
            className="col-span-2 text-[13px] font-bold border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-accent-signature/40" />
          <input value={party?.gstin || ''} placeholder="GSTIN (optional)"
            onChange={(e) => onChange({ ...(party || {}), gstin: e.target.value.toUpperCase(), manual: true })}
            className="font-mono text-[12px] border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-accent-signature/40" />
          <input value={party?.state || ''} placeholder="State / place of supply"
            onChange={(e) => onChange({ ...(party || {}), state: e.target.value, manual: true })}
            className="text-[12px] border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-accent-signature/40" />
          <button onClick={() => setOpen((v) => !v)} className="col-span-2 text-[11px] font-bold text-accent-signature text-left">{open ? '− hide' : '+ pick an existing client instead'}</button>
        </div>
      )}
      {!manual && (party ? (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 grid place-items-center font-black text-[12px]">{party.name?.slice(0, 2).toUpperCase()}</div>
          <div className="leading-tight">
            <div className="font-black text-sm text-ink-primary">{party.name}</div>
            <div className="text-[11px] text-gray-500">{party.gstin ? `GSTIN ${party.gstin} · ` : ''}{party.state || '—'}</div>
          </div>
          <button onClick={() => setOpen(true)} className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-lg border border-black/10 hover:bg-black/5">Change</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="w-full py-8 rounded-xl border border-dashed border-accent-signature/40 text-[13px] font-bold text-accent-signature hover:bg-accent-signature/5">+ Add party</button>
      ))}
      {open && (
        <div className="mt-3 max-h-52 overflow-auto rounded-xl border border-black/10 divide-y divide-black/5">
          {clients.length === 0 && <div className="p-3 text-[12px] text-gray-400">No clients yet.</div>}
          {clients.map((c) => (
            <button key={c.id} onClick={() => { onChange(c); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-black/5 text-[13px]">
              <span className="font-bold text-ink-primary">{c.name}</span>
              <span className="text-[11px] text-gray-400 ml-2">{c.state || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const COLS = 'grid grid-cols-[28px_1.6fr_0.8fr_0.5fr_0.8fr_0.7fr_0.8fr_0.9fr_28px] gap-2';
const cell = 'border border-black/10 rounded px-1.5 py-1 outline-none focus:border-accent-signature/40';

export const DocItemGrid = ({ lines = [], products = [], gstOn = true, onAdd, onPatch, onRemove, manual = false, onAddBlank }) => {
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter((p) => `${p.name} ${p.sku || ''}`.toLowerCase().includes(q)).slice(0, 50);
  }, [products, query]);

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
      <div className={`${COLS} px-3 py-2.5 bg-canvas text-[10px] uppercase tracking-wider text-gray-400`}>
        <div>#</div><div>Item / service</div><div>HSN/SAC</div><div className="text-right">Qty</div>
        <div className="text-right">Rate</div><div className="text-right">Disc%</div><div className="text-right">Tax</div><div className="text-right">Amount</div><div></div>
      </div>
      {lines.map((l, i) => {
        const lineAmt = (Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.disc) || 0) / 100);
        return (
          <div key={l.uid} className={`${COLS} px-3 py-2 border-t border-black/5 items-center text-[13px]`}>
            <div className="text-gray-400">{i + 1}</div>
            {manual
              ? <input value={l.name} onChange={(e) => onPatch(l.uid, { name: e.target.value })} placeholder="Item name" className={`font-bold ${cell}`} />
              : <div className="font-bold text-ink-primary truncate">{l.name}</div>}
            <input value={l.hsn} onChange={(e) => onPatch(l.uid, { hsn: e.target.value.replace(/[^0-9]/g, '') })} className={`font-mono text-[12px] ${cell}`} placeholder="HSN" />
            <input type="number" value={l.qty} onChange={(e) => onPatch(l.uid, { qty: e.target.value })} className={`text-right ${cell}`} />
            <input type="number" value={l.rate} onChange={(e) => onPatch(l.uid, { rate: e.target.value })} className={`text-right ${cell}`} />
            <input type="number" value={l.disc} onChange={(e) => onPatch(l.uid, { disc: e.target.value })} className={`text-right ${cell}`} />
            {manual && gstOn
              ? <input type="number" value={l.taxRate} onChange={(e) => onPatch(l.uid, { taxRate: e.target.value })} className={`text-right ${cell}`} />
              : <div className="text-right text-gray-500">{gstOn ? `${l.taxRate}%` : '—'}</div>}
            <div className="text-right font-bold font-mono">{inr(lineAmt)}</div>
            <button onClick={() => onRemove(l.uid)} className="text-gray-300 hover:text-rose-500"><Trash2 size={14} /></button>
          </div>
        );
      })}
      <div className="flex gap-2 p-2.5 border-t border-black/5">
        <button onClick={() => (manual ? onAddBlank?.() : setPicker(true))} className="flex-1 py-2.5 rounded-xl border border-dashed border-accent-signature/40 text-[13px] font-bold text-accent-signature hover:bg-accent-signature/5"><Plus size={14} className="inline -mt-0.5 mr-1" />Add item</button>
        {manual
          ? <button onClick={() => setPicker(true)} className="px-4 py-2.5 rounded-xl border border-black/10 text-[13px] font-bold hover:bg-black/5">Pick product</button>
          : <button className="px-4 py-2.5 rounded-xl border border-black/10 text-[13px] font-bold hover:bg-black/5"><ScanLine size={14} className="inline -mt-0.5 mr-1.5" />Scan</button>}
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 sm:p-10" onClick={() => setPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 p-3 border-b border-black/5">
              <Search size={16} className="text-gray-400" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="flex-1 text-[14px] outline-none" />
              <button onClick={() => setPicker(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="overflow-auto divide-y divide-black/5">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => { onAdd(p); setPicker(false); setQuery(''); }} className="w-full text-left px-4 py-2.5 hover:bg-black/5 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-bold text-[13px] text-ink-primary">{p.name}</div>
                    <div className="text-[11px] text-gray-400">{p.sku || ''} {p.hsn_code ? `· HSN ${p.hsn_code}` : ''} · {p.taxRate || 0}% GST</div>
                  </div>
                  <div className="font-mono text-[13px] font-bold">{inr(p.sellingPrice)}</div>
                </button>
              ))}
              {filtered.length === 0 && <div className="p-4 text-[13px] text-gray-400">No products match.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TotalsPanel = ({ gst, gstOn = true, interstate = false, showPayment = false, markPaid, setMarkPaid, payMethod, setPayMethod }) => (
  <div className="bg-white rounded-2xl border border-black/10 shadow-sm p-4">
    <Row label="Taxable value" value={inr(gst.taxable)} />
    {gstOn && interstate ? (
      <Row label="IGST" value={inr(gst.igst)} />
    ) : gstOn ? (
      <>
        <Row label="CGST" value={inr(gst.cgst)} />
        <Row label="SGST" value={inr(gst.sgst)} />
      </>
    ) : null}
    {!!gst.roundOff && <Row label="Round off" value={inr(gst.roundOff)} muted />}
    <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-black/10">
      <span className="font-black text-ink-primary">Total</span>
      <span className="font-black text-xl font-mono text-amber-800">{inr(gstOn ? gst.grandTotal : gst.subtotal)}</span>
    </div>
    {showPayment && (
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/5">
        <input id="mp" type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
        <label htmlFor="mp" className="text-[13px] font-bold">Mark paid</label>
        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="ml-auto text-[12px] border border-black/10 rounded-lg px-2 py-1.5 outline-none">
          <option>CASH</option><option>BANK</option><option>UPI</option><option>CREDIT</option>
        </select>
      </div>
    )}
  </div>
);
