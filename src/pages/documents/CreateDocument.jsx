import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, FileText, FileCheck, Wallet,
  RotateCcw, ReceiptText, Truck, FileSpreadsheet, FilePen,
} from 'lucide-react';
import InvoiceTemplate from '../../components/invoice/InvoiceTemplate';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { useEstimates } from '../../hooks/useEstimates';
import { useAccounts } from '../../hooks/useAccounts';
import { calculateGST } from '../../lib/gstEngine';
import { tierPrice } from '../../lib/priceResolver';
import { PartyPicker, DocItemGrid, TotalsPanel, Field, inr } from '../../components/documents/DocParts';

const genId = (p) => `${p}-${Date.now().toString(36).toUpperCase()}`;

// ── Document-type registry ───────────────────────────────────────────────
// One shell, many documents. Each entry tunes the header, number series,
// whether GST posts, the stock effect, and which save path runs. Adding a
// document = adding a row here, not a new screen.
const DOC_TYPES = {
  SALES_INVOICE:   { label: 'Sales invoice',   prefix: 'INV', icon: FileText,        gst: true,  stock: 'OUT',  party: 'Bill to',  save: 'invoice' },
  QUOTATION:       { label: 'Quotation',        prefix: 'QT',  icon: FileCheck,       gst: true,  stock: 'NONE', party: 'Quote to', save: 'estimate' },
  PAYMENT_IN:      { label: 'Payment in',       prefix: 'PMT', icon: Wallet,          gst: false, stock: 'NONE', party: 'Received from', save: 'payment', noItems: true },
  SALES_RETURN:    { label: 'Sales return',     prefix: 'SR',  icon: RotateCcw,       gst: true,  stock: 'IN',   party: 'Returned by', save: 'return' },
  CREDIT_NOTE:     { label: 'Credit note',      prefix: 'CN',  icon: ReceiptText,     gst: true,  stock: 'NONE', party: 'Credit to', save: 'return' },
  DELIVERY_CHALLAN:{ label: 'Delivery challan', prefix: 'DC',  icon: Truck,           gst: false, stock: 'OUT',  party: 'Ship to',   save: 'estimate' },
  PROFORMA:        { label: 'Proforma',         prefix: 'PI',  icon: FileSpreadsheet, gst: true,  stock: 'NONE', party: 'Bill to',   save: 'estimate' },
  MANUAL_INVOICE:  { label: 'Manual bill',      prefix: 'MB',  icon: FilePen,         gst: true,  stock: 'NONE', party: 'Bill to',   save: 'manual', manual: true },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const CreateDocument = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { currentTenantId, currentTenant, businessProfile = {} } = useTenant();
  const { addNotification } = useNotifications();
  const { clients = [], sales = [], placeSale, processSalesReturn, settleSale } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });
  const { products = [] } = useInventory(currentTenantId);
  const { create: createEstimate } = useEstimates(currentTenantId);
  const { accounts = [], addTxn } = useAccounts(currentTenantId);

  const initialType = DOC_TYPES[params.get('type')] ? params.get('type') : 'SALES_INVOICE';
  const [docType, setDocType] = useState(initialType);
  const cfg = DOC_TYPES[docType];

  const [party, setParty] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState([]);
  const [payMethod, setPayMethod] = useState('CASH');
  const [markPaid, setMarkPaid] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [depositAccount, setDepositAccount] = useState('');
  const [saving, setSaving] = useState(false);
  const [printBill, setPrintBill] = useState(null); // manual bill → invoice template preview

  // Default the deposit account once accounts load (prefer a Cash account).
  const defaultAccount = useMemo(
    () => accounts.find((a) => a.type === 'CASH')?.id || accounts[0]?.id || '',
    [accounts],
  );
  const depAcc = depositAccount || defaultAccount;

  // Post a money-in ledger entry to the chosen account (best-effort; a missing
  // account just skips the ledger, the sale/payment still succeeds).
  const postIncome = async (amount, refType, refId) => {
    if (!depAcc || !(Number(amount) > 0)) return;
    try {
      await addTxn({ account_id: depAcc, direction: 'IN', amount, mode: payMethod, ref_type: refType, ref_id: refId, note: party?.name || refType });
    } catch { /* ledger is non-blocking */ }
  };

  const businessState = businessProfile?.state || businessProfile?.business_state || '';

  // Live GST totals — single source of truth, recomputed from the lines.
  const gst = useMemo(() => calculateGST(
    lines.map((l) => ({
      qty: l.qty, rate: l.rate, discountPercent: l.disc,
      taxRate: cfg.gst ? l.taxRate : 0, hsn_code: l.hsn,
    })),
    businessState, party?.state || '',
  ), [lines, cfg.gst, businessState, party]);

  const addLine = (p) => setLines((prev) => [...prev, {
    uid: `${p.id}-${Date.now()}`, productId: p.id, name: p.name,
    hsn: p.hsn_code || p.hsn || '', qty: 1, rate: tierPrice(p, party?.price_tier),
    disc: 0, taxRate: Number(p.taxRate) || 0,
  }]);
  const addBlankLine = () => setLines((prev) => [...prev, {
    uid: `MB-${Date.now()}-${prev.length}`, productId: null, name: '',
    hsn: '', qty: 1, rate: 0, disc: 0, taxRate: cfg.gst ? 18 : 0,
  }]);
  const patchLine = (uid, patch) => setLines((prev) => prev.map((l) => l.uid === uid ? { ...l, ...patch } : l));
  const removeLine = (uid) => setLines((prev) => prev.filter((l) => l.uid !== uid));

  const interstate = !!(party?.state && businessState && party.state.toLowerCase() !== businessState.toLowerCase());
  const lineItems = () => lines.map((l) => ({
    productId: l.productId, id: l.productId, name: l.name, quantity: Number(l.qty) || 0,
    qty: Number(l.qty) || 0, price: Number(l.rate) || 0, rate: Number(l.rate) || 0,
    taxRate: Number(l.taxRate) || 0, cess_rate: Number(l.cess) || 0, hsn_code: l.hsn,
    discountPercent: Number(l.disc) || 0,
  }));

  const canSave = !saving && party?.name && (
    cfg.save === 'payment' ? Number(payAmount) > 0 : lines.length > 0
  );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const fail = (m) => { addNotification(`Save failed: ${m}`, 'error'); setSaving(false); };
    try {
      let res;
      if (cfg.save === 'invoice') {
        res = await placeSale({
          clientId: party.id, items: lineItems(), totalAmount: gst.grandTotal,
          paymentMethod: payMethod, status: markPaid ? 'COMPLETED' : 'PENDING',
          paidAmount: markPaid ? gst.grandTotal : 0, date,
        });
        if (res?.error) return fail(res.error.message);
        if (markPaid) await postIncome(gst.grandTotal, 'SALE', res?.id);
        addNotification('Sales invoice saved', 'success');
        return navigate('/invoices');
      }

      if (cfg.save === 'estimate') {
        // Quotation / Proforma / Delivery Challan — non-posting documents
        // stored in the estimates table, tagged by doc_type.
        res = await createEstimate({
          doc_type: docType,
          client_id: party.id, client_name: party.name, client_gstin: party.gstin || null,
          client_address: party.address || null, place_of_supply: party.state || businessState || null,
          is_interstate: interstate, items: gst.items,
          taxable_amount: gst.taxable, tax_total: gst.totalTax, cgst_amount: gst.cgst,
          sgst_amount: gst.sgst, igst_amount: gst.igst, discount_total: gst.totalDiscount || 0,
          round_off: gst.roundOff, grand_total: cfg.gst ? gst.grandTotal : gst.subtotal,
          status: 'DRAFT',
        });
        if (res?.error) return fail(res.error.message);
        addNotification(`${cfg.label} saved`, 'success');
        return navigate('/estimates');
      }

      if (cfg.save === 'manual') {
        // Manual bill — non-posting. Stored in estimates (excluded from GST
        // reports / sales / stock); printed on the invoice template.
        const num = `MB-${Date.now().toString(36).toUpperCase()}`;
        res = await createEstimate({
          doc_type: 'MANUAL_INVOICE', estimate_number: num,
          client_id: party.id || null, client_name: party.name, client_gstin: party.gstin || null,
          place_of_supply: party.state || businessState || null, is_interstate: interstate,
          items: gst.items, taxable_amount: gst.taxable, tax_total: gst.totalTax,
          cgst_amount: gst.cgst, sgst_amount: gst.sgst, igst_amount: gst.igst,
          discount_total: gst.totalDiscount || 0, round_off: gst.roundOff, grand_total: gst.grandTotal,
          status: 'FINAL',
        });
        if (res?.error) return fail(res.error.message);
        addNotification('Manual bill saved', 'success');
        // Show the printable invoice (no navigation — keep it on screen).
        setPrintBill({
          invoice_number: num, invoice_date: date, client_name: party.name,
          client_gstin: party.gstin || null, place_of_supply: party.state || '',
          items: gst.items, taxable_amount: gst.taxable, tax_total: gst.totalTax,
          cgst_amount: gst.cgst, sgst_amount: gst.sgst, igst_amount: gst.igst,
          round_off: gst.roundOff, grand_total: gst.grandTotal, is_interstate: interstate,
          payment_status: 'PAID',
        });
        setSaving(false);
        return;
      }

      if (cfg.save === 'return') {
        // Sales Return + Credit Note both go through process_sales_return,
        // which restocks goods and credits the client (mints a credit note).
        res = await processSalesReturn({
          id: genId(cfg.prefix), sale_id: null, invoice_id: null,
          client_id: party.id, client_name: party.name,
          items: lineItems(), total_amount: gst.grandTotal,
          reason: cfg.label, date,
        });
        if (res?.error) return fail(res.error.message);
        addNotification(`${cfg.label} saved`, 'success');
        return navigate('/sales');
      }

      if (cfg.save === 'payment') {
        // Payment In — settle the party's oldest open sale by the amount.
        const open = sales
          .filter((s) => (s.shopId ?? s.shop_id ?? s.clientId) === party.id
            && Math.max(0, (Number(s.totalAmount) || 0) - (Number(s.paidAmount) || 0)) > 0.5)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (!open.length) return fail('No open invoice for this party to settle.');
        res = await settleSale(open[0].id, Number(payAmount));
        if (res?.error) return fail(res.error.message);
        await postIncome(Number(payAmount), 'PAYMENT', open[0].id);
        addNotification(`Payment of ${inr(payAmount)} recorded`, 'success');
        return navigate('/clients');
      }
    } catch (e) {
      return fail(e.message);
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
          <PartyPicker label={cfg.party} party={party} clients={clients} onChange={setParty} manual={cfg.manual} />

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
          <DocItemGrid lines={lines} products={products} gstOn={cfg.gst} onAdd={addLine} onPatch={patchLine} onRemove={removeLine} manual={cfg.manual} onAddBlank={addBlankLine} />
        )}

        {/* Payment In — amount card (no line items) */}
        {cfg.noItems && (
          <div className="bg-white rounded-2xl border border-black/10 shadow-sm p-4 max-w-sm">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Amount received</div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-gray-400">₹</span>
              <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00"
                className="flex-1 text-xl font-black font-mono border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-accent-signature/40" />
            </div>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
              className="mt-3 w-full text-[12px] border border-black/10 rounded-lg px-2 py-2 outline-none">
              <option>CASH</option><option>BANK</option><option>UPI</option>
            </select>
            {accounts.length > 0 && (
              <select value={depAcc} onChange={(e) => setDepositAccount(e.target.value)}
                className="mt-2 w-full text-[12px] border border-black/10 rounded-lg px-2 py-2 outline-none">
                {accounts.map((a) => <option key={a.id} value={a.id}>Deposit to: {a.name}</option>)}
              </select>
            )}
            <div className="text-[11px] text-gray-400 mt-2">Settles the party's oldest open invoice.</div>
          </div>
        )}

        {/* Footer: terms + totals */}
        {!cfg.noItems && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Terms</div>
            <div className="text-[12px] text-gray-500 leading-relaxed">
              Goods once sold are not taken back. Disputes subject to local jurisdiction.
            </div>
          </div>
          <div>
            <TotalsPanel gst={gst} gstOn={cfg.gst} interstate={interstate} showPayment={cfg.save === 'invoice'}
              markPaid={markPaid} setMarkPaid={setMarkPaid} payMethod={payMethod} setPayMethod={setPayMethod} />
            {cfg.save === 'invoice' && markPaid && accounts.length > 0 && (
              <select value={depAcc} onChange={(e) => setDepositAccount(e.target.value)}
                className="mt-2 w-full text-[12px] border border-black/10 rounded-lg px-2 py-2 outline-none bg-white">
                {accounts.map((a) => <option key={a.id} value={a.id}>Deposit to: {a.name}</option>)}
              </select>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Manual bill — printable invoice preview */}
      {printBill && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-auto p-4 sm:p-8" onClick={() => setPrintBill(null)}>
          <div className="max-w-3xl mx-auto" onClick={(e) => e.stopPropagation()}>
            <InvoiceTemplate
              invoice={printBill}
              businessProfile={businessProfile}
              client={{ name: printBill.client_name, gst_no: printBill.client_gstin, state: printBill.place_of_supply }}
              onPrint={() => window.print()}
              onClose={() => { setPrintBill(null); navigate('/estimates'); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateDocument;
