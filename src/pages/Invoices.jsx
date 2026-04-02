/**
 * ⚠️ STRICT VISUAL LOCK: GILDED GLASS INVOICE MANAGEMENT
 * ---------------------------------------------------------
 * This module is the central hub for GST-compliant billing.
 * Features: Lifecycle Tracking, Live GST Engine, & Share Hub.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, Plus, Search, Filter, TrendingUp, 
  CheckCircle, Clock, AlertTriangle, MoreVertical,
  Printer, Share2, Eye, Edit3, Trash2, Copy, X,
  ArrowRight, Download, Mail, Zap
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatINR, calculateGST, shareToWhatsApp } from '../lib/gstEngine';
import InvoiceTemplate from '../components/invoice/InvoiceTemplate';
import ReportTable from '../components/reports/ReportTable';

const Invoices = () => {
  const { 
    invoices = [], clients = [], products = [], businessProfile,
    hasPermission, isViewOnly, createInvoice, markInvoicePaid 
  } = useAppContext();

  // Mode & Selection State
  const [showCreator, setShowCreator] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Creator State
  const [draft, setDraft] = useState({
    clientId: '',
    items: [],
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    notes: '',
    terms: businessProfile?.invoice_terms || '',
    paymentMethod: 'Cash'
  });

  // Calculate stats
  const stats = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + inv.grand_total, 0);
    const paid = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
    const pending = total - paid;
    const overdue = invoices.filter(inv => 
      inv.payment_status === 'UNPAID' && new Date(inv.due_date) < new Date()
    ).reduce((sum, inv) => sum + inv.grand_total, 0);

    return { total, paid, pending, overdue };
  }, [invoices]);

  // Filtered List
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const client = clients.find(c => c.id === inv.client_id);
      const matchesSearch = 
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client?.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || inv.payment_status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [invoices, searchTerm, statusFilter, clients]);

  const handleCreateInvoice = async () => {
    if (!draft.clientId || draft.items.length === 0) return;
    
    const client = clients.find(c => c.id === draft.clientId);
    const gstData = calculateGST(draft.items, businessProfile.state, client.state);
    
    const newInvoice = {
      ...draft,
      client_id: draft.clientId,
      client_name: client.name,
      items: gstData.items,
      subtotal: gstData.subtotal,
      discount_total: gstData.discount,
      tax_total: gstData.totalTax,
      cgst_amount: gstData.cgst,
      sgst_amount: gstData.sgst,
      igst_amount: gstData.igst,
      grand_total: gstData.grandTotal,
      round_off: gstData.roundOff,
      amount_in_words: gstData.amountInWords,
      is_interstate: gstData.isInterstate,
      invoice_date: draft.date,
      due_date: draft.dueDate,
      payment_status: 'UNPAID'
    };

    await createInvoice(newInvoice);
    setShowCreator(false);
    setDraft({
      clientId: '',
      items: [],
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      notes: '',
      terms: businessProfile?.invoice_terms || '',
      paymentMethod: 'Cash'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      PAID: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      UNPAID: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      PARTIAL: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      OVERDUE: 'bg-rose-600 text-white border-rose-700'
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-tighter ${styles[status] || styles.UNPAID}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in">
      {/* Header & Stats */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-2">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-ink-primary text-accent-signature flex items-center justify-center shadow-premium">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-black font-sora text-ink-primary leading-[0.85] tracking-tighter uppercase">Invoices<span className="text-accent-signature">.</span></h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 italic">GST Billing Node</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowCreator(true)}
            className="btn-signature h-14 !rounded-2xl px-8 flex items-center gap-3 uppercase font-black tracking-widest text-[10px]"
          >
            <Plus size={18} /> New Invoice
            <div className="icon-nest !bg-white/20 !w-8 !h-8"><Zap size={14} /></div>
          </button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Billed', value: stats.total, icon: <TrendingUp size={16} />, color: 'text-ink-primary' },
          { label: 'Collected', value: stats.paid, icon: <CheckCircle size={16} />, color: 'text-emerald-500' },
          { label: 'Outstanding', value: stats.pending, icon: <Clock size={16} />, color: 'text-amber-500' },
          { label: 'Overdue', value: stats.overdue, icon: <AlertTriangle size={16} />, color: 'text-rose-500' }
        ].map((s, i) => (
          <div key={i} className="glass-panel !p-6 border-none shadow-glass hover:shadow-premium transition-all group overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-ink-primary/[0.02] rounded-full group-hover:scale-150 transition-transform duration-700"></div>
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl bg-canvas ${s.color} shadow-sm border border-black/5`}>{s.icon}</div>
              <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest italic leading-none">Fiscal View</div>
            </div>
            <div className="text-2xl font-black text-ink-primary tracking-tighter mb-1">{formatINR(s.value)}</div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Main Table Container */}
      <div className="glass-panel !p-0 border-none shadow-glass overflow-hidden">
        {/* Table Header / Filters */}
        <div className="p-6 border-b border-black/5 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/40">
          <div className="relative group w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-accent-signature transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Search by Invoice # or Client Name..."
              className="w-full bg-white/50 border border-black/5 rounded-2xl py-3 pl-12 pr-4 text-xs font-bold focus:ring-4 focus:ring-accent-signature/10 transition-all outline-none italic"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
            {['ALL', 'PAID', 'UNPAID', 'PARTIAL', 'OVERDUE'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-full text-[9px] font-black tracking-widest transition-all border ${
                  statusFilter === status 
                    ? 'bg-ink-primary text-white border-ink-primary shadow-lg scale-105' 
                    : 'bg-white text-gray-400 border-black/5 hover:border-black/20'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Invoice List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas/50 text-[10px] font-black uppercase text-gray-500 tracking-[0.1em] border-b border-black/5">
                <th className="py-5 px-6 italic">Invoice Details</th>
                <th className="py-5 px-6 italic">Client Node</th>
                <th className="py-5 px-6 italic text-right">Taxable</th>
                <th className="py-5 px-6 italic text-right">Grand Total</th>
                <th className="py-5 px-6 italic">Status</th>
                <th className="py-5 px-6 italic text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => {
                const client = clients.find(c => c.id === inv.client_id);
                return (
                  <tr key={inv.id} className="group hover:bg-white transition-all cursor-default border-b border-black/5 last:border-0">
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-ink-primary leading-none mb-1 group-hover:text-accent-signature transition-colors">#{inv.invoice_number}</span>
                        <span className="text-[10px] font-bold text-gray-400">{new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-canvas border border-black/5 flex items-center justify-center text-[10px] font-black text-ink-primary">
                          {client?.name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-black text-ink-primary leading-none mb-1">{client?.name}</span>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">{client?.gst_no || 'Unregistered'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="text-xs font-bold text-gray-500 font-mono">{formatINR(inv.taxable_amount)}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="text-[15px] font-black text-ink-primary font-mono tracking-tighter">{formatINR(inv.grand_total)}</span>
                    </td>
                    <td className="py-4 px-6">
                      {getStatusBadge(inv.payment_status)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setViewingInvoice(inv)}
                          className="p-2 rounded-lg bg-canvas text-ink-primary hover:bg-ink-primary hover:text-white transition-all shadow-sm border border-black/5"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          disabled={isViewOnly()}
                          className="p-2 rounded-lg bg-canvas text-ink-primary hover:bg-ink-primary hover:text-white transition-all shadow-sm border border-black/5"
                        >
                          <Printer size={14} />
                        </button>
                        <button 
                          onClick={() => {
                            const client = clients.find(c => c.id === inv.client_id);
                            shareToWhatsApp(inv, client, businessProfile);
                          }}
                          className="p-2 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all shadow-sm border border-[#25D366]/20"
                        >
                          <Share2 size={14} />
                        </button>
                       {inv.payment_status !== 'PAID' && (
                         <button 
                           onClick={() => markInvoicePaid(inv.id)}
                           className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all shadow-sm border border-emerald-500/20"
                         >
                           <Zap size={14} />
                         </button>
                       )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-24 text-center opacity-20">
                    <div className="flex flex-col items-center gap-4">
                      <FileText size={64} strokeWidth={1} />
                      <p className="text-xs font-black uppercase tracking-widest italic">No matching transaction records discovered</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail View Overlay */}
      {viewingInvoice && (
        <InvoiceTemplate 
          invoice={viewingInvoice}
          businessProfile={businessProfile}
          client={clients.find(c => c.id === viewingInvoice.client_id) || { name: viewingInvoice.client_name || 'Walk-in Customer', address: '---', contact: '---', state: '' }}
          onPrint={() => window.print()}
          onShare={(type) => {
             if (type === 'whatsapp') {
               const client = clients.find(c => c.id === viewingInvoice.client_id) || { name: viewingInvoice.client_name || 'Walk-in Customer', contact: '' };
               shareToWhatsApp(viewingInvoice, client, businessProfile);
             }
          }}
          onClose={() => setViewingInvoice(null)}
        />
      )}

      {/* Creator Modal Placeholder (Step 6 implementation continues) */}
      {showCreator && (
        <div className="modal-overlay">
          <div className="glass-modal max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
             <div className="p-8 border-b border-black/5 bg-white/40 flex justify-between items-center">
               <div>
                 <h2 className="text-4xl font-black font-sora text-ink-primary tracking-tighter uppercase">Generate Billing Node.</h2>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Terminal-Safe Transaction Creation</p>
               </div>
               <button onClick={() => setShowCreator(false)} className="w-12 h-12 rounded-2xl bg-canvas border border-black/5 flex items-center justify-center text-ink-primary hover:bg-rose-50 hover:text-rose-500 transition-all">
                 <X size={20} />
               </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 bg-canvas/30">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                 {/* Client Selection */}
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">Client Node Identification</label>
                    <select 
                      className="w-full bg-white border border-black/5 rounded-2xl p-4 text-xs font-bold text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all appearance-none"
                      value={draft.clientId}
                      onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
                    >
                      <option value="">SELECT TARGET CLIENT...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name.toUpperCase()} ({c.gst_no || 'URD'})</option>)}
                    </select>
                 </div>
                 
                 {/* Dates */}
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">Emission Date</label>
                      <input 
                        type="date"
                        className="w-full bg-white border border-black/5 rounded-2xl p-4 text-xs font-bold text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all"
                        value={draft.date}
                        onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                      />
                   </div>
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic">Maturity Date</label>
                      <input 
                        type="date"
                        className="w-full bg-white border border-black/5 rounded-2xl p-4 text-xs font-bold text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all"
                        value={draft.dueDate}
                        onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                      />
                   </div>
                 </div>
               </div>

               {/* Item Entry Section - Integrated Placeholder */}
               <div className="space-y-4 mb-8">
                 <div className="flex justify-between items-end">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic underline decoration-accent-signature underline-offset-4 decoration-2">Line Item Specification</label>
                    <button 
                      onClick={() => setDraft({ ...draft, items: [...draft.items, { productId: '', name: '', qty: 1, rate: 0, taxRate: 18, hsn: '' }] })}
                      className="flex items-center gap-2 text-[10px] font-black text-ink-primary bg-accent-signature px-4 py-2 rounded-full hover:scale-105 transition-all shadow-sm uppercase tracking-widest"
                    >
                      <Plus size={14} /> Add Sector
                    </button>
                 </div>
                 
                 <div className="space-y-3">
                   {draft.items.map((item, index) => (
                     <div key={index} className="glass-panel !p-4 border-none shadow-sm flex flex-col md:flex-row gap-4 items-end animate-in slide-in-from-right-4 duration-300">
                        <div className="flex-1 space-y-2 w-full">
                          <span className="text-[8px] font-black text-gray-400 uppercase">Product Identification</span>
                          <select 
                            className="w-full bg-canvas border-none rounded-xl p-3 text-xs font-bold text-ink-primary outline-none"
                            value={item.productId}
                            onChange={(e) => {
                              const p = products.find(prod => prod.id === e.target.value);
                              const newItems = [...draft.items];
                              newItems[index] = { 
                                ...item, 
                                productId: p.id, 
                                name: p.name, 
                                rate: p.sellingPrice, 
                                taxRate: p.tax_rate || 18,
                                hsn: p.hsn_code || ''
                              };
                              setDraft({ ...draft, items: newItems });
                            }}
                          >
                            <option value="">SELECT SEGMENT...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>)}
                          </select>
                        </div>
                        <div className="w-24 space-y-2">
                           <span className="text-[8px] font-black text-gray-400 uppercase">HSN</span>
                           <input type="text" className="w-full bg-canvas border-none rounded-xl p-3 text-xs font-black text-center" value={item.hsn} readOnly />
                        </div>
                        <div className="w-24 space-y-2">
                           <span className="text-[8px] font-black text-gray-400 uppercase">Volume</span>
                           <input 
                             type="number" 
                             className="w-full bg-canvas border-none rounded-xl p-3 text-xs font-black text-center" 
                             value={item.qty}
                             onChange={(e) => {
                               const newItems = [...draft.items];
                               newItems[index].qty = e.target.value;
                               setDraft({ ...draft, items: newItems });
                             }}
                           />
                        </div>
                        <div className="w-28 space-y-2">
                           <span className="text-[8px] font-black text-gray-400 uppercase">Rate</span>
                           <input 
                             type="number" 
                             className="w-full bg-canvas border-none rounded-xl p-3 text-xs font-black text-right" 
                             value={item.rate}
                             onChange={(e) => {
                               const newItems = [...draft.items];
                               newItems[index].rate = e.target.value;
                               setDraft({ ...draft, items: newItems });
                             }}
                           />
                        </div>
                        <button 
                          onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                          className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={16} />
                        </button>
                     </div>
                   ))}
                 </div>
               </div>
             </div>

             <div className="p-8 border-t border-black/5 bg-white/40 flex justify-end gap-4 shadow-top">
               <button 
                 onClick={() => setShowCreator(false)}
                 className="px-8 py-4 rounded-2xl font-black text-[10px] text-gray-500 hover:bg-canvas transition-all uppercase tracking-widest border border-black/5"
               >
                 Abort Session
               </button>
               <button 
                 onClick={handleCreateInvoice}
                 className="btn-signature px-10 h-14 !rounded-2xl flex items-center gap-4 uppercase font-black tracking-widest text-[10px]"
                 disabled={!draft.clientId || draft.items.length === 0}
               >
                 Finalize & Commit
                 <div className="icon-nest !bg-white/20 !w-8 !h-8"><CheckCircle size={16} /></div>
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
