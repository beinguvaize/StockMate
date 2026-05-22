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
  TrendingDown, Percent, Info, ShieldCheck
} from 'lucide-react';
import { formatDate } from '../lib/utils';

const SupplierLedger = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { suppliers, loading: peoLoading } = usePeople(currentTenantId);
  const { purchases, purchaseReturns, loading: purLoading } = usePurchases(currentTenantId);
  const { products, loading: invLoading } = useInventory(currentTenantId);

  const loading = peoLoading || purLoading || invLoading;
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // ALL | CASH | CREDIT
  const [expandedRow, setExpandedRow] = useState(null);

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
    // Live payable from suppliers.balance (authoritative) — falls back to computed credit total
    const payable = Number(supplier?.balance ?? supplier?.outstanding_balance ?? creditTotal);

    return { total, count, avg, last, payable, cashPaid, creditTotal, totalReturns, net };
  }, [supplierPurchases, supplierReturns, supplier]);

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
      {/* Dynamic Header & Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 mt-2">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate(-1)}
            className="w-14 h-14 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary group shadow-sm bg-white"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Suppliers
              <ChevronRight size={10} className="opacity-30" />
              <span className="text-accent-signature">Transaction History</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-0">Supplier Ledger<span className="text-accent-signature">.</span></h1>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
           <div className="hidden lg:flex flex-col items-end">
             <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">As of</span>
             <span className="text-[10px] font-semibold text-ink-primary">{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
           </div>
           <div className="w-px h-10 bg-black/5 hidden lg:block"></div>
           <div className="flex gap-2">
             <button className="h-14 px-8 rounded-pill bg-ink-primary text-white text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] shadow-xl shadow-ink-primary/20 transition-all flex items-center gap-3 group">
               Export PDF <ArrowUpRight size={14} className="text-accent-signature group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
             </button>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Supplier Statistics & Profile */}
        <div className="lg:col-span-4 space-y-6">
          {/* Detailed Profile Card */}
          <div className="glass-panel !p-8 rounded-[2.5rem] shadow-premium overflow-hidden relative bg-white/40">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            
            <div className="flex items-center gap-6 mb-10 relative z-10">
              <div className="w-20 h-20 rounded-[1.5rem] bg-ink-primary flex items-center justify-center text-accent-signature shadow-xl group-hover:scale-105 transition-transform">
                <Building2 size={36} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-ink-primary leading-tight tracking-tight">{supplier.name}</h3>
                <div className="flex items-center gap-2 mt-2">
                    <ShieldCheck size={12} className="text-accent-signature" />
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Active Supplier</span>
                </div>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-canvas p-4 rounded-2xl border border-black/5 flex flex-col justify-center shadow-inner">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2"><Phone size={10} className="text-accent-signature" /> Phone</span>
                  <span className="text-xs font-semibold text-ink-primary">{supplier.phone || 'N/A'}</span>
                </div>
                <div className="bg-canvas p-4 rounded-2xl border border-black/5 flex flex-col justify-center shadow-inner">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2"><Mail size={10} className="text-accent-signature" /> Email</span>
                  <span className="text-xs font-semibold text-ink-primary truncate lowercase">{supplier.email || 'N/A'}</span>
                </div>
              </div>

              <div className="bg-canvas p-5 rounded-2xl border border-black/5 shadow-inner">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2"><MapPin size={10} className="text-accent-signature" /> Address</span>
                <p className="text-xs font-semibold text-ink-primary leading-relaxed opacity-80">{supplier.address || 'No address on file.'}</p>
              </div>

              <div className="pt-6 border-t border-black/5">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-4"><TrendingUp size={10} className="text-accent-signature" /> Contact Person</span>
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-ink-primary/5 border border-black/5 flex items-center justify-center text-ink-primary font-bold text-sm uppercase shadow-sm">
                     {supplier.contact_person?.charAt(0) || '?'}
                   </div>
                   <div>
                       <span className="text-xs font-semibold text-ink-primary block">{supplier.contact_person || 'Not assigned'}</span>
                       <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Primary Contact</span>
                   </div>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Ribbon */}
          <div className="grid grid-cols-1 gap-6">
             <div className="p-8 bg-ink-primary rounded-[3rem] shadow-2xl relative overflow-hidden group border border-white/10">
               <div className="absolute top-0 right-0 w-64 h-64 bg-accent-signature/10 rounded-full -mr-32 -mt-32 blur-[100px] pointer-events-none transition-transform group-hover:scale-150 duration-700"></div>
               <div className="absolute top-6 right-8 opacity-20 text-accent-signature group-hover:rotate-12 group-hover:scale-110 transition-all">
                 <Box size={48} strokeWidth={1.5} />
               </div>
               <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-3 block">Total Purchased</span>
               <div className="text-5xl font-black text-white tabular-nums tracking-tighter leading-none mb-4">
                 <span className="text-2xl text-accent-signature opacity-50 mr-2">{businessProfile?.currencySymbol}</span>
                 {metrics.total.toLocaleString()}
               </div>
               <div className="inline-flex px-5 py-2.5 bg-white/5 rounded-full border border-white/10 shadow-inner group-hover:bg-white/10 transition-all">
                  <span className="text-[10px] font-semibold text-accent-signature uppercase tracking-wider">{metrics.count} {metrics.count === 1 ? 'Purchase' : 'Purchases'}</span>
               </div>
             </div>

             <div className="p-8 bg-white rounded-[3rem] border border-black/5 shadow-premium space-y-6">
                <div className="flex justify-between items-center border-b border-black/5 pb-5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Average Purchase</span>
                  <span className="text-base font-bold text-ink-primary tabular-nums">{businessProfile?.currencySymbol}{Math.round(metrics.avg).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Last Purchase</span>
                  <span className="text-base font-bold text-ink-primary tabular-nums">
                    {metrics.last ? formatDate(metrics.last) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-5 border-t border-black/5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cash Paid</span>
                  <span className="text-base font-bold text-emerald-500 tabular-nums">
                    {businessProfile?.currencySymbol}{Math.round(metrics.cashPaid).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Credit Purchases</span>
                  <span className="text-base font-bold text-amber-500 tabular-nums">
                    {businessProfile?.currencySymbol}{Math.round(metrics.creditTotal).toLocaleString()}
                  </span>
                </div>
                {metrics.totalReturns > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Returns (Debit Notes)</span>
                    <span className="text-base font-bold text-rose-500 tabular-nums">
                      −{businessProfile?.currencySymbol}{Math.round(metrics.totalReturns).toLocaleString()}
                    </span>
                  </div>
                )}
                {metrics.totalReturns > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Net Purchased</span>
                    <span className="text-base font-bold text-ink-primary tabular-nums">
                      {businessProfile?.currencySymbol}{Math.round(metrics.net).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-5 border-t border-black/5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount Due</span>
                  <span className={`text-base font-bold tabular-nums ${metrics.payable > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {businessProfile?.currencySymbol}{metrics.payable.toLocaleString()}
                  </span>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column: Detailed Purchase History */}
        <div className="lg:col-span-8 flex flex-col min-h-[600px]">
          <div className="glass-panel !p-0 rounded-[2.5rem] shadow-premium overflow-hidden flex flex-col flex-1 border border-black/5 bg-white/40">
            {/* Table Header Utility Bar */}
            <div className="p-6 border-b border-black/5 bg-white/60 backdrop-blur-3xl flex flex-col md:flex-row justify-between items-center gap-6 sticky top-0 z-20">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative group flex-1 md:w-80">
                  <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-accent-signature transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Search by reference or notes..."
                    className="w-full h-14 pl-16 pr-6 rounded-pill bg-white border border-gray-300 shadow-sm text-[10px] font-black uppercase tracking-widest outline-none focus:ring-8 focus:ring-accent-signature/5 transition-all shadow-inner"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-3 flex-wrap">
                {['ALL','CASH','CREDIT'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setPaymentFilter(opt)}
                    className={`px-5 h-10 rounded-pill text-[9px] font-black uppercase tracking-widest transition-all border ${
                      paymentFilter === opt
                        ? 'bg-ink-primary text-accent-signature border-ink-primary shadow-lg shadow-ink-primary/20'
                        : 'bg-white text-gray-500 border-black/10 hover:border-ink-primary/30'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
                <div className="px-6 h-12 bg-ink-primary rounded-pill text-[10px] font-semibold text-accent-signature uppercase tracking-wider flex items-center gap-3 shadow-lg shadow-ink-primary/20">
                  <History size={16} />
                  {filteredPurchases.length} {filteredPurchases.length === 1 ? 'Record' : 'Records'}
                </div>
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
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${credit ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {credit ? 'Credit' : 'Cash'}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="text-sm font-bold tabular-nums text-ink-primary">
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
                              <div className="text-sm font-bold tabular-nums text-rose-600">
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
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-ink-primary p-10 flex flex-col md:flex-row justify-between items-center gap-10 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-accent-signature/20 to-transparent pointer-events-none"></div>
                <div className="relative z-10 flex flex-col">
                    <p className="text-[10px] font-semibold text-accent-signature uppercase tracking-wider mb-3 flex items-center gap-3">
                        <TrendingUp size={16} /> Total Purchased
                    </p>
                    <div className="text-white text-5xl font-black tabular-nums tracking-tighter leading-none">
                        <span className="text-2xl text-accent-signature opacity-50 mr-3">{businessProfile?.currencySymbol}</span>
                        {metrics.total.toLocaleString()}
                    </div>
                </div>

                <div className="flex items-center gap-8 relative z-10 w-full md:w-auto">
                    <div className="bg-white/5 px-10 py-6 rounded-[2rem] border border-white/10 flex flex-col items-center flex-1 md:flex-none hover:bg-white/10 transition-all">
                        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Purchases</span>
                        <span className="text-3xl font-black text-white leading-none tabular-nums">{metrics.count}</span>
                    </div>
                    <div className="text-right flex flex-col justify-center">
                        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Average</span>
                        <span className="text-3xl font-black text-accent-signature tabular-nums leading-none tracking-tighter mr-1">
                            {businessProfile?.currencySymbol}{Math.round(metrics.avg).toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupplierLedger;
