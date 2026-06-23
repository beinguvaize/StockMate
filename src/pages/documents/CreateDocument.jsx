import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ScanLine, FileText, FileCheck, Wallet,
  RotateCcw, ReceiptText, Truck, FileSpreadsheet, X, Search,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { calculateGST } from '../../lib/gstEngine';

// ── Document-type registry ───────────────────────────────────────────────
// One shell, many documents. Each entry tunes the header, number series,
// whether GST posts, the stock effect, and which save path runs. Adding a
// document = adding a row here, not a new screen.
const DOC_TYPES = {
  SALES_INVOICE:   { label: 'Sales invoice',   prefix: 'INV', icon: FileText,        gst: true,  stock: 'OUT',  party: 'Bill to',  save: 'invoice' },
  QUOTATION:       { label: 'Quotation',        prefix: 'QT',  icon: FileCheck,       gst: true,  stock: 'NONE', party: 'Quote to', save: 'stub' },
  PAYMENT_IN:      { label: 'Payment in',       prefix: 'PMT', icon: Wallet,          gst: false, stock: 'NONE', party: 'Received from', save: 'stub', noItems: true },
  SALES_RETURN:    { label: 'Sales return',     prefix: 'SR',  icon: RotateCcw,       gst: true,  stock: 'IN',   party: 'Returned by', save: 'stub' },
  CREDIT_NOTE:     { label: 'Credit note',      prefix: 'CN',  icon: ReceiptText,     gst: true,  stock: 'NONE', party: 'Credit to', save: 'stub' },
  DELIVERY_CHALLAN:{ label: 'Delivery challan', prefix: 'DC',  icon: Truck,           gst: false, stock: 'OUT',  party: 'Ship to',   save: 'stub' },
  PROFORMA:        { label: 'Proforma',         prefix: 'PI',  icon: FileSpreadsheet, gst: true,  stock: 'NONE', party: 'Bill to',   save: 'stub' },
};

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

