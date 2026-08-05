import React, { useMemo, useState } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { usePurchases } from '../hooks/usePurchases';
import { useInventory } from '../hooks/useInventory';
import { useAccounts, accountForMethod } from '../hooks/useAccounts';
import { PageSkeleton } from '../components/ui/States';
import {
  ArrowLeft, Phone, Mail, MapPin, Box, Search,
  ArrowUpRight, CreditCard, ChevronRight, Info, ShieldCheck, User2
} from 'lucide-react';
import { formatDate } from '../lib/utils';
import { groupPurchasesIntoBills, buildSupplierLedger } from '../lib/bills';

const SupplierLedger = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { suppliers, loading: peoLoading } = usePeople(currentTenantId);
  const { purchases, purchaseReturns, supplierPayments, paySupplier, payPurchase, offsetCreditNote, loading: purLoading } = usePurchases(currentTenantId);
  const [offsetting, setOffsetting] = useState(null);   // return id in flight
  const [offsetMsg, setOffsetMsg]   = useState(null);
  const { products, loading: invLoading } = useInventory(currentTenantId);
  const { accounts: ledgerAccounts = [], addTxn: addAccountTxn } = useAccounts(currentTenantId);
  // Post a supplier payment OUT to the method's Cash/Bank account (non-blocking).
  const postSupplierOut = async (amount, method, date, ref) => {
    const acc = accountForMethod(ledgerAccounts, method);
    if (!acc) return;
    try { await addAccountTxn({ account_id: acc, direction: 'OUT', amount, mode: method, ref_type: 'PURCHASE', ref_id: ref || null, note: `Supplier payment · ${supplier?.name || ''}`, date }); } catch { /* non-blocking */ }
  };

  const loading = peoLoading || purLoading || invLoading;
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // ALL | BILL | PAY | RETURN
  const [expandedRow, setExpandedRow] = useState(null);
  // A busy supplier runs ~6 bills a month, so three years is ~400 ledger rows.
  // Default to a window rather than the whole history; the brought-forward row
  // below keeps the running balance honest when history is hidden.
  // Opens on this month. Older entries are not lost — the brought-forward
  // row carries their balance in, so the running figures stay true.
  const [range, setRange] = useState('1M');       // 1M | 3M | FY | ALL
  const [newestFirst, setNewestFirst] = useState(false);

  // Pay-supplier modal state
  const [payOpen, setPayOpen]       = useState(false);
  useDialogClose(() => { setPayOpen(false); setPayTarget(null); }, { enabled: payOpen });
  const [payAmount, setPayAmount]   = useState('');
  const [payMethod, setPayMethod]   = useState('CASH');
  const [payDate, setPayDate]       = useState(() => new Date().toISOString().slice(0,10));
  const [payRef, setPayRef]         = useState('');
  const [payNote, setPayNote]       = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError]     = useState(null);

  // payTarget: a specific purchase to pay, or null = pay supplier (auto-allocate).
  const [payTarget, setPayTarget] = useState(null);
  const openPay = (purchase = null, prefill = '') => {
    setPayTarget(purchase);
    setPayAmount(prefill ? String(Math.round(prefill)) : ''); setPayMethod('CASH'); setPayRef(''); setPayNote('');
    setPayError(null); setPayOpen(true);
  };

  const submitPay = async () => {
    const amt = Number(payAmount);
    if (!(amt > 0)) { setPayError('Enter a valid amount'); return; }
    setPaySubmitting(true); setPayError(null);
    const common = { method: payMethod, date: payDate, referenceNo: payRef, note: payNote };

    // The URL param can be a name/slug for legacy links; the resolved supplier
    // row is the reliable id source.
    const sid = supplier?.id || payTarget?.supplier_id || id;

    if (payTarget) {
      // Pay this one order.
      const pid = payTarget.id;
      if (!sid || !pid) { setPaySubmitting(false); setPayError('Could not resolve supplier / order. Reopen and retry.'); return; }
      const { error } = await payPurchase({ supplierId: sid, purchaseId: pid, amount: amt, ...common });
      setPaySubmitting(false);
      if (error) { setPayError(error.message || 'Payment failed'); return; }
      await postSupplierOut(amt, payMethod, payDate, pid);
      setPayOpen(false);
      return;
    }

    // General payment: settle_supplier_payment auto-allocates FIFO across the
    // oldest unpaid credit orders (one row per order) and books any leftover as
    // an on-account advance. Single source of allocation logic — no JS loop.
    if (!sid) { setPaySubmitting(false); setPayError('Could not resolve supplier. Reopen and retry.'); return; }
    const { error } = await paySupplier({ supplierId: sid, amount: amt, ...common });
    setPaySubmitting(false);
    if (error) { setPayError(error.message || 'Payment failed'); return; }
    await postSupplierOut(amt, payMethod, payDate, null);
    setPayOpen(false);
  };

  const isCredit = (pt) => ['CREDIT','UDHAAR','POST-CAPITAL'].includes(String(pt || '').toUpperCase());
  const isCash = (pt) => ['CASH','PAID'].includes(String(pt || '').toUpperCase());
  const cur = businessProfile?.currencySymbol || '₹';

  // 1. Resolve Supplier
  const supplier = useMemo(() => 
    (suppliers || []).find(s => s.id === id), 
    [suppliers, id]
  );

  // 2. Aggregate Data
  const supplierPurchases = useMemo(() => {
    if (!supplier) return [];
    return (purchases || [])
      .filter(p => p.supplier_id === supplier.id || p.supplier_name === supplier.name)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [supplier, purchases]);

  const supplierReturns = useMemo(() => {
    if (!supplier) return [];
    return (purchaseReturns || [])
      .filter(r => r.supplier_id === supplier.id || r.supplier_name === supplier.name)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [supplier, purchaseReturns]);

  const payments = useMemo(() => {
    if (!supplier) return [];
    return (supplierPayments || [])
      // Spent advances are soft-deleted and replaced by allocation rows. The
      // fetch filters them, but it renders from the offline cache first, which
      // can still hold a row from before it was spent — and counting both would
      // credit the same money twice.
      .filter(p => !p.deleted_at)
      .filter(p => p.supplier_id === supplier.id || p.supplier_name === supplier.name)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [supplier, supplierPayments]);
  // Payments not tied to a specific order — shown as ledger rows. Order-linked
  // payments are reflected in each purchase's Paid/Due instead (no double-show).
  const onAccountPayments = useMemo(() => payments.filter(p => !p.purchase_id), [payments]);
  // The sidebar's Payment history panel used to live here — settlements plus
  // cash purchases, listed newest first. The ledger now carries every one of
  // those as a dated credit row with a running balance beside it, so the panel
  // was the same money a second time, a few inches to the left.
  //
  // ── Bills ────────────────────────────────────────────────────────────────
  // One physical bill is stored as one `purchases` row PER PRODUCT — the
  // multi-product form writes them in a burst. RENO JOHN's 17 Jul bill is two
  // rows created 1.7s apart. Showing them as separate lines inflated this
  // tenant's ledger from 52 real bills to 135 rows.
  //
  // Key: supplier + date + payment_type, and rows only chain while consecutive
  // created_at gaps stay inside BURST_MS. Both parts are load-bearing:
  //   · payment_type — SAJJAD 24 Jul has two rows 59s apart, one CREDIT and one
  //     CASH. Different bills; merging them would re-blur the pair behind the
  //     duplicate ₹6,900 payment.
  //   · the burst guard — MADEENA 9 May has 4 rows spanning 2.9 hours. Separate
  //     trips, and a supplier+date key alone would fuse them into one bill.
  //
  // Presentation only. No row is merged in the database and no id changes.
  // Bills come from src/lib/bills.js — the same rule the purchases list uses.
  // It lived in both files until the second copy was written, which is one
  // edit away from the two screens disagreeing about what a supplier billed.
  const bills = useMemo(
    () => groupPurchasesIntoBills(supplierPurchases),
    [supplierPurchases]);

  // ── The ledger ───────────────────────────────────────────────────────────
  // One chronological debit/credit list with a running balance, mirroring
  // ClientStatementReport.jsx. Previously this rendered as three stacked
  // blocks — every bill, then every return, then every payment — so a June
  // debit note sat below a July bill and nothing accumulated.
  // Built by src/lib/bills.js so the rule that decides what appears on a
  // statement — and the one that stops the same money being credited twice —
  // is covered by tests rather than living only here.
  const ledgerRows = useMemo(
    () => buildSupplierLedger({
      bills,
      payments,
      returns: supplierReturns,
      onAccountPayments,
    }),
    [bills, payments, supplierReturns, onAccountPayments]);

  // ── Period ───────────────────────────────────────────────────────────────
  // Start of the visible window, or null for the whole history.
  const rangeStart = useMemo(() => {
    if (range === 'ALL') return null;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (range === '1M') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    if (range === '3M') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return fmt(d); }
    // Indian financial year — 1 April to 31 March. Matters here because this is
    // the window a GST filing or an audit is reconciled against.
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${fy}-04-01`;
  }, [range]);

  // Balance carried into the window. A running balance depends on everything
  // before it, so a period view that started from zero would put a wrong
  // number on every visible line — the reason a statement of account always
  // opens with a brought-forward figure.
  const opening = useMemo(() => {
    if (!rangeStart) return 0;
    let bal = 0;
    ledgerRows.forEach(r => { if (String(r.date) < rangeStart) bal = r.balance; });
    return bal;
  }, [ledgerRows, rangeStart]);

  const inRange = useMemo(
    () => (rangeStart ? ledgerRows.filter(r => String(r.date) >= rangeStart) : ledgerRows),
    [ledgerRows, rangeStart]
  );
  const hiddenBefore = ledgerRows.length - inRange.length;

  // The filter now covers every row type. It used to be ALL/CASH/CREDIT and
  // applied to bills only, so picking CASH still showed every return and
  // payment — and the count beside it only ever counted purchases.
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return inRange.filter(r => {
      if (paymentFilter !== 'ALL' && r.kind !== paymentFilter) return false;
      if (!q) return true;
      const hay = [
        r.bill?.id, r.ret?.id, r.pay?.id, r.pay?.reference_no, r.pay?.note,
        ...(r.bill?.lines || []).map(x => x.id),
        ...(r.bill?.lines || []).map(x => x.notes),
        ...(r.bill?.lines || []).map(x => (products || []).find(pr => pr.id === x.linked_product_id)?.name),
      ];
      return hay.some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [inRange, searchTerm, paymentFilter, products]);

  const displayRows = useMemo(
    () => (newestFirst ? [...filteredRows].reverse() : filteredRows),
    [filteredRows, newestFirst]
  );

  // Closing is always the balance across ALL history, never just the window —
  // what the supplier is owed today does not change because you looked at a
  // narrower period.
  // A credit note is money the supplier owes back, not a smaller payable. How
  // much of each has been offset is derived from the CREDIT_NOTE payment rows
  // themselves rather than a flag, so the two can never drift apart.
  const creditNotes = useMemo(() => supplierReturns.map(r => {
    const used = payments
      .filter(p => p.note === `Credit note ${r.id}` && !p.deleted_at)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const total = Number(r.total_amount || 0);
    return { ...r, used, open: Math.max(0, total - used), total };
  }), [supplierReturns, payments]);

  const openCredit = creditNotes.reduce((s, c) => s + c.open, 0);

  const runOffset = async (returnId) => {
    setOffsetting(returnId); setOffsetMsg(null);
    const { success, applied, error } = await offsetCreditNote(returnId);
    setOffsetting(null);
    setOffsetMsg(success
      ? { ok: true,  text: `${cur}${Math.round(applied).toLocaleString('en-IN')} offset against open bills.` }
      : { ok: false, text: error?.message || 'Could not offset this credit note.' });
  };

  const closing = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : 0;
  // Debit/credit columns total the visible period — a statement's totals should
  // add up to the lines printed beneath them. The balance beside them stays
  // all-time, which is why the carried-forward row has to be on screen.
  const ledgerTotals = useMemo(() => ({
    debit:  inRange.reduce((s, r) => s + r.debit, 0),
    credit: inRange.reduce((s, r) => s + r.credit, 0),
  }), [inRange]);

  const metrics = useMemo(() => {
    const amt = (p) => Number(p.total_amount ?? p.total_cost ?? 0);
    const total = supplierPurchases.reduce((s, p) => s + amt(p), 0);
    const cashPaid = supplierPurchases.filter(p => isCash(p.payment_type)).reduce((s, p) => s + amt(p), 0);
    const creditTotal = supplierPurchases.filter(p => isCredit(p.payment_type)).reduce((s, p) => s + amt(p), 0);
    // Count bills, not purchases rows. A five-product bill is one purchase to
    // the shopkeeper, and the ledger beside this now says so — leaving these
    // on row counts made the card read "5 purchases" against 4 ledger lines,
    // and pulled the average down to a per-product figure nobody buys at.
    const count = bills.length;
    const avg = count > 0 ? total / count : 0;
    const lineCount = supplierPurchases.length;
    const last = supplierPurchases[0]?.date;
    const totalReturns = supplierReturns.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const net = total - totalReturns;
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    // Outstanding derived from the orders themselves (Σ credit total − paid), so
    // it always matches the per-row dues. The stored suppliers.balance can drift
    // when a purchase is edited (payment_type/amount) without re-syncing it.
    const payable = supplierPurchases
      .filter(p => isCredit(p.payment_type))
      .reduce((s, p) => s + Math.max(0, amt(p) - Number(p.paid_amount || 0)), 0);

    return { total, count, avg, last, payable, cashPaid, creditTotal, totalReturns, net, totalPaid, lineCount };
  }, [supplierPurchases, supplierReturns, payments, bills]);

  if (loading) return <PageSkeleton cards={3} rows={8} />;

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in text-center p-12">
        <div className="glass-panel !py-12 px-8 max-w-sm rounded-[3rem] border-dashed border-2">
            <Info size={64} className="mx-auto mb-6 text-muted-foreground opacity-50" />
            <h2 className="text-3xl font-bold text-ink-primary mb-2">Supplier Not Found</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              This supplier record was deleted or is no longer available.
            </p>
            <button onClick={() => navigate(-1)} className="btn-signature !px-10 !h-14 !rounded-pill">Back to Suppliers</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-12">
      {/* Header & Navigation */}
      <div className="flex justify-between items-center gap-4 mb-6 mt-1 pb-4 border-b border-black/5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="no-print w-10 h-10 shrink-0 rounded-xl border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary group bg-white"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
              Suppliers
              <ChevronRight size={10} className="opacity-40" />
              <span className="text-accent-signature">Ledger</span>
            </div>
            <h1 className="text-xl font-extrabold text-ink-primary leading-none truncate">{supplier.name}<span className="text-accent-signature">.</span></h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden lg:block text-[10px] font-semibold text-muted-foreground">
            As of {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button
            onClick={() => window.print()}
            className="no-print h-10 px-4 rounded-xl bg-ink-primary text-white text-[11px] font-bold hover:bg-ink-primary/90 transition-all flex items-center gap-2"
          >
            Export PDF <ArrowUpRight size={14} className="text-accent-signature/70" />
          </button>
        </div>
      </div>

      <div className="supplier-ledger-print grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Supplier Statistics & Profile */}
        <div className="lg:col-span-4 space-y-5">
          {/* Profile Card */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-4 mb-5 pb-5 border-b border-black/5">
              <div className="w-14 h-14 rounded-2xl bg-accent-signature/10 border border-accent-signature/25 flex items-center justify-center text-accent-signature tabular-nums font-bold text-lg shrink-0">
                {(supplier.name || '–').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w => w[0]).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-ink-primary leading-tight truncate">{supplier.name}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <ShieldCheck size={12} className="text-accent-signature" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active supplier</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[13px]">
                <Phone size={14} className="text-muted-foreground shrink-0" />
                <span className="font-semibold text-ink-primary">{supplier.phone || <span className="text-muted-foreground font-normal">No phone</span>}</span>
              </div>
              <div className="flex items-center gap-3 text-[13px] min-w-0">
                <Mail size={14} className="text-muted-foreground shrink-0" />
                <span className="font-semibold text-ink-primary truncate lowercase">{supplier.email || <span className="text-muted-foreground font-normal normal-case">No email</span>}</span>
              </div>
              <div className="flex items-start gap-3 text-[13px]">
                <MapPin size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <span className="font-semibold text-ink-primary leading-snug">{supplier.address || <span className="text-muted-foreground font-normal">No address on file</span>}</span>
              </div>
              <div className="flex items-center gap-3 text-[13px] pt-3 border-t border-black/5">
                <User2 size={14} className="text-muted-foreground shrink-0" />
                <span className="font-semibold text-ink-primary">{supplier.contact_person || <span className="text-muted-foreground font-normal">No contact person</span>}</span>
              </div>
            </div>
          </div>

          {/* Amount Due — primary signal */}
          <div className={`rounded-2xl border p-5 ${metrics.payable > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50/60 border-emerald-100'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${metrics.payable > 0 ? 'text-red-400' : 'text-emerald-500'}`}>Amount due</span>
                <div className={` tabular-nums text-2xl font-bold mt-0.5 ${metrics.payable > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  <span className="text-base opacity-60 mr-0.5">{businessProfile?.currencySymbol || '₹'}</span>{metrics.payable.toLocaleString()}
                </div>
              </div>
              <span className={`text-[11px] font-bold rounded-full px-3 py-1 bg-white border ${metrics.payable > 0 ? 'text-red-500 border-red-200' : 'text-emerald-600 border-emerald-200'}`}>
                {metrics.payable > 0 ? 'Outstanding' : 'Settled'}
              </span>
            </div>
            {metrics.payable > 0 && hasPermission('purchases', 'edit') !== false && (
              <button
                onClick={() => openPay()}
                className="no-print w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ink-primary text-white text-[12px] font-bold hover:bg-ink-primary/90 transition-all"
              >
                <CreditCard size={14} className="text-accent-signature/70" /> Record payment
              </button>
            )}
          </div>

          {/* Credit notes — money the supplier owes back.
              Not netted off Amount Due on purpose. MADEENA's Rs 2,100 note is
              against a cash bill already paid in full, so whether it offsets
              their next bill or comes back as cash is their call, not the
              app's. Visible, and applied only when told to. */}
          {openCredit > 0.01 && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Credit notes</span>
                  <div className="tabular-nums text-xl font-bold mt-0.5 text-blue-700">
                    <span className="text-sm opacity-60 mr-0.5">{cur}</span>{openCredit.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">owed to you, not yet applied</div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {creditNotes.filter(c => c.open > 0.01).map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 bg-white/70 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-ink-primary truncate">
                        {c.product_name || 'Return'} · {formatDate(c.date)}
                      </div>
                      <div className="text-[9px] text-muted-foreground tabular-nums">
                        #{(c.id || '').slice(-8).toUpperCase()}
                        {c.used > 0.01 && <> · {cur}{Math.round(c.used).toLocaleString('en-IN')} already applied</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-[12px] font-bold text-blue-700">
                        {cur}{Math.round(c.open).toLocaleString('en-IN')}
                      </span>
                      {metrics.payable > 0.01 && hasPermission('purchases', 'edit') !== false && (
                        <button
                          onClick={() => runOffset(c.id)}
                          disabled={offsetting === c.id}
                          title="Apply this credit against the supplier's open bills"
                          className="no-print text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-ink-primary text-white hover:bg-black disabled:opacity-50 transition-all"
                        >
                          {offsetting === c.id ? '…' : 'Offset'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {metrics.payable <= 0.01 && (
                <div className="text-[10px] text-muted-foreground mt-2">
                  Nothing outstanding to offset against — collect this as cash or hold it for the next bill.
                </div>
              )}
              {offsetMsg && (
                <div className={`text-[10px] font-semibold mt-2 ${offsetMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {offsetMsg.text}
                </div>
              )}
            </div>
          )}

          {/* Total purchased — dark hero */}
          <div className="rounded-2xl bg-ink-primary p-5 relative overflow-hidden">
            <div className="absolute top-4 right-4 opacity-15 text-accent-signature/70"><Box size={36} strokeWidth={1.5} /></div>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Total purchased</span>
            <div className="tabular-nums text-3xl font-bold text-white leading-none mt-1.5">
              <span className="text-lg text-accent-signature/70 mr-1">{businessProfile?.currencySymbol || '₹'}</span>{metrics.total.toLocaleString()}
            </div>
            <span className="inline-block mt-3 text-[10px] font-bold text-accent-signature/70 uppercase tracking-wider">
              {metrics.count} {metrics.count === 1 ? 'bill' : 'bills'}
              {metrics.lineCount > metrics.count && <> · {metrics.lineCount} products</>}
            </span>
          </div>

          {/* Stat breakdown */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm divide-y divide-black/5">
            {[
              ['Average purchase', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.avg).toLocaleString()}`, 'text-ink-primary'],
              ['Last purchase', metrics.last ? formatDate(metrics.last) : 'N/A', 'text-ink-primary'],
              ['Cash paid', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.cashPaid).toLocaleString()}`, 'text-emerald-600'],
              ['Credit purchases', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.creditTotal).toLocaleString()}`, 'text-accent-signature'],
              ['Payments made', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.totalPaid).toLocaleString()}`, 'text-emerald-600'],
              ...(metrics.totalReturns > 0 ? [
                ['Returns (debit notes)', `−${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.totalReturns).toLocaleString()}`, 'text-rose-500'],
                ['Net purchased', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.net).toLocaleString()}`, 'text-ink-primary'],
              ] : []),
            ].map(([label, val, cls]) => (
              <div key={label} className="flex justify-between items-center px-4 py-3">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
                <span className={` tabular-nums text-[13px] font-bold ${cls}`}>{val}</span>
              </div>
            ))}
          </div>

        </div>

        {/* Right Column: Detailed Purchase History */}
        <div className="lg:col-span-8 flex flex-col min-h-[600px]">
          <div className="ledger-panel bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
            {/* Table Header Utility Bar */}
            <div className="no-print p-4 border-b border-black/5 flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="relative group flex-1 w-full md:max-w-xs">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-accent-signature transition-colors" />
                <input
                  type="text"
                  placeholder="Search reference or notes…"
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white border border-border text-[12px] font-semibold text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 transition-all placeholder:text-muted-foreground placeholder:font-normal"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 p-1 bg-black/[0.04] rounded-xl">
                  {[['1M','Month'],['3M','3 months'],['FY','This FY'],['ALL','All']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => { setRange(val); setExpandedRow(null); }}
                      className={`px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        range === val
                          ? 'bg-ink-primary text-white shadow-sm'
                          : 'text-muted-foreground hover:text-ink-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 p-1 bg-black/[0.04] rounded-xl">
                  {[['ALL','All'],['BILL','Bills'],['PAY','Payments'],['RETURN','Returns']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => { setPaymentFilter(val); setExpandedRow(null); }}
                      className={`px-2.5 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        paymentFilter === val
                          ? 'bg-accent-signature text-white shadow-sm'
                          : 'text-muted-foreground hover:text-ink-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* A shopkeeper wants today at the top; an accountant reading a
                    statement wants it to run forwards. Neither is wrong. */}
                <button
                  onClick={() => setNewestFirst(v => !v)}
                  title={newestFirst ? 'Showing newest first' : 'Showing oldest first'}
                  className="h-7 px-2.5 rounded-lg border border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-ink-primary transition-all"
                >
                  {newestFirst ? 'Newest ↑' : 'Oldest ↓'}
                </button>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'}
                </span>
              </div>
            </div>

            {/* Transaction Ledger (expandable rows) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas/70 sticky top-0 z-10 border-b border-black/5">
                  <tr>
                    <th className="py-3.5 px-5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="py-3.5 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="py-3.5 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Reference</th>
                    <th className="py-3.5 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Debit</th>
                    <th className="py-3.5 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Credit</th>
                    <th className="py-3.5 px-5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {/* Balance carried into the window. Without it every figure in
                      the Balance column would be understated by whatever the
                      hidden history left behind. */}
                  {hiddenBefore > 0 && !newestFirst && (
                    <tr className="bg-canvas/60">
                      <td className="py-3 px-5 text-[11px] font-bold text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(rangeStart)}</td>
                      <td colSpan="4" className="py-3 px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Balance brought forward
                        <span className="ml-2 normal-case font-semibold text-muted-foreground/70">{hiddenBefore} earlier {hiddenBefore === 1 ? 'entry' : 'entries'} not shown</span>
                      </td>
                      <td className="py-3 px-5 text-right text-xs font-bold tabular-nums text-ink-primary">
                        {cur}{opening.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-24 text-center">
                        <div className="opacity-10 mb-4 flex justify-center"><Box size={72} strokeWidth={1} /></div>
                        <h4 className="text-xl font-bold text-ink-primary mb-1">No transactions</h4>
                        <p className="text-xs text-muted-foreground">
                          {ledgerRows.length === 0
                            ? 'This supplier has no recorded purchases yet.'
                            : hiddenBefore === ledgerRows.length
                              ? 'Nothing in this period — try a wider range.'
                              : 'Nothing matches this filter.'}
                        </p>
                      </td>
                    </tr>
                  ) : displayRows.map((r, i) => {
                    const key = `${r.kind}-${r.bill?.id || r.ret?.id || r.pay?.id}-${i}`;
                    const money = (n) => `${cur}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                    // ── Bill ──────────────────────────────────────────────
                    if (r.kind === 'BILL') {
                      const b = r.bill;
                      const multi = b.lines.length > 1;
                      const expanded = expandedRow === b.id;
                      const names = b.lines
                        .map(x => (products || []).find(pr => pr.id === x.linked_product_id)?.name)
                        .filter(Boolean);
                      return (
                        <React.Fragment key={key}>
                          <tr
                            className={`transition-colors ${multi ? 'cursor-pointer' : ''} ${expanded ? 'bg-canvas' : 'hover:bg-canvas/60'}`}
                            onClick={() => multi && setExpandedRow(expanded ? null : b.id)}
                          >
                            <td className="py-3.5 px-5 text-xs font-semibold text-ink-primary tabular-nums whitespace-nowrap">{formatDate(b.date)}</td>
                            <td className="py-3.5 px-3">
                              <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent-signature/10 text-accent-signature-hover">Bill</span>
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {multi && (
                                  <ChevronRight size={12} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90 text-accent-signature' : ''}`} />
                                )}
                                <span className="text-xs tabular-nums font-semibold text-ink-primary">#{(b.id || '').slice(-8).toUpperCase()}</span>
                                {multi && (
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/[0.05] text-ink-secondary">{b.lines.length} items</span>
                                )}
                                {b.due > 0.01 && (
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-100 tabular-nums">
                                    due {cur}{Math.round(b.due).toLocaleString('en-IN')}
                                  </span>
                                )}
                                {/* Single-product bill: pay it right here. Multi
                                    product bills pay per line inside the detail,
                                    since the money lands on different rows. */}
                                {!multi && b.due > 0.01 && hasPermission('purchases', 'edit') !== false && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openPay(b.lines[0], b.due); }}
                                    className="no-print text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-ink-primary text-white hover:bg-black transition-all"
                                  >Pay</button>
                                )}
                              </div>
                              {names.length > 0 && (
                                <div className={`text-[10px] text-muted-foreground truncate max-w-[260px] ${multi ? 'ml-[18px]' : ''}`}>
                                  {names.slice(0, 3).join(', ')}{names.length > 3 ? ` +${names.length - 3}` : ''}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-right text-xs font-bold tabular-nums text-ink-primary">{money(r.debit)}</td>
                            <td className="py-3.5 px-3 text-right text-xs tabular-nums text-muted-foreground">—</td>
                            <td className={`py-3.5 px-5 text-right text-xs font-bold tabular-nums ${r.balance > 0.01 ? 'text-ink-primary' : 'text-muted-foreground'}`}>{money(r.balance)}</td>
                          </tr>

                          {expanded && (
                            <tr className="bg-canvas/40">
                              <td colSpan="6" className="bill-detail px-5 py-4 border-l-[3px] border-accent-signature">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                                  Products on this bill{b.due > 0.01 ? ' — pay the lines still open' : ''}
                                </div>
                                <table className="w-full">
                                  <tbody className="divide-y divide-black/5">
                                    {b.lines.map(x => {
                                      const prod = (products || []).find(pr => pr.id === x.linked_product_id);
                                      const lineAmt = Number(x.total_amount ?? x.total_cost ?? 0);
                                      const lineQty = Number(x.quantity ?? 0);
                                      const lineDue = Math.max(0, lineAmt - Number(x.paid_amount || 0));
                                      return (
                                        <tr key={x.id}>
                                          <td className="py-2 text-xs font-semibold text-ink-primary">{prod?.name || x.notes || '—'}</td>
                                          <td className="py-2 text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                            {lineQty} × {cur}{(lineQty > 0 ? lineAmt / lineQty : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                          </td>
                                          <td className="py-2 text-right text-xs font-semibold tabular-nums text-ink-primary whitespace-nowrap">{money(lineAmt)}</td>
                                          <td className="py-2 pl-4 text-right whitespace-nowrap">
                                            {lineDue > 0.01 ? (
                                              <span className="inline-flex items-center gap-2">
                                                <span className="text-[10px] font-bold tabular-nums text-red-600">due {cur}{Math.round(lineDue).toLocaleString('en-IN')}</span>
                                                {hasPermission('purchases', 'edit') !== false && (
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); openPay(x, lineDue); }}
                                                    className="no-print text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-ink-primary text-white hover:bg-black transition-all"
                                                  >Pay</button>
                                                )}
                                              </span>
                                            ) : (
                                              <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wider">Settled</span>
                                            )}
                                          </td>
                                          <td className="py-2 pl-4 text-right text-[9px] tabular-nums text-muted-foreground whitespace-nowrap">#{(x.id || '').slice(-8).toUpperCase()}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                {b.lines.some(x => x.notes) && (
                                  <div className="mt-3 text-[11px] text-muted-foreground">
                                    {b.lines.filter(x => x.notes).map(x => x.notes).join(' · ')}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}

                        </React.Fragment>
                      );
                    }

                    // ── Payment ───────────────────────────────────────────
                    if (r.kind === 'PAY') {
                      const ref = r.onAccount
                        ? 'On account'
                        : `#${(r.bill?.id || '').slice(-8).toUpperCase()}`;
                      const sub = r.atBill
                        ? `${r.bill?.payment_type || 'CASH'} at bill`
                        : (r.pay?.payment_method || 'CASH') + (r.onAccount ? '' : ' · settlement');
                      return (
                        <tr key={key} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="py-3.5 px-5 text-xs font-semibold text-ink-primary tabular-nums whitespace-nowrap">{formatDate(r.date)}</td>
                          <td className="py-3.5 px-3">
                            <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                              {r.atBill ? 'Paid' : 'Payment'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="text-xs tabular-nums font-semibold text-ink-primary">{ref}</div>
                            <div className="text-[10px] text-muted-foreground lowercase">{sub}</div>
                          </td>
                          <td className="py-3.5 px-3 text-right text-xs tabular-nums text-muted-foreground">—</td>
                          <td className="py-3.5 px-3 text-right text-xs font-bold tabular-nums text-emerald-600">{money(r.credit)}</td>
                          <td className={`py-3.5 px-5 text-right text-xs font-bold tabular-nums ${r.balance > 0.01 ? 'text-ink-primary' : 'text-muted-foreground'}`}>{money(r.balance)}</td>
                        </tr>
                      );
                    }

                    // ── Return / debit note ───────────────────────────────
                    const ret = r.ret;
                    const rprod = (products || []).find(pr => pr.id === ret.product_id);
                    return (
                      <tr key={key} className="hover:bg-rose-50/30 transition-colors">
                        <td className="py-3.5 px-5 text-xs font-semibold text-ink-primary tabular-nums whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="py-3.5 px-3">
                          <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">Return</span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="text-xs tabular-nums font-semibold text-rose-600">#{(ret.id || '').slice(-8).toUpperCase()}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">
                            {rprod?.name || ret.product_name || 'Debit note'}
                            {ret.quantity ? ` · ${Number(ret.quantity)} units` : ''}
                            {ret.reason ? ` · ${ret.reason}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right text-xs tabular-nums text-muted-foreground">—</td>
                        <td className="py-3.5 px-3 text-right text-xs font-bold tabular-nums text-rose-600">{money(r.credit)}</td>
                        <td className={`py-3.5 px-5 text-right text-xs font-bold tabular-nums ${r.balance > 0.01 ? 'text-ink-primary' : 'text-muted-foreground'}`}>{money(r.balance)}</td>
                      </tr>
                    );
                  })}
                  {/* Newest-first puts the oldest line last, so the carried
                      balance belongs at the foot of the list, not the head. */}
                  {hiddenBefore > 0 && newestFirst && displayRows.length > 0 && (
                    <tr className="bg-canvas/60">
                      <td className="py-3 px-5 text-[11px] font-bold text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(rangeStart)}</td>
                      <td colSpan="4" className="py-3 px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Balance brought forward
                        <span className="ml-2 normal-case font-semibold text-muted-foreground/70">{hiddenBefore} earlier {hiddenBefore === 1 ? 'entry' : 'entries'} not shown</span>
                      </td>
                      <td className="py-3 px-5 text-right text-xs font-bold tabular-nums text-ink-primary">
                        {cur}{opening.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </tbody>
                {ledgerRows.length > 0 && paymentFilter === 'ALL' && !searchTerm.trim() && (
                  <tfoot>
                    <tr className="bg-canvas border-t-2 border-black/10">
                      <td colSpan="3" className="py-3.5 px-5 text-[10px] font-black uppercase tracking-wider text-ink-primary">
                        Closing balance
                        {hiddenBefore > 0 && (
                          <span className="ml-2 normal-case font-semibold text-muted-foreground">
                            · debit/credit cover {formatDate(rangeStart)} onwards
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right text-[11px] font-bold tabular-nums text-muted-foreground">
                        {cur}{ledgerTotals.debit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-3 text-right text-[11px] font-bold tabular-nums text-muted-foreground">
                        {cur}{ledgerTotals.credit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`py-3.5 px-5 text-right text-sm font-black tabular-nums ${closing > 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {cur}{closing.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    {/* The sidebar's Amount Due sums unpaid bills only. The ledger
                        also credits debit notes and on-account advances, so the two
                        legitimately differ — say why rather than let a reader find
                        two numbers on one screen and trust neither. */}
                    {Math.abs(closing - metrics.payable) > 0.01 && (
                      <tr className="bg-canvas">
                        <td colSpan="6" className="px-5 pb-3 text-[10px] text-muted-foreground text-right">
                          Amount due on unpaid bills is {cur}{Math.round(metrics.payable).toLocaleString('en-IN')}
                          {metrics.totalReturns > 0.01 && <> · less {cur}{Math.round(metrics.totalReturns).toLocaleString('en-IN')} in debit notes</>}
                          {onAccountPayments.length > 0 && <> · less {cur}{Math.round(onAccountPayments.reduce((s, p) => s + Number(p.amount || 0), 0)).toLocaleString('en-IN')} paid on account</>}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>

            {/* The old "Total purchased / Avg" strip lived here. Both figures
                are already on the dark card and the stat list, and the table
                now ends in a closing balance — the number this page exists to
                answer. Three repeats of the same total buried it. */}
          </div>
        </div>
      </div>

      {/* Pay Supplier Modal */}
      {payOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-primary/10 backdrop-blur-md"
          onClick={() => { setPayOpen(false); setPayTarget(null); }}>
          {/* The panel had overflow-hidden and no height cap, inside a centring
              flex parent. On a short window the form was taller than the
              viewport, so it was centred and then clipped -- the Save button
              could not be reached or even seen. Cap the height and let the body
              scroll; the header and the action stay put. */}
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 shrink-0">
              <div>
                <h2 className="text-base font-black text-ink-primary leading-none">
                  {payTarget ? `Pay order #${(payTarget.id || '').slice(-6).toUpperCase()}` : `Pay ${supplier?.name || 'Supplier'}`}
                </h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  {payTarget
                    ? `Line due: ${cur}${Math.round(Math.max(0, Number(payTarget.total_amount ?? payTarget.total_cost ?? 0) - Number(payTarget.paid_amount || 0))).toLocaleString('en-IN')}`
                    : `Outstanding: ${businessProfile?.currencySymbol}${Math.round(metrics.payable).toLocaleString()} · spreads across oldest credit orders`}
                </p>
              </div>
              <button onClick={() => { setPayOpen(false); setPayTarget(null); }} className="text-muted-foreground hover:text-ink-primary text-2xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Amount</label>
                <input type="number" min="0" step="0.01" autoFocus
                  value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder={String(Math.round(metrics.payable))}
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-3.5 py-3 text-sm font-black text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 tabular-nums" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Method</label>
                <div className="grid grid-cols-5 gap-2">
                  {['CASH','BANK','UPI','CHEQUE','OTHER'].map(m => (
                    <button key={m} type="button" onClick={() => setPayMethod(m)}
                      className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        payMethod === m ? 'bg-ink-primary text-white border-ink-primary' : 'bg-white border-border text-muted-foreground hover:border-accent-signature/40'
                      }`}>{m}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                    className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Reference no.</label>
                  <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                    placeholder="UPI / cheque no."
                    className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Note</label>
                <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                  placeholder="Optional remarks"
                  className="w-full bg-white border border-border shadow-sm rounded-xl px-3 py-2.5 text-xs font-medium outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
              </div>

              {payError && (
                <div className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{payError}</div>
              )}

              <button onClick={submitPay} disabled={paySubmitting || !(Number(payAmount) > 0)}
                className="w-full py-3 rounded-xl bg-accent-signature text-button-text text-sm font-black disabled:opacity-50 transition-all">
                {paySubmitting ? 'Saving…' : `Pay ${businessProfile?.currencySymbol}${Number(payAmount || 0).toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierLedger;
