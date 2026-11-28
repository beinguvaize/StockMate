import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, AlertCircle, FileText, FileCheck, Wallet,
  RotateCcw, ReceiptText, Truck, FileSpreadsheet, FilePen, Copy,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Seg } from '../../components/documents/DocParts';
import { classifyWriteFailure } from '../../lib/writeOutcome';
import { duplicateInvoiceDraft } from '../../lib/duplicateInvoice';
import { formatShortDateTime, todayISOInAppTZ } from '../../lib/utils';
import InvoiceTemplate from '../../components/invoice/InvoiceTemplate';
import { useTenant } from '../../context/TenantContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSales } from '../../hooks/useSales';
import { useInventory } from '../../hooks/useInventory';
import { useEstimates } from '../../hooks/useEstimates';
import { usePeople } from '../../hooks/usePeople';
import { shareToWhatsApp } from '../../lib/gstEngine';
import { documentGst, documentFinalTotal, documentPaidNow, estimateGrandTotal } from '../../lib/documentTotals';
import { tierPrice } from '../../lib/priceResolver';
import { collectionGoesToClientSettlement, clientSettlementBlocker, creditInvoiceTakesMoney, CREDIT_INVOICE_PAID_MSG } from '../../lib/documentLedger';
import { PartyPicker, DocItemGrid, TotalsPanel, Field, SaveToast, inr } from '../../components/documents/DocParts';

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

// Where each save path's documents are listed: the page a successful save
// already goes to, offered when a save could not be confirmed so the user can
// look before saving again.
const LIST_FOR_SAVE = {
  invoice: ['/invoices', 'Invoices'], estimate: ['/estimates', 'Estimates'], manual: ['/estimates', 'Estimates'],
  return: ['/sales', 'Sales'], payment: ['/clients', 'Clients'],
};

// What a document does, under its total (approved newdoc-03, 04, 06). Each
// line says only what that type's save path does today.
const totalsNote = (docType, party) => {
  if (docType === 'CREDIT_NOTE' && party?.name) return `Credits ${party.name}'s account. The items go back into stock.`;
  if (docType === 'SALES_RETURN' && party?.name) return `Goes back into stock and is credited to ${party.name}'s account.`;
  if (docType === 'DELIVERY_CHALLAN') return 'A challan goes with the goods. No GST and no bill: make the invoice later.';
  if (docType === 'MANUAL_INVOICE') return 'A manual bill is not a sale: no stock, GST return or ledger entry.';
  return undefined;
};

// The shop's today, not UTC's: between midnight and 5:30 am IST the UTC date
// is still yesterday, and a new document defaulted to it.
const todayISO = () => todayISOInAppTZ();