const CreateDocument = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currentTenantId, currentTenant, businessProfile = {} } = useTenant();
  const { addNotification } = useNotifications();
  const { clients = [], placeSale } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });
  const { products = [] } = useInventory(currentTenantId);

  const initialType = DOC_TYPES[params.get('type')] ? params.get('type') : 'SALES_INVOICE';
  const [docType, setDocType] = useState(initialType);
  const cfg = DOC_TYPES[docType];

  const [party, setParty] = useState(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState([]);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [markPaid, setMarkPaid] = useState(true);
  const [saving, setSaving] = useState(false);

  const businessState = businessProfile?.state || businessProfile?.business_state || '';

  // Live GST totals — single source of truth, recomputed from the lines.
  const gst = useMemo(() => calculateGST(
    lines.map((l) => ({
      qty: l.qty, rate: l.rate, discountPercent: l.disc,
      taxRate: cfg.gst ? l.taxRate : 0, hsn_code: l.hsn,
    })),
    businessState, party?.state || '',
  ), [lines, cfg.gst, businessState, party]);

  const addLine = (p) => {
    setLines((prev) => [...prev, {
      uid: `${p.id}-${Date.now()}`, productId: p.id, name: p.name,
      hsn: p.hsn_code || p.hsn || '', qty: 1, rate: Number(p.sellingPrice) || 0,
      disc: 0, taxRate: Number(p.taxRate) || 0,
    }]);
    setPicker(false); setQuery('');
  };
  const patchLine = (uid, patch) => setLines((prev) => prev.map((l) => l.uid === uid ? { ...l, ...patch } : l));
  const removeLine = (uid) => setLines((prev) => prev.filter((l) => l.uid !== uid));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products.filter((p) => `${p.name} ${p.sku || ''}`.toLowerCase().includes(q)).slice(0, 50);
  }, [products, query]);

  const canSave = party && lines.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    if (cfg.save !== 'invoice') {
      addNotification(`${cfg.label} — save path coming next (shell ready)`, 'info');
      return;
    }
    setSaving(true);
    try {
      const res = await placeSale({
        clientId: party.id,
        items: lines.map((l) => ({
          productId: l.productId, name: l.name, quantity: Number(l.qty) || 0,
          price: Number(l.rate) || 0, taxRate: Number(l.taxRate) || 0,
          cess_rate: Number(l.cess) || 0, hsn_code: l.hsn,
        })),
        totalAmount: gst.grandTotal,
        paymentMethod: payMethod,
        status: markPaid ? 'COMPLETED' : 'PENDING',
        paidAmount: markPaid ? gst.grandTotal : 0,
        date,
      });
      if (res?.error) { addNotification(`Save failed: ${res.error.message}`, 'error'); setSaving(false); return; }
      addNotification(`${cfg.label} saved`, 'success');
      navigate('/invoices');
    } catch (e) {
      addNotification(`Save failed: ${e.message}`, 'error');
      setSaving(false);
    }
  };

  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-black/5 px-4 sm:px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-black/5"><ArrowLeft size={18} /></button>
        <div className="w-7 h-7 rounded-lg bg-accent-signature text-white grid place-items-center font-black text-sm">B</div>
        <div className="font-black text-base text-ink-primary">Create {cfg.label.toLowerCase()}</div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => navigate(-1)} className="px-3 py-2 rounded-xl text-[12px] font-bold border border-black/10 hover:bg-black/5">Cancel</button>
          <button disabled={!canSave} onClick={handleSave}
            className="px-4 py-2 rounded-xl text-[12px] font-black bg-accent-signature text-white disabled:opacity-40 hover:opacity-90">
            {saving ? 'Saving…' : `Save ${cfg.label.toLowerCase()}`}
          </button>
        </div>
      </div>

      {/* Doc-type switch */}
      <div className="px-4 sm:px-6 py-3 flex gap-2 flex-wrap border-b border-black/5 bg-white">
        {Object.entries(DOC_TYPES).map(([k, d]) => (
          <button key={k} onClick={() => { setDocType(k); }}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              docType === k ? 'bg-accent-signature text-white' : 'text-gray-500 border border-black/10 hover:text-ink-primary'
            }`}>{d.label}</button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
        {/* Party + meta */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">{cfg.party}</div>
            {party ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 grid place-items-center font-black text-[12px]">
                  {party.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="font-black text-sm text-ink-primary">{party.name}</div>
                  <div className="text-[11px] text-gray-500">{party.gstin ? `GSTIN ${party.gstin} · ` : ''}{party.state || '—'}</div>
                </div>
                <button onClick={() => setPartyOpen(true)} className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-lg border border-black/10 hover:bg-black/5">Change</button>
              </div>
            ) : (
              <button onClick={() => setPartyOpen(true)} className="w-full py-8 rounded-xl border border-dashed border-accent-signature/40 text-[13px] font-bold text-accent-signature hover:bg-accent-signature/5">
                + Add party
              </button>
            )}
            {partyOpen && (
              <div className="mt-3 max-h-52 overflow-auto rounded-xl border border-black/10 divide-y divide-black/5">
                {clients.length === 0 && <div className="p-3 text-[12px] text-gray-400">No clients yet.</div>}
                {clients.map((c) => (
                  <button key={c.id} onClick={() => { setParty(c); setPartyOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-black/5 text-[13px]">
                    <span className="font-bold text-ink-primary">{c.name}</span>
                    <span className="text-[11px] text-gray-400 ml-2">{c.state || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 grid grid-cols-2 gap-3">
            <Field label={`${cfg.prefix} no.`} value={`${cfg.prefix}-XXXX`} mono />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Date</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full text-[13px] font-bold border border-black/10 rounded-lg px-2 py-1.5 outline-none focus:border-accent-signature/40" />
            </div>
            <Field label="Place of supply" value={party?.state || businessState || '—'} />
            <Field label="Type" value={cfg.gst ? 'GST document' : 'Non-GST'} />
          </div>
        </div>

        {/* Item grid */}
        {!cfg.noItems && (
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="grid grid-cols-[28px_1.6fr_0.8fr_0.5fr_0.8fr_0.7fr_0.8fr_0.9fr_28px] gap-2 px-3 py-2.5 bg-canvas text-[10px] uppercase tracking-wider text-gray-400">
              <div>#</div><div>Item / service</div><div>HSN/SAC</div><div className="text-right">Qty</div>
              <div className="text-right">Rate</div><div className="text-right">Disc%</div><div className="text-right">Tax</div><div className="text-right">Amount</div><div></div>
            </div>
            {lines.map((l, i) => {
              const lineAmt = (Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.disc) || 0) / 100);
              return (
                <div key={l.uid} className="grid grid-cols-[28px_1.6fr_0.8fr_0.5fr_0.8fr_0.7fr_0.8fr_0.9fr_28px] gap-2 px-3 py-2 border-t border-black/5 items-center text-[13px]">
                  <div className="text-gray-400">{i + 1}</div>
                  <div className="font-bold text-ink-primary truncate">{l.name}</div>
                  <input value={l.hsn} onChange={(e) => patchLine(l.uid, { hsn: e.target.value.replace(/[^0-9]/g, '') })}
                    className="font-mono text-[12px] border border-black/10 rounded px-1.5 py-1 outline-none focus:border-accent-signature/40" placeholder="HSN" />
                  <input type="number" value={l.qty} onChange={(e) => patchLine(l.uid, { qty: e.target.value })}
                    className="text-right border border-black/10 rounded px-1.5 py-1 outline-none focus:border-accent-signature/40" />
                  <input type="number" value={l.rate} onChange={(e) => patchLine(l.uid, { rate: e.target.value })}
                    className="text-right border border-black/10 rounded px-1.5 py-1 outline-none focus:border-accent-signature/40" />
                  <input type="number" value={l.disc} onChange={(e) => patchLine(l.uid, { disc: e.target.value })}
                    className="text-right border border-black/10 rounded px-1.5 py-1 outline-none focus:border-accent-signature/40" />
                  <div className="text-right text-gray-500">{cfg.gst ? `${l.taxRate}%` : '—'}</div>
                  <div className="text-right font-bold font-mono">{inr(lineAmt)}</div>
                  <button onClick={() => removeLine(l.uid)} className="text-gray-300 hover:text-rose-500"><Trash2 size={14} /></button>
                </div>
              );
            })}
            <div className="flex gap-2 p-2.5 border-t border-black/5">
              <button onClick={() => setPicker(true)} className="flex-1 py-2.5 rounded-xl border border-dashed border-accent-signature/40 text-[13px] font-bold text-accent-signature hover:bg-accent-signature/5">
                <Plus size={14} className="inline -mt-0.5 mr-1" />Add item
              </button>
              <button className="px-4 py-2.5 rounded-xl border border-black/10 text-[13px] font-bold hover:bg-black/5"><ScanLine size={14} className="inline -mt-0.5 mr-1.5" />Scan</button>
            </div>
          </div>
        )}

        {/* Footer: terms + totals */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Terms</div>
            <div className="text-[12px] text-gray-500 leading-relaxed">
              Goods once sold are not taken back. Disputes subject to local jurisdiction.
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-black/10 shadow-sm p-4">
            <Row label="Taxable value" value={inr(gst.taxable)} />
            {cfg.gst && party?.state && businessState && party.state.toLowerCase() !== businessState.toLowerCase() ? (
              <Row label="IGST" value={inr(gst.igst)} />
            ) : cfg.gst ? (
              <>
                <Row label="CGST" value={inr(gst.cgst)} />
                <Row label="SGST" value={inr(gst.sgst)} />
              </>
            ) : null}
            {!!gst.roundOff && <Row label="Round off" value={inr(gst.roundOff)} muted />}
            <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-black/10">
              <span className="font-black text-ink-primary">Total</span>
              <span className="font-black text-xl font-mono text-amber-800">{inr(cfg.gst ? gst.grandTotal : gst.subtotal)}</span>
            </div>
            {cfg.save === 'invoice' && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/5">
                <input id="mp" type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                <label htmlFor="mp" className="text-[13px] font-bold">Mark paid</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="ml-auto text-[12px] border border-black/10 rounded-lg px-2 py-1.5 outline-none">
                  <option>CASH</option><option>BANK</option><option>UPI</option><option>CREDIT</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product picker overlay */}
      {picker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 sm:p-10" onClick={() => setPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 p-3 border-b border-black/5">
              <Search size={16} className="text-gray-400" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…"
                className="flex-1 text-[14px] outline-none" />
              <button onClick={() => setPicker(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="overflow-auto divide-y divide-black/5">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => addLine(p)} className="w-full text-left px-4 py-2.5 hover:bg-black/5 flex items-center gap-3">
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

const Field = ({ label, value, mono }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</div>
    <div className={`text-[13px] font-bold text-ink-primary ${mono ? 'font-mono' : ''}`}>{value}</div>
  </div>
);

const Row = ({ label, value, muted }) => (
  <div className="flex justify-between text-[13px] py-1.5">
    <span className="text-gray-500">{label}</span>
    <span className={`font-mono ${muted ? 'text-gray-400' : 'text-ink-primary'}`}>{value}</span>
  </div>
);

export default CreateDocument;
