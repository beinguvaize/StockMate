import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { 
  ArrowLeft, Building2, Phone, Mail, MapPin, 
  History, Box, TrendingUp, Calendar, Search, 
  ArrowUpRight, CreditCard, Clock, FileText, ChevronRight,
  TrendingDown, Percent, Info
} from 'lucide-react';

const SupplierLedger = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    suppliers, purchases, products, businessProfile, 
    loading, isViewOnly 
  } = useAppContext();

  const [searchTerm, setSearchTerm] = useState('');

  // 1. Resolve Supplier
  const supplier = useMemo(() => 
    suppliers.find(s => s.id === id), 
    [suppliers, id]
  );

  // 2. Aggregate Data
  const supplierPurchases = useMemo(() => {
    if (!supplier) return [];
    return purchases
      .filter(p => p.supplier_id === supplier.id || p.supplier_name === supplier.name)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [supplier, purchases]);

  const filteredPurchases = useMemo(() => {
    return supplierPurchases.filter(p => 
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [supplierPurchases, searchTerm]);

  const metrics = useMemo(() => {
    const total = supplierPurchases.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    const count = supplierPurchases.length;
    const avg = count > 0 ? total / count : 0;
    const last = supplierPurchases[0]?.date;
    
    return { total, count, avg, last };
  }, [supplierPurchases]);

  if (loading) return null;

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in text-center p-12">
        <div className="glass-panel !py-12 px-8 max-w-sm rounded-[3rem] border-dashed border-2">
            <Info size={64} className="mx-auto mb-6 text-gray-300 opacity-50" />
            <h2 className="text-3xl font-semibold mb-2 uppercase">MISSING PARTNER.</h2>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-6 leading-relaxed">
              The partner record was either moved, deleted, or you have invalid access credentials.
            </p>
            <button onClick={() => navigate('../')} className="btn-signature !px-10 !h-14 !rounded-pill">BACK TO DIRECTORY</button>
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
            <div className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 font-mono">
              <span className="hover:text-ink-primary cursor-pointer transition-colors" onClick={() => navigate('/suppliers')}>Partners</span>
              <ChevronRight size={10} className="opacity-30" />
              <span className="text-accent-signature">Activity Ledger</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black font-sora text-ink-primary leading-none tracking-tighter mb-0 uppercase">REPORT<span className="text-accent-signature">.</span></h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="hidden lg:flex flex-col items-end">
             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Last Updated Portfolio</span>
             <span className="text-xs font-black text-ink-primary leading-none">{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
           </div>
           <div className="w-px h-10 bg-black/5 hidden lg:block mx-2"></div>
           <div className="flex gap-2">
             <button className="px-4 h-11 rounded-pill bg-ink-primary text-surface text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2">
               Download PDF <ArrowUpRight size={14} className="text-accent-signature" />
             </button>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Supplier Statistics & Profile */}
        <div className="lg:col-span-4 space-y-6">
          {/* Detailed Profile Card */}
          <div className="glass-panel !p-8 rounded-[3rem] shadow-premium overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            
            <div className="flex items-center gap-5 mb-8 relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-canvas border border-black/5 flex items-center justify-center text-ink-primary shadow-sm">
                <Building2 size={32} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-ink-primary leading-tight tracking-tight">{supplier.name}</h3>
                <span className="text-[10px] font-bold text-accent-signature uppercase tracking-widest">Verified Supplier</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-canvas p-4 rounded-2xl border border-black/5 flex flex-col justify-center">
                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5"><Phone size={10} /> Tel. Contact</span>
                  <span className="text-xs font-black text-ink-primary">{supplier.phone || 'N/A'}</span>
                </div>
                <div className="bg-canvas p-4 rounded-2xl border border-black/5 flex flex-col justify-center">
                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5"><Mail size={10} /> Email Data</span>
                  <span className="text-xs font-black text-ink-primary truncate">{supplier.email || 'N/A'}</span>
                </div>
              </div>

              <div className="bg-canvas p-5 rounded-2xl border border-black/5">
                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-2"><MapPin size={10} /> Headquarters</span>
                <p className="text-xs font-bold text-ink-primary leading-relaxed opacity-80">{supplier.address || 'No registration address provided.'}</p>
              </div>

              <div className="pt-4 border-t border-black/5">
                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-3"><ArrowUpRight size={10} /> Account Executive</span>
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-ink-primary/5 flex items-center justify-center text-ink-primary font-bold text-[10px]">
                     {supplier.contact_person?.charAt(0) || '?'}
                   </div>
                   <span className="text-xs font-black text-ink-primary">{supplier.contact_person || 'No Lead Assigned'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Ribbon */}
          <div className="grid grid-cols-1 gap-4">
             <div className="p-6 bg-ink-primary rounded-[2.5rem] shadow-xl relative overflow-hidden group border border-white/5">
               <div className="absolute top-4 right-6 opacity-20 text-accent-signature">
                 <TrendingUp size={40} />
               </div>
               <span className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] mb-2 block">Enterprise Procurements</span>
               <div className="text-4xl font-black text-white tabular-nums tracking-tighter">
                 <span className="text-xl text-accent-signature mr-1">{businessProfile?.currencySymbol || '₹'}</span>
                 {metrics.total.toLocaleString()}
               </div>
               <div className="mt-4 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-accent-signature px-3 py-1 bg-white/5 rounded-full border border-white/10 uppercase tracking-widest">{metrics.count} Orders Linked</span>
               </div>
             </div>

             <div className="p-6 bg-white rounded-[2.5rem] border border-black/5 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-black/5 pb-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Average Transaction</span>
                  <span className="text-sm font-black text-ink-primary tracking-tight">{businessProfile?.currencySymbol || '₹'}{Math.round(metrics.avg).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Latest Fulfillment</span>
                  <span className="text-sm font-black text-ink-primary tracking-tight">
                    {metrics.last ? new Date(metrics.last).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'N/A'}
                  </span>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column: Detailed Purchase History */}
        <div className="lg:col-span-8 space-y-6 flex flex-col min-h-[600px]">
          <div className="glass-panel !p-0 rounded-[3rem] shadow-premium overflow-hidden flex flex-col flex-1 border border-black/5">
            {/* Table Header Utility Bar */}
            <div className="p-6 border-b border-black/5 bg-white/50 backdrop-blur-sm flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative group flex-1 md:w-64">
                  <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-primary opacity-30 group-focus-within:opacity-100 transition-opacity" />
                  <input 
                    type="text" 
                    placeholder="Search by order ID or notes..." 
                    className="w-full h-11 pl-12 pr-5 rounded-pill bg-canvas border border-black/5 text-[11px] font-bold outline-none focus:border-ink-primary transition-all shadow-inner uppercase tracking-wider"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <span className="px-3 py-2 bg-canvas border border-black/5 rounded-pill flex items-center gap-2">
                  <History size={12} className="text-accent-signature" />
                  {filteredPurchases.length} Log Entries
                </span>
              </div>
            </div>

            {/* Procurement Ledger Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas/50 sticky top-0 z-10 border-b border-black/5">
                  <tr>
                    <th className="py-4 px-8 text-[9px] font-black text-gray-400 uppercase tracking-widest">Order Identifier</th>
                    <th className="py-4 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest">Placement Date</th>
                    <th className="py-4 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Fulfillment Value</th>
                    <th className="py-4 px-8 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Linked Item</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-24 text-center">
                        <div className="opacity-10 mb-4 flex justify-center"><Box size={64} /></div>
                        <h4 className="text-2xl font-bold text-ink-primary mb-1 uppercase">NO ACTIVITY.</h4>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">This partner has no recorded procurement operations.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((p, idx) => (
                      <tr key={p.id} className="group hover:bg-canvas/40 transition-all duration-300">
                        <td className="py-6 px-8">
                           <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-ink-primary flex items-center justify-center text-accent-signature shadow-premium">
                               <CreditCard size={18} />
                             </div>
                             <div>
                               <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight leading-none mb-1">
                                 {p.id.split('-')[1]?.substring(0,8).toUpperCase() || p.id.substring(0,8).toUpperCase()}
                               </div>
                               <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{p.payment_type || 'POST-PAID'}</div>
                             </div>
                           </div>
                        </td>
                        <td className="py-6 px-6">
                           <div className="text-[11px] font-bold text-ink-primary uppercase tracking-tight mb-0.5">
                             {new Date(p.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric'})}
                           </div>
                           <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Clock size={10} /> Synced Global</div>
                        </td>
                        <td className="py-6 px-6 text-right">
                           <div className="text-lg font-black tabular-nums text-ink-primary tracking-tight leading-none mb-1">
                             {businessProfile?.currencySymbol || '₹'}{(p.total_cost || 0).toLocaleString()}
                           </div>
                           <div className="text-[9px] font-black text-accent-signature uppercase tracking-widest">Total Liability Clear</div>
                        </td>
                        <td className="py-6 px-8 text-right">
                           <div className="inline-flex flex-col items-end">
                              <span className="text-[11px] font-bold text-ink-primary uppercase tracking-tight leading-none mb-1">
                                {products.find(prod => prod.id === p.linked_product_id)?.name || 'Generic Supply'}
                              </span>
                              <span className="px-2 py-0.5 bg-canvas rounded text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                Qty: {p.quantity} Units
                              </span>
                           </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Sticky Summary Bar */}
            <div className="bg-ink-primary p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-accent-signature/10 to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-bold text-accent-signature uppercase tracking-widest mb-1.5 flex items-center gap-2">
                        <TrendingUp size={14} /> Cumulative Procurement Value
                    </p>
                    <div className="text-white text-3xl font-black tabular-nums tracking-tight leading-none">
                        <span className="text-accent-signature opacity-50 mr-2">{businessProfile?.currencySymbol || '₹'}</span>
                        {metrics.total.toLocaleString()}
                    </div>
                </div>

                <div className="flex items-center gap-4 relative z-10 w-full md:w-auto">
                    <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/10 flex flex-col items-center flex-1 md:flex-none">
                        <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Inventory Inflows</span>
                        <span className="text-xl font-black text-white">{metrics.count}</span>
                    </div>
                    <div className="hidden md:block w-px h-12 bg-white/10 mx-2"></div>
                    <div className="text-right flex flex-col justify-center">
                        <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Average Flow Rate</span>
                        <span className="text-xl font-black text-accent-signature tabular-nums">
                            {businessProfile?.currencySymbol || '₹'}{Math.round(metrics.avg).toLocaleString()}
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
