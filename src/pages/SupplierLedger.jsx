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
  ArrowLeft, Building2, Phone, Mail, MapPin,
  History, Box, TrendingUp, Calendar, Search,
  ArrowUpRight, CreditCard, Clock, FileText, ChevronRight,
  TrendingDown, Percent, Info, ShieldCheck, User2
} from 'lucide-react';
import { formatDate } from '../lib/utils';

const SupplierLedger = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { suppliers, loading: peoLoading } = usePeople(currentTenantId);
  const { purchases, purchaseReturns, supplierPayments, paySupplier, payPurchase, loading: purLoading } = usePurchases(currentTenantId);
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
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // ALL | CASH | CREDIT
  const [expandedRow, setExpandedRow] = useState(null);

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
  const [showPayHist, setShowPayHist] = useState(true);
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
      .filter(p => p.supplier_id === supplier.id || p.supplier_name === supplier.name)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [supplier, supplierPayments]);
  // Payments not tied to a specific order — shown as ledger rows. Order-linked
  // payments are reflected in each purchase's Paid/Due instead (no double-show).
  const onAccountPayments = useMemo(() => payments.filter(p => !p.purchase_id), [payments]);
  // Full payment history = credit settlements (supplier_payments) + cash
  // purchases (paid at purchase, so no settlement row exists). Both are money
  // actually paid to this supplier.
  const paymentHistory = useMemo(() => {
    const settlements = payments.map(p => ({
      id: p.id, date: p.date, amount: Number(p.amount || 0),
      method: p.payment_method, purchase_id: p.purchase_id, source: 'payment',
    }));
    const cashBuys = supplierPurchases
      .filter(p => !isCredit(p.payment_type) && Number(p.total_amount ?? p.total_cost ?? 0) > 0)
      .map(p => ({
        id: `CP-${p.id}`, date: p.date, amount: Number(p.total_amount ?? p.total_cost ?? 0),
        method: p.payment_type || 'CASH', purchase_id: p.id, source: 'purchase',
      }));
    return [...settlements, ...cashBuys].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [payments, supplierPurchases]);
  const paymentHistoryTotal = useMemo(() => paymentHistory.reduce((s, p) => s + p.amount, 0), [paymentHistory]);
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
  const bills = useMemo(() => {
    const amt = (p) => Number(p.total_amount ?? p.total_cost ?? 0);
    const at  = (p) => new Date(p.created_at || p.date).getTime();
    const BURST_MS = 10 * 60 * 1000;

    const byKey = {};
    supplierPurchases.forEach(p => {
      const key = [p.supplier_id || p.supplier_name, p.date, String(p.payment_type || '').toUpperCase()].join('|');
      (byKey[key] = byKey[key] || []).push(p);
    });

    const groups = [];
    Object.values(byKey).forEach(rows => {
      rows.sort((a, b) => at(a) - at(b));
      let chunk = [];
      rows.forEach(r => {
        const prev = chunk[chunk.length - 1];
        if (prev && Math.abs(at(r) - at(prev)) > BURST_MS) { groups.push(chunk); chunk = []; }
        chunk.push(r);
      });
      if (chunk.length) groups.push(chunk);
    });

    return groups.map(rows => {
      const total = rows.reduce((s, r) => s + amt(r), 0);
      // paid_amount is the single source of truth — the same column the
      // sidebar's payable uses. The old row badge read supplier_payments
      // instead, so a bill settled by writing paid_amount alone still showed
      // as owing.
      const paid  = rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
      return {
        id: rows[0].id, rows, date: rows[0].date,
        payment_type: rows[0].payment_type,
        credit: isCredit(rows[0].payment_type),
        total, paid, due: Math.max(0, total - paid),
      };
    });
  }, [supplierPurchases]);

  // ── The ledger ───────────────────────────────────────────────────────────
  // One chronological debit/credit list with a running balance, mirroring
  // ClientStatementReport.jsx. Previously this rendered as three stacked
  // blocks — every bill, then every return, then every payment — so a June
  // debit note sat below a July bill and nothing accumulated.
  const ledgerRows = useMemo(() => {
    const rows = [];

    bills.forEach(b => {
      rows.push({ kind: 'BILL', date: b.date, bill: b, debit: b.total, credit: 0 });

      // Credit the money once. Payments linked to any member row carry their
      // own date; whatever paid_amount holds beyond them was paid at the
      // counter when the bill was raised. Crediting both would double-count
      // and the closing balance would stop matching Amount Due.
      const linked = payments.filter(p => b.rows.some(r => r.id === p.purchase_id));
      const linkedSum = linked.reduce((s, p) => s + Number(p.amount || 0), 0);
      const atBill = b.paid - linkedSum;
      if (atBill > 0.01) {
        rows.push({ kind: 'PAY', date: b.date, bill: b, atBill: true, debit: 0, credit: atBill });
      }
      linked.forEach(p => rows.push({ kind: 'PAY', date: p.date, bill: b, pay: p, debit: 0, credit: Number(p.amount || 0) }));
    });

    supplierReturns.forEach(r => rows.push({
      kind: 'RETURN', date: r.date, ret: r, debit: 0, credit: Number(r.total_amount || 0),
    }));

    onAccountPayments.forEach(p => rows.push({
      kind: 'PAY', date: p.date, pay: p, onAccount: true, debit: 0, credit: Number(p.amount || 0),
    }));

    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let balance = 0;
    rows.forEach(r => { balance += r.debit - r.credit; r.balance = balance; });
    return rows;
  }, [bills, payments, supplierReturns, onAccountPayments]);

  // The filter now covers every row type. It used to be ALL/CASH/CREDIT and
  // applied to bills only, so picking CASH still showed every return and
  // payment — and the count beside it only ever counted purchases.
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return ledgerRows.filter(r => {
      if (paymentFilter !== 'ALL' && r.kind !== paymentFilter) return false;
      if (!q) return true;
      const hay = [
        r.bill?.id, r.ret?.id, r.pay?.id, r.pay?.reference_no, r.pay?.note,
        ...(r.bill?.rows || []).map(x => x.id),
        ...(r.bill?.rows || []).map(x => x.notes),
        ...(r.bill?.rows || []).map(x => (products || []).find(pr => pr.id === x.linked_product_id)?.name),
      ];
      return hay.some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [ledgerRows, searchTerm, paymentFilter, products]);

  const closing = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : 0;
  const ledgerTotals = useMemo(() => ({
    debit:  ledgerRows.reduce((s, r) => s + r.debit, 0),
    credit: ledgerRows.reduce((s, r) => s + r.credit, 0),
  }), [ledgerRows]);

  const metrics = useMemo(() => {
    const amt = (p) => Number(p.total_amount ?? p.total_cost ?? 0);
    const total = supplierPurchases.reduce((s, p) => s + amt(p), 0);
    const cashPaid = supplierPurchases.filter(p => isCash(p.payment_type)).reduce((s, p) => s + amt(p), 0);
    const creditTotal = supplierPurchases.filter(p => isCredit(p.payment_type)).reduce((s, p) => s + amt(p), 0);
    const count = supplierPurchases.length;
    const avg = count > 0 ? total / count : 0;
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

    return { total, count, avg, last, payable, cashPaid, creditTotal, totalReturns, net, totalPaid };
  }, [supplierPurchases, supplierReturns, payments, supplier]);

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

          {/* Total purchased — dark hero */}
          <div className="rounded-2xl bg-ink-primary p-5 relative overflow-hidden">
            <div className="absolute top-4 right-4 opacity-15 text-accent-signature/70"><Box size={36} strokeWidth={1.5} /></div>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Total purchased</span>
            <div className="tabular-nums text-3xl font-bold text-white leading-none mt-1.5">
              <span className="text-lg text-accent-signature/70 mr-1">{businessProfile?.currencySymbol || '₹'}</span>{metrics.total.toLocaleString()}
            </div>
            <span className="inline-block mt-3 text-[10px] font-bold text-accent-signature/70 uppercase tracking-wider">{metrics.count} {metrics.count === 1 ? 'purchase' : 'purchases'}</span>
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

          {/* Payment history — every payment made to this supplier, newest first */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setShowPayHist(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.015] transition-colors">
              <span className="flex items-center gap-2">
                <History size={14} className="text-accent-signature" />
                <span className="text-[12px] font-bold text-ink-primary">Payment history</span>
                <span className="text-[11px] font-semibold text-muted-foreground">{paymentHistory.length}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-[12px] font-bold text-emerald-600">{businessProfile?.currencySymbol || '₹'}{Math.round(paymentHistoryTotal).toLocaleString()}</span>
                <ChevronRight size={15} className={`text-muted-foreground transition-transform ${showPayHist ? 'rotate-90' : ''}`} />
              </span>
            </button>
            {showPayHist && (
              <div className="border-t border-black/5 max-h-80 overflow-y-auto custom-scrollbar">
                {paymentHistory.length === 0 && (
                  <div className="px-4 py-8 text-center text-[12px] font-semibold text-muted-foreground">No payments yet.</div>
                )}
                {paymentHistory.map(p => {
                  const ord = p.purchase_id
                    ? (supplierPurchases.find(x => x.id === p.purchase_id)?.invoice_no || `#${String(p.purchase_id).slice(-6).toUpperCase()}`)
                    : null;
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/[0.04] last:border-0">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-ink-primary">{formatDate(p.date)}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground bg-black/[0.05] px-1.5 py-0.5 rounded">{p.method || 'CASH'}</span>
                          {p.source === 'purchase'
                            ? <span className="tabular-nums text-[9px] font-bold text-accent-signature-hover">{ord} · cash buy</span>
                            : ord
                              ? <span className="tabular-nums text-[9px] font-bold text-accent-signature-hover">{ord}</span>
                              : <span className="text-[9px] font-semibold text-muted-foreground uppercase">On account</span>}
                        </div>
                      </div>
                      <span className="tabular-nums text-[13px] font-bold text-emerald-600 shrink-0">{businessProfile?.currencySymbol || '₹'}{Number(p.amount || 0).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
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
                  {[['ALL','All'],['BILL','Bills'],['PAY','Payments'],['RETURN','Returns']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => { setPaymentFilter(val); setExpandedRow(null); }}
                      className={`px-3 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        paymentFilter === val
                          ? 'bg-accent-signature text-white shadow-sm'
                          : 'text-muted-foreground hover:text-ink-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-24 text-center">
                        <div className="opacity-10 mb-4 flex justify-center"><Box size={72} strokeWidth={1} /></div>
                        <h4 className="text-xl font-bold text-ink-primary mb-1">No transactions</h4>
                        <p className="text-xs text-muted-foreground">
                          {ledgerRows.length === 0
                            ? 'This supplier has no recorded purchases yet.'
                            : 'Nothing matches this filter.'}
                        </p>
                      </td>
                    </tr>
                  ) : filteredRows.map((r, i) => {
                    const key = `${r.kind}-${r.bill?.id || r.ret?.id || r.pay?.id}-${i}`;
                    const money = (n) => `${cur}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                    // ── Bill ──────────────────────────────────────────────
                    if (r.kind === 'BILL') {
                      const b = r.bill;
                      const multi = b.rows.length > 1;
                      const expanded = expandedRow === b.id;
                      const names = b.rows
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
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/[0.05] text-ink-secondary">{b.rows.length} items</span>
                                )}
                                {b.due > 0.01 && (
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-100 tabular-nums">
                                    due {cur}{Math.round(b.due).toLocaleString('en-IN')}
                                  </span>
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
                                    {b.rows.map(x => {
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
                                {b.rows.some(x => x.notes) && (
                                  <div className="mt-3 text-[11px] text-muted-foreground">
                                    {b.rows.filter(x => x.notes).map(x => x.notes).join(' · ')}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}

                          {/* A single-product bill still needs its Pay button. */}
                          {!multi && b.due > 0.01 && hasPermission('purchases', 'edit') !== false && (
                            <tr className="bg-canvas/30">
                              <td colSpan="6" className="px-5 py-2 text-right">
                                <button
                                  onClick={() => openPay(b.rows[0], b.due)}
                                  className="no-print text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-ink-primary text-white hover:bg-black transition-all"
                                >Pay {cur}{Math.round(b.due).toLocaleString('en-IN')}</button>
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
                </tbody>
                {ledgerRows.length > 0 && paymentFilter === 'ALL' && !searchTerm.trim() && (
                  <tfoot>
                    <tr className="bg-canvas border-t-2 border-black/10">
                      <td colSpan="3" className="py-3.5 px-5 text-[10px] font-black uppercase tracking-wider text-ink-primary">Closing balance</td>
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

            {/* Slim summary footer */}
            <div className="border-t border-black/5 bg-canvas/60 px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={13} className="text-accent-signature" /> Total purchased
              </span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Avg</span>
                  <span className="tabular-nums text-[13px] font-bold text-ink-primary">{businessProfile?.currencySymbol || '₹'}{Math.round(metrics.avg).toLocaleString()}</span>
                </div>
                <div className="tabular-nums text-xl font-bold text-ink-primary">
                  <span className="text-sm text-accent-signature mr-0.5">{businessProfile?.currencySymbol || '₹'}</span>{metrics.total.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pay Supplier Modal */}
      {payOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-primary/10 backdrop-blur-md"
          onClick={() => { setPayOpen(false); setPayTarget(null); }}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
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

            <div className="p-5 space-y-4">
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