const CreateDocument = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { currentTenantId, currentTenant, businessProfile = {} } = useTenant();
  const { addNotification } = useNotifications();
  const { clients = [], sales = [], invoices = [], placeSale, processSalesReturn, settleSale } = useSales(currentTenantId, { plan: currentTenant?.plan || 'STARTER' });
  const { products = [] } = useInventory(currentTenantId);
  const { create: createEstimate } = useEstimates(currentTenantId);
  // Collect Payment's own call (settle_client_payment), reused for a payment
  // in against a credit sale. No second copy of that write lives here.
  const { recordClientPayment } = usePeople(currentTenantId);

  const initialType = DOC_TYPES[params.get('type')] ? params.get('type') : 'SALES_INVOICE';
  const [docType, setDocType] = useState(initialType);
  const cfg = DOC_TYPES[docType];

  const [party, setParty] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState([]);
  const [payMethod, setPayMethod] = useState('CASH');
  const [markPaid, setMarkPaid] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [charges, setCharges] = useState('');       // bill-level additional charges
  const [billDiscount, setBillDiscount] = useState(''); // bill-level discount
  const [received, setReceived] = useState('');     // partial amount received
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [printBill, setPrintBill] = useState(null); // manual bill → invoice template preview
  // A failed save, said in a toast (approved newdoc-09, 10): the server's
  // reason, or "may have saved" with a way to the list.
  const [failure, setFailure] = useState(null);
  // Save pressed before the document is complete (approved newdoc-08).
  const [tried, setTried] = useState(false);

  // The database posts every rupee this page takes in (post_sale_to_ledger
  // and post_client_payment_to_ledger, see lib/documentLedger.js). Nothing in
  // this page writes the ledger or a balance.

  const businessState = businessProfile?.state || businessProfile?.business_state || '';

  /**
   * Whether the rates typed on this document already contain the tax.
   *
   * Defaults to the shop's own setting, because that is how it prices
   * everywhere else -- the POS reads the same business_profile.tax_mode. It is
   * then changeable PER DOCUMENT, which is the thing that was missing: a shop
   * that sells inclusive over the counter still issues the occasional
   * exclusive B2B bill, and had no way to say so here.
   *
   * NOT changeable on a sales invoice. That path saves through process_sale,
   * which resolves the mode from business_profile server-side and would
   * silently overrule anything chosen here -- a toggle that does nothing is
   * worse than a label that tells the truth.
   */
  const tenantTaxMode = String(businessProfile?.tax_mode || 'EXCLUSIVE').toUpperCase();
  const [taxMode, setTaxMode] = useState(tenantTaxMode);
  useEffect(() => { setTaxMode(tenantTaxMode); }, [tenantTaxMode]);
  const taxModeLocked = cfg.save === 'invoice';

  // Live GST totals — single source of truth, recomputed from the lines.
  // (lib/documentTotals: the same expressions, moved there unchanged.)
  const gst = useMemo(() => documentGst(lines, cfg.gst, businessState, party?.state, taxMode),
    [lines, cfg.gst, businessState, party, taxMode]);

  // Final payable = line totals + extra charges − bill discount.
  const finalTotal = documentFinalTotal(gst, charges, billDiscount);
  const paidNow = documentPaidNow(markPaid, finalTotal, received);

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
    if (!canSave) { setTried(true); return; }
    setFailure(null);
    setSaving(true);
    // A refusal says "Not saved" and the server's reason. A dropped connection
    // may still have committed, so it says it could not confirm instead.
    const fail = (m) => {
      const f = classifyWriteFailure(typeof m === 'string' ? new Error(m) : m, { noun: cfg.label.toLowerCase() });
      setFailure({
        title: f.title,
        detail: f.maySaved ? `It may have been saved: check the list before saving again. ${f.detail}` : f.detail,
        maySaved: f.maySaved,
        list: LIST_FOR_SAVE[cfg.save],
      });
      setSaving(false);
    };
    try {
      let res;
      if (cfg.save === 'invoice') {
        // A Credit invoice with money received: the ledger trigger posts
        // nothing for CREDIT, so the money would land nowhere. Refuse it.
        if (creditInvoiceTakesMoney({ payMethod, paidNow })) return fail(CREDIT_INVOICE_PAID_MSG);
        res = await placeSale({
          clientId: party.id, items: lineItems(), totalAmount: finalTotal,
          paymentMethod: payMethod,
          status: markPaid ? 'COMPLETED' : (paidNow > 0 ? 'PARTIAL' : 'PENDING'),
          paidAmount: paidNow, date, discount: Number(billDiscount) || 0, note: notes || null,
        });
        if (res?.error) return fail(res.error.message);
        // No ledger write here: post_sale_to_ledger posted the paid amount
        // when process_sale inserted the sale.
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
          sgst_amount: gst.sgst, igst_amount: gst.igst,
          discount_total: (gst.totalDiscount || 0) + (Number(billDiscount) || 0),
          round_off: gst.roundOff, grand_total: estimateGrandTotal(cfg.gst, gst, finalTotal, charges, billDiscount),
          notes: notes || null, status: 'DRAFT',
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
          discount_total: (gst.totalDiscount || 0) + (Number(billDiscount) || 0),
          round_off: gst.roundOff, grand_total: finalTotal, notes: notes || null,
          status: 'ACCEPTED',
        });
        if (res?.error) return fail(res.error.message);
        addNotification('Manual bill saved', 'success');
        // Show the printable invoice (no navigation — keep it on screen).
        setPrintBill({
          invoice_number: num, invoice_date: date, client_name: party.name,
          client_gstin: party.gstin || null, place_of_supply: party.state || '',
          items: gst.items, taxable_amount: gst.taxable, tax_total: gst.totalTax,
          cgst_amount: gst.cgst, sgst_amount: gst.sgst, igst_amount: gst.igst,
          round_off: gst.roundOff, grand_total: finalTotal, is_interstate: interstate,
          notes: notes || null, payment_status: 'PAID',
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
        if (collectionGoesToClientSettlement(open[0])) {
          // Oldest open bill is on Credit: settle_sale_payment's trigger would
          // post nothing, so this goes through Collect Payment's server path.
          // settle_client_payment spreads the amount over the client's open
          // bills, oldest first, and its client_payments row is posted to the
          // ledger by the database.
          const blocked = clientSettlementBlocker(party, open[0]);
          if (blocked) return fail(blocked);
          const r = await recordClientPayment(party.id, Number(payAmount), date, notes, [], payMethod);
          if (!r || r.success === false) return fail(r?.error || 'The server gave no reason.');
          addNotification(r.queued
            ? `Payment of ${inr(payAmount)} saved on this device; it will sync when online`
            : `Payment of ${inr(payAmount)} recorded`, 'success');
          return navigate('/clients');
        }
        // Non-credit sale: settle_sale_payment's trigger posts the collection.
        res = await settleSale(open[0].id, Number(payAmount));
        if (res?.error) return fail(res.error.message || res.error);
        addNotification(`Payment of ${inr(payAmount)} recorded`, 'success');
        return navigate('/clients');
      }
    } catch (e) {
      return fail(e.message);
    }
  };

  // ?client=<id>: the party filled in, when the page was opened for one client
  // (Issue credit note on an invoice). Only fills an empty party, once.
  const clientParam = params.get('client');
  useEffect(() => {
    if (!clientParam || party) return;
    const c = clients.find((x) => String(x.id) === String(clientParam));
    if (c) setParty(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientParam, clients]);

  // ?duplicate=<invoice id>: a NEW sales invoice filled from an old one
  // (lib/duplicateInvoice): client, items, prices and notes. Never payments,
  // e-Way bill, IRN, number or date. Applied once, when the invoice is loaded.
  const duplicateId = params.get('duplicate');
  const [dupSource, setDupSource] = useState(null);
  useEffect(() => {
    if (!duplicateId || dupSource) return;
    const src = invoices.find((i) => String(i.id) === String(duplicateId));
    if (!src) return;
    const draft = duplicateInvoiceDraft(src, clients);
    setDocType('SALES_INVOICE');
    if (draft.party) setParty(draft.party);
    setLines(draft.lines);
    setNotes(draft.notes);
    setMarkPaid(false);
    setReceived('');
    setDupSource(draft.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateId, invoices, clients]);

  // Where "back" goes, as its words: the page that opened this one says what
  // it is (the Invoices list passes "Invoices"); otherwise just "Back".
  const backLabel = location.state?.from || 'Back';
  const goBack = () => navigate(-1);
  const partyMeta = cfg.noItems ? 'Payment' : cfg.label;
  // What is missing, said beside Save once Save was pressed (newdoc-08).
  const missingParty = !party?.name;
  const missingBody = cfg.save === 'payment' ? !(Number(payAmount) > 0) : lines.length === 0;
  const showMissing = tried && !saving && (missingParty || missingBody);
  const missingWords = cfg.save === 'payment'
    ? (missingParty && missingBody ? 'Add a party and the amount received to save' : missingParty ? 'Add a party to save' : 'Enter the amount received to save')
    : (missingParty && missingBody ? 'Add a party and at least one item to save' : missingParty ? 'Add a party to save' : 'Add at least one item to save');
  useEffect(() => { if (tried && !missingParty && !missingBody) setTried(false); }, [tried, missingParty, missingBody]);

  return (
    <div className="flex flex-col pb-16">
      {/* Header: back, title, cancel and save (approved newdoc-01) */}
      <div className="m-rise mb-[18px] flex flex-wrap items-center gap-3.5">
        <button type="button" onClick={goBack}
          className="m-press inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink">
          <ChevronLeft size={15} /> {backLabel}
        </button>
        <h3 className="font-tight text-[20px] font-semibold tracking-[-0.02em] text-ink">Create {cfg.label.toLowerCase()}</h3>
        <span className="flex-1" />
        {showMissing && (
          <span role="status" className="inline-flex items-center gap-2 text-[12.5px] text-bad-text">
            <AlertCircle size={15} /> {missingWords}
          </span>
        )}
        <Button variant="secondary" onClick={goBack}>Cancel</Button>
        {/* Looks disabled until the document is complete, but still answers a
            press: it then says what is missing instead of doing nothing. */}
        <Button aria-disabled={!canSave} disabled={saving} onClick={handleSave}
          className={!canSave && !saving ? 'opacity-40' : undefined}>
          {saving ? 'Saving…' : `Save ${cfg.label.toLowerCase()}`}
        </Button>
      </div>

      {dupSource && (
        <div className="m-rise mb-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-tile px-3.5 py-2.5 text-[13px] text-body">
          <Copy size={16} className="shrink-0 text-ink-2" />
          <span className="min-w-0 flex-1">
            Copied from <b className="font-semibold text-ink">{dupSource.number || 'an invoice'}</b>
            {dupSource.date ? ` · ${formatShortDateTime(dupSource.date)}` : ''}{dupSource.clientName ? ` · ${dupSource.clientName}` : ''}.
            {' '}Items, prices and client are filled in. Date is today; the new number is given on save. Payments are not copied.
          </span>
          {dupSource.id && (
            <button type="button" onClick={() => navigate(`/invoices/${encodeURIComponent(dupSource.id)}`)}
              className="font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4">
              Open {dupSource.number || 'invoice'}
            </button>
          )}
        </div>
      )}

      {/* Doc-type switch */}
      <div role="group" aria-label="Document type" className="m-rise mb-4 flex flex-wrap gap-1.5" style={{ '--i': 1 }}>
        {Object.entries(DOC_TYPES).map(([k, d]) => (
          <button key={k} type="button" aria-pressed={docType === k} onClick={() => { setDocType(k); setTried(false); }}
            className={`m-press whitespace-nowrap rounded-pill px-3.5 py-[7px] font-tight text-[13px] font-semibold ${
              docType === k ? 'bg-ink text-white' : 'text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile'
            }`}>{d.label}</button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {/* Party + meta */}
        <div className="m-rise grid gap-4 md:grid-cols-2" style={{ '--i': 2 }}>
          <PartyPicker label={cfg.party} party={party} clients={clients} onChange={setParty} manual={cfg.manual} invalid={showMissing && missingParty} />

          <div className="grid grid-cols-2 content-start gap-x-4 gap-y-3 rounded-[14px] border border-line bg-surface px-5 py-[18px]">
            <Field label={`${partyMeta} no.`} value="Given on save" muted />
            <label className="block">
              <span className="block font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Date</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-[3px] h-8" aria-label="Date" />
            </label>
            <Field label="Place of supply" value={party?.state || businessState || '—'} />
            <Field label="Type" value={cfg.gst ? 'GST document' : 'Non-GST'} />
          </div>
        </div>

        {/* Item grid */}
        {!cfg.noItems && (
          <div className="m-rise" style={{ '--i': 3 }}>
            <DocItemGrid lines={lines} products={products} gstOn={cfg.gst} onAdd={addLine} onPatch={patchLine} onRemove={removeLine} manual={cfg.manual} onAddBlank={addBlankLine} />
          </div>
        )}

        {/* Payment In — amount card (no line items) */}
        {cfg.noItems && (
          <div className="m-rise max-w-[440px] rounded-[14px] border border-line bg-surface px-5 py-[18px]" style={{ '--i': 3 }}>
            <label htmlFor="pay-in-amt" className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Amount received</label>
            <div className="flex h-[52px] items-center gap-2 rounded-xl px-4 shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]">
              <span className="font-tight text-[20px] font-semibold text-mute">₹</span>
              <input id="pay-in-amt" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00"
                className="w-full bg-transparent font-tight text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-ink outline-none placeholder:text-faint" />
            </div>
            <span className="mt-3.5 mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Paid by</span>
            <Seg value={payMethod} onChange={setPayMethod} ariaLabel="Paid by"
              options={[['CASH', 'Cash'], ['BANK', 'Bank'], ['UPI', 'UPI']]} />
            <p className="mt-3 text-[12px] text-mute">Settles the party's oldest open invoice. On a credit bill it spreads over their open bills, oldest first.</p>
          </div>
        )}

        {/* Footer: notes + terms, totals */}
        {!cfg.noItems && (
        <div className="m-rise grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_360px]" style={{ '--i': 4 }}>
          <div className="rounded-[14px] border border-line bg-surface px-5 py-[18px]">
            <label htmlFor="doc-notes" className="mb-1.5 block font-tight text-[12.5px] font-semibold text-ink-2">Notes</label>
            <textarea id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes for the customer"
              className="min-h-[64px] w-full resize-none rounded-[10px] px-3 py-[9px] text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            <span className="mt-3.5 block font-tight text-[12.5px] font-semibold text-ink-2">Terms</span>
            <p className="mt-1 text-[12.5px] leading-relaxed text-body">
              Goods once sold are not taken back. Disputes subject to local jurisdiction.
            </p>
          </div>
          <TotalsPanel gst={gst} gstOn={cfg.gst} interstate={interstate} showPayment={cfg.save === 'invoice'}
            markPaid={markPaid} setMarkPaid={setMarkPaid} payMethod={payMethod} setPayMethod={setPayMethod}
            charges={charges} setCharges={setCharges} billDiscount={billDiscount} setBillDiscount={setBillDiscount}
            received={received} setReceived={setReceived}
            taxMode={taxMode} setTaxMode={setTaxMode} taxModeLocked={taxModeLocked}
            taxModeHint={taxModeLocked
              ? 'Set by your GST settings; a sales invoice is taxed when it is saved.'
              : undefined}
            note={totalsNote(docType, party)} />
        </div>
        )}
      </div>

      {/* Manual bill: the saved bill on the shop's invoice layout (approved
          newdoc-07). The template is its own full-screen viewer. */}
      {printBill && (
        <InvoiceTemplate
          invoice={printBill}
          businessProfile={businessProfile}
          client={{ name: printBill.client_name, gst_no: printBill.client_gstin, state: printBill.place_of_supply }}
          title={`Manual bill ${printBill.invoice_number}`}
          subtitle="Saved. Shown on your invoice layout."
          printLabel="Print"
          onPrint={() => window.print()}
          onShare={() => shareToWhatsApp(printBill, { name: printBill.client_name, gst_no: printBill.client_gstin, state: printBill.place_of_supply }, businessProfile)}
          onClose={() => { setPrintBill(null); navigate('/estimates'); }}
        />
      )}

      {failure && (
        <SaveToast title={failure.title} detail={failure.detail} onClose={() => setFailure(null)}
          action={failure.maySaved && failure.list ? { label: `Open ${failure.list[1]}`, onClick: () => navigate(failure.list[0]) } : null} />
      )}
    </div>
  );
};

export default CreateDocument;
