import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { usePurchases } from '../hooks/usePurchases';
import { useInventory } from '../hooks/useInventory';
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

  const loading = peoLoading || purLoading || invLoading;
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // ALL | CASH | CREDIT
  const [expandedRow, setExpandedRow] = useState(null);

  // Pay-supplier modal state
  const [payOpen, setPayOpen]       = useState(false);
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

    if (payTarget) {
      // Pay this one order.
      const { error } = await payPurchase({ supplierId: id, purchaseId: payTarget.id, amount: amt, ...common });
      setPaySubmitting(false);
      if (error) { setPayError(error.message || 'Payment failed'); return; }
      setPayOpen(false);
      return;
    }

    // General payment: settle_supplier_payment auto-allocates FIFO across the
    // oldest unpaid credit orders (one row per order) and books any leftover as
    // an on-account advance. Single source of allocation logic — no JS loop.
    const { error } = await paySupplier({ supplierId: id, amount: amt, ...common });
    setPaySubmitting(false);
    if (error) { setPayError(error.message || 'Payment failed'); return; }
    setPayOpen(false);
  };

  const isCredit = (pt) => ['CREDIT','UDHAAR','POST-CAPITAL'].includes(String(pt || '').toUpperCase());
  const isCash = (pt) => ['CASH','PAID'].includes(String(pt || '').toUpperCase());

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
  // Paid-to-date per purchase id (from linked payments).
  const paidByPurchase = useMemo(() => {
    const m = {};
    payments.forEach(p => { if (p.purchase_id) m[p.purchase_id] = (m[p.purchase_id] || 0) + Number(p.amount || 0); });
    return m;
  }, [payments]);

  const filteredPurchases = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return supplierPurchases.filter(p => {
      const matchSearch =
        (p.id || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q);
      const matchPay =
        paymentFilter === 'ALL' ||
        (paymentFilter === 'CASH' && isCash(p.payment_type)) ||
        (paymentFilter === 'CREDIT' && isCredit(p.payment_type));
      return matchSearch && matchPay;
    });
  }, [supplierPurchases, searchTerm, paymentFilter]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-accent-signature/30 border-t-accent-signature rounded-full animate-spin" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in text-center p-12">
        <div className="glass-panel !py-12 px-8 max-w-sm rounded-[3rem] border-dashed border-2">
            <Info size={64} className="mx-auto mb-6 text-gray-300 opacity-50" />
            <h2 className="text-3xl font-bold text-ink-primary mb-2">Supplier Not Found</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
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
            className="w-10 h-10 shrink-0 rounded-xl border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary group bg-white"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              Suppliers
              <ChevronRight size={10} className="opacity-40" />
              <span className="text-amber-600">Ledger</span>
            </div>
            <h1 className="text-xl font-extrabold text-ink-primary leading-none truncate">{supplier.name}<span className="text-amber-500">.</span></h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden lg:block text-[10px] font-semibold text-gray-400">
            As of {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button
            onClick={() => window.print()}
            className="h-10 px-4 rounded-xl bg-ink-primary text-white text-[11px] font-bold hover:bg-ink-primary/90 transition-all flex items-center gap-2"
          >
            Export PDF <ArrowUpRight size={14} className="text-amber-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Supplier Statistics & Profile */}
        <div className="lg:col-span-4 space-y-5">
          {/* Profile Card */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-4 mb-5 pb-5 border-b border-black/5">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-mono font-bold text-lg shrink-0">
                {(supplier.name || '–').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w => w[0]).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-ink-primary leading-tight truncate">{supplier.name}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <ShieldCheck size={12} className="text-amber-600" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active supplier</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[13px]">
                <Phone size={14} className="text-gray-300 shrink-0" />
                <span className="font-semibold text-ink-primary">{supplier.phone || <span className="text-gray-400 font-normal">No phone</span>}</span>
              </div>
              <div className="flex items-center gap-3 text-[13px] min-w-0">
                <Mail size={14} className="text-gray-300 shrink-0" />
                <span className="font-semibold text-ink-primary truncate lowercase">{supplier.email || <span className="text-gray-400 font-normal normal-case">No email</span>}</span>
              </div>
              <div className="flex items-start gap-3 text-[13px]">
                <MapPin size={14} className="text-gray-300 shrink-0 mt-0.5" />
                <span className="font-semibold text-ink-primary leading-snug">{supplier.address || <span className="text-gray-400 font-normal">No address on file</span>}</span>
              </div>
              <div className="flex items-center gap-3 text-[13px] pt-3 border-t border-black/5">
                <User2 size={14} className="text-gray-300 shrink-0" />
                <span className="font-semibold text-ink-primary">{supplier.contact_person || <span className="text-gray-400 font-normal">No contact person</span>}</span>
              </div>
            </div>
          </div>

          {/* Amount Due — primary signal */}
          <div className={`rounded-2xl border p-5 ${metrics.payable > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50/60 border-emerald-100'}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${metrics.payable > 0 ? 'text-red-400' : 'text-emerald-500'}`}>Amount due</span>
                <div className={`font-mono tabular-nums text-2xl font-bold mt-0.5 ${metrics.payable > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  <span className="text-base opacity-60 mr-0.5">{businessProfile?.currencySymbol || '₹'}</span>{metrics.payable.toLocaleString()}
                </div>
              </div>
              <span className={`text-[11px] font-bold rounded-full px-3 py-1 bg-white border ${metrics.payable > 0 ? 'text-red-500 border-red-200' : 'text-emerald-600 border-emerald-200'}`}>
                {metrics.payable > 0 ? 'Outstanding' : 'Settled'}
              </span>
            </div>
            {metrics.payable > 0 && hasPermission('purchases', 'edit') !== false && (
              <button
                onClick={openPay}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ink-primary text-white text-[12px] font-bold hover:bg-ink-primary/90 transition-all"
              >
                <CreditCard size={14} className="text-amber-400" /> Record payment
              </button>
            )}
          </div>

          {/* Total purchased — dark hero */}
          <div className="rounded-2xl bg-ink-primary p-5 relative overflow-hidden">
            <div className="absolute top-4 right-4 opacity-15 text-amber-400"><Box size={36} strokeWidth={1.5} /></div>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Total purchased</span>
            <div className="font-mono tabular-nums text-3xl font-bold text-white leading-none mt-1.5">
              <span className="text-lg text-amber-400/70 mr-1">{businessProfile?.currencySymbol || '₹'}</span>{metrics.total.toLocaleString()}
            </div>
            <span className="inline-block mt-3 text-[10px] font-bold text-amber-400 uppercase tracking-wider">{metrics.count} {metrics.count === 1 ? 'purchase' : 'purchases'}</span>
          </div>

          {/* Stat breakdown */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm divide-y divide-black/5">
            {[
              ['Average purchase', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.avg).toLocaleString()}`, 'text-ink-primary'],
              ['Last purchase', metrics.last ? formatDate(metrics.last) : 'N/A', 'text-ink-primary'],
              ['Cash paid', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.cashPaid).toLocaleString()}`, 'text-emerald-600'],
              ['Credit purchases', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.creditTotal).toLocaleString()}`, 'text-amber-600'],
              ['Payments made', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.totalPaid).toLocaleString()}`, 'text-emerald-600'],
              ...(metrics.totalReturns > 0 ? [
                ['Returns (debit notes)', `−${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.totalReturns).toLocaleString()}`, 'text-rose-500'],
                ['Net purchased', `${businessProfile?.currencySymbol || '₹'}${Math.round(metrics.net).toLocaleString()}`, 'text-ink-primary'],
              ] : []),
            ].map(([label, val, cls]) => (
              <div key={label} className="flex justify-between items-center px-4 py-3">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
                <span className={`font-mono tabular-nums text-[13px] font-bold ${cls}`}>{val}</span>
              </div>
            ))}
          </div>

          {/* Payment history — every payment made to this supplier, newest first */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setShowPayHist(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.015] transition-colors">
              <span className="flex items-center gap-2">
                <History size={14} className="text-amber-600" />
                <span className="text-[12px] font-bold text-ink-primary">Payment history</span>
                <span className="text-[11px] font-semibold text-gray-400">{paymentHistory.length}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-[12px] font-bold text-emerald-600">{businessProfile?.currencySymbol || '₹'}{Math.round(paymentHistoryTotal).toLocaleString()}</span>
                <ChevronRight size={15} className={`text-gray-400 transition-transform ${showPayHist ? 'rotate-90' : ''}`} />
              </span>
            </button>
            {showPayHist && (
              <div className="border-t border-black/5 max-h-80 overflow-y-auto custom-scrollbar">
                {paymentHistory.length === 0 && (
                  <div className="px-4 py-8 text-center text-[12px] font-semibold text-gray-400">No payments yet.</div>
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
                          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-black/[0.05] px-1.5 py-0.5 rounded">{p.method || 'CASH'}</span>
                          {p.source === 'purchase'
                            ? <span className="font-mono text-[9px] font-bold text-amber-700">{ord} · cash buy</span>
                            : ord
                              ? <span className="font-mono text-[9px] font-bold text-amber-700">{ord}</span>
                              : <span className="text-[9px] font-semibold text-gray-400 uppercase">On account</span>}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-[13px] font-bold text-emerald-600 shrink-0">{businessProfile?.currencySymbol || '₹'}{Number(p.amount || 0).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detailed Purchase History */}
        <div className="lg:col-span-8 flex flex-col min-h-[600px]">
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
            {/* Table Header Utility Bar */}
            <div className="p-4 border-b border-black/5 flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="relative group flex-1 w-full md:max-w-xs">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-amber-600 transition-colors" />
                <input
                  type="text"
                  placeholder="Search reference or notes…"
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-white border border-gray-300 text-[12px] font-semibold text-ink-primary outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-gray-400 placeholder:font-normal"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 p-1 bg-black/[0.04] rounded-xl">
                  {['ALL','CASH','CREDIT'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setPaymentFilter(opt)}
                      className={`px-3 h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        paymentFilter === opt
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-gray-500 hover:text-ink-primary'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-bold text-gray-400">
                  {filteredPurchases.length} {filteredPurchases.length === 1 ? 'record' : 'records'}
                </span>
              </div>
            </div>

            {/* Transaction Ledger (expandable rows) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas/70 sticky top-0 z-10 border-b border-black/5">
                  <tr>
                    <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-10"></th>
                    <th className="py-4 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="py-4 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Reference</th>
                    <th className="py-4 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="py-4 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Qty</th>
                    <th className="py-4 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                    <th className="py-4 px-6 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredPurchases.length === 0 && supplierReturns.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-24 text-center">
                        <div className="opacity-10 mb-4 flex justify-center"><Box size={72} strokeWidth={1} /></div>
                        <h4 className="text-xl font-bold text-ink-primary mb-1">No transactions</h4>
                        <p className="text-xs text-gray-400">This supplier has no recorded purchases yet.</p>
                      </td>
                    </tr>
                  ) : (
                    <>
                    {filteredPurchases.map((p) => {
                      const product = (products || []).find(prod => prod.id === p.linked_product_id);
                      const amount = Number(p.total_amount ?? p.total_cost ?? 0);
                      const qty = Number(p.quantity ?? 0);
                      const unit = qty > 0 ? amount / qty : 0;
                      const credit = isCredit(p.payment_type);
                      const expanded = expandedRow === p.id;
                      return (
                        <React.Fragment key={p.id}>
                          <tr
                            className={`cursor-pointer transition-colors ${expanded ? 'bg-canvas' : 'hover:bg-canvas/60'}`}
                            onClick={() => setExpandedRow(expanded ? null : p.id)}
                          >
                            <td className="py-4 px-6 text-gray-400">
                              <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90 text-accent-signature' : ''}`} />
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-xs font-semibold text-ink-primary">{formatDate(p.date)}</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-xs font-mono text-gray-600">#{(p.id || '').slice(-8).toUpperCase()}</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-xs font-semibold text-ink-primary truncate max-w-[180px]">{product?.name || '—'}</div>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <span className="text-xs font-semibold text-emerald-600 tabular-nums">+{qty}</span>
                            </td>
                            <td className="py-4 px-4">
                              {(() => {
                                const paid = paidByPurchase[p.id] || 0;
                                const orderDue = credit ? Math.max(0, amount - paid) : 0;
                                if (!credit) return <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Cash</span>;
                                if (orderDue <= 0.5) return <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Paid</span>;
                                return (
                                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    <span className="inline-flex flex-col leading-tight">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">{paid > 0 ? 'Partial' : 'Credit'}</span>
                                      <span className="font-mono text-[10px] text-red-500">due {businessProfile?.currencySymbol || '₹'}{Math.round(orderDue).toLocaleString()}</span>
                                    </span>
                                    {hasPermission('purchases', 'edit') !== false && (
                                      <button onClick={() => openPay(p, orderDue)}
                                        className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-ink-primary text-white hover:bg-black transition-all">Pay</button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="text-sm font-bold font-mono tabular-nums text-ink-primary">
                                {businessProfile?.currencySymbol || '₹'}{amount.toLocaleString()}
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-canvas/40">
                              <td colSpan="7" className="px-6 py-5">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Full Reference</div>
                                    <div className="font-mono text-ink-primary break-all">{p.id}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Unit Cost</div>
                                    <div className="font-semibold text-ink-primary tabular-nums">{businessProfile?.currencySymbol || '₹'}{unit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Product SKU</div>
                                    <div className="font-mono text-ink-primary">{product?.sku || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Status</div>
                                    <div className={`font-semibold ${credit ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      {credit ? 'Payable (Credit)' : 'Settled (Cash Paid)'}
                                    </div>
                                  </div>
                                  <div className="col-span-2 md:col-span-4">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Notes</div>
                                    <div className="text-ink-primary">{p.notes || <span className="text-gray-400 italic">No notes</span>}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {/* ── Return rows ── */}
                    {supplierReturns.map((r) => {
                      const product = (products || []).find(prod => prod.id === r.product_id);
                      const expanded = expandedRow === r.id;
                      return (
                        <React.Fragment key={r.id}>
                          <tr
                            className={`cursor-pointer transition-colors ${expanded ? 'bg-rose-50/60' : 'hover:bg-rose-50/40'}`}
                            onClick={() => setExpandedRow(expanded ? null : r.id)}
                          >
                            <td className="py-4 px-6 text-rose-300">
                              <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90 text-rose-500' : ''}`} />
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-xs font-semibold text-ink-primary">{formatDate(r.date)}</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-xs font-mono text-rose-600">#{(r.id || '').slice(-8).toUpperCase()}</div>
                              <div className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">Debit Note</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-xs font-semibold text-ink-primary truncate max-w-[180px]">{product?.name || r.product_name || '—'}</div>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <span className="text-xs font-semibold text-rose-500 tabular-nums">−{Number(r.quantity)}</span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
                                Return
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="text-sm font-bold font-mono tabular-nums text-rose-600">
                                −{businessProfile?.currencySymbol || '₹'}{Number(r.total_amount).toLocaleString()}
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-rose-50/30">
                              <td colSpan="7" className="px-6 py-5">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Full Reference</div>
                                    <div className="font-mono text-ink-primary break-all">{r.id}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Qty Returned</div>
                                    <div className="font-semibold text-rose-600 tabular-nums">{Number(r.quantity)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Unit Price</div>
                                    <div className="font-semibold text-ink-primary tabular-nums">{businessProfile?.currencySymbol || '₹'}{Number(r.unit_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Linked Purchase</div>
                                    <div className="font-mono text-ink-primary text-[10px]">{r.purchase_id || '—'}</div>
                                  </div>
                                  <div className="col-span-2 md:col-span-4">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Reason</div>
                                    <div className="text-ink-primary">{r.reason || <span className="text-gray-400 italic">No reason given</span>}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {/* ── On-account payment rows (not tied to one order) ── */}
                    {onAccountPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-emerald-50/40 transition-colors">
                        <td className="py-4 px-6 text-emerald-300"><CreditCard size={14} /></td>
                        <td className="py-4 px-4"><div className="text-xs font-semibold text-ink-primary">{formatDate(p.date)}</div></td>
                        <td className="py-4 px-4">
                          <div className="text-xs font-mono text-emerald-600">#{(p.id || '').slice(-8).toUpperCase()}</div>
                          <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Payment</div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-xs font-semibold text-ink-primary truncate max-w-[180px]">{p.note || (p.reference_no ? `Ref ${p.reference_no}` : '—')}</div>
                        </td>
                        <td className="py-4 px-4 text-center text-gray-300">—</td>
                        <td className="py-4 px-4">
                          <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                            {p.payment_method || 'PAID'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="text-sm font-bold font-mono tabular-nums text-emerald-600">
                            −{businessProfile?.currencySymbol || '₹'}{Number(p.amount).toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Slim summary footer */}
            <div className="border-t border-black/5 bg-canvas/60 px-5 py-3 flex items-center justify-between gap-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={13} className="text-amber-600" /> Total purchased
              </span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Avg</span>
                  <span className="font-mono tabular-nums text-[13px] font-bold text-ink-primary">{businessProfile?.currencySymbol || '₹'}{Math.round(metrics.avg).toLocaleString()}</span>
                </div>
                <div className="font-mono tabular-nums text-xl font-bold text-ink-primary">
                  <span className="text-sm text-amber-500 mr-0.5">{businessProfile?.currencySymbol || '₹'}</span>{metrics.total.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pay Supplier Modal */}
      {payOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl border border-black/5 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <div>
                <h2 className="text-base font-black text-ink-primary leading-none">
                  {payTarget ? `Pay order #${(payTarget.id || '').slice(-6).toUpperCase()}` : `Pay ${supplier?.name || 'Supplier'}`}
                </h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                  {payTarget
                    ? `Order due: ${businessProfile?.currencySymbol}${Math.round(Math.max(0, Number(payTarget.total_amount ?? payTarget.total_cost ?? 0) - (paidByPurchase[payTarget.id] || 0))).toLocaleString()}`
                    : `Outstanding: ${businessProfile?.currencySymbol}${Math.round(metrics.payable).toLocaleString()} · spreads across oldest credit orders`}
                </p>
              </div>
              <button onClick={() => { setPayOpen(false); setPayTarget(null); }} className="text-gray-400 hover:text-ink-primary text-2xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Amount</label>
                <input type="number" min="0" step="0.01" autoFocus
                  value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder={String(Math.round(metrics.payable))}
                  className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3.5 py-3 text-sm font-black text-ink-primary outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10 tabular-nums" />
              </div>

              <div>
                <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Method</label>
                <div className="grid grid-cols-5 gap-2">
                  {['CASH','BANK','UPI','CHEQUE','OTHER'].map(m => (
                    <button key={m} type="button" onClick={() => setPayMethod(m)}
                      className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        payMethod === m ? 'bg-ink-primary text-white border-ink-primary' : 'bg-white border-gray-300 text-gray-500 hover:border-accent-signature/40'
                      }`}>{m}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Reference no.</label>
                  <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                    placeholder="UPI / cheque no."
                    className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-ink-secondary uppercase tracking-wider mb-2">Note</label>
                <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                  placeholder="Optional remarks"
                  className="w-full bg-white border border-gray-300 shadow-sm rounded-xl px-3 py-2.5 text-xs font-medium outline-none focus:border-accent-signature focus:ring-4 focus:ring-accent-signature/10" />
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
