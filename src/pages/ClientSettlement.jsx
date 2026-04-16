import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { 
  ArrowLeft, User, DollarSign, Calendar, FileText, 
  Check, Save, Search, AlertCircle, TrendingUp, CreditCard, Clock,
  ChevronRight, Building2, Phone, MapPin, Receipt, CheckCircle2
} from 'lucide-react';

const ClientSettlement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients, invoices, recordClientPayment, businessProfile, loading } = useAppContext();

  // 1. Find Client Data
  const client = useMemo(() => 
    (clients || []).find(c => String(c.id) === String(id)), 
    [clients, id]
  );

  // 2. Local State
  const [paymentData, setPaymentData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    paymentMethod: 'CASH'
  });
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [paymentError, setPaymentError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 3. Filtered Invoices
  const clientInvoices = useMemo(() => {
    if (!client) return [];
    return (invoices || [])
      .filter(inv => inv.client_id === client.id && inv.payment_status !== 'PAID')
      .filter(inv => 
        inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(inv.grand_total).includes(searchTerm)
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [client, invoices, searchTerm]);

  // 4. Toggle Selection
  const toggleInvoiceSelection = (inv) => {
    const isSelected = selectedInvoiceIds.includes(inv.id);
    let newSelection;
    let newAmount = parseFloat(paymentData.amount) || 0;

    if (isSelected) {
      newSelection = selectedInvoiceIds.filter(id => id !== inv.id);
      newAmount = Math.max(0, newAmount - inv.grand_total);
    } else {
      newSelection = [...selectedInvoiceIds, inv.id];
      newAmount = newAmount + inv.grand_total;
    }

    setSelectedInvoiceIds(newSelection);
    setPaymentData({ ...paymentData, amount: newAmount.toString() });
  };

  // 5. Select All
  const toggleSelectAll = () => {
    if (selectedInvoiceIds.length === clientInvoices.length) {
      setSelectedInvoiceIds([]);
      setPaymentData({ ...paymentData, amount: '0' });
    } else {
      const allIds = clientInvoices.map(i => i.id);
      const total = clientInvoices.reduce((sum, i) => sum + i.grand_total, 0);
      setSelectedInvoiceIds(allIds);
      setPaymentData({ ...paymentData, amount: total.toString() });
    }
  };

  // 6. Submit Payment
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!client) return;
    
    setPaymentError('');
    const amountNum = parseFloat(paymentData.amount);
    
    if (isNaN(amountNum) || amountNum <= 0) {
      setPaymentError('Please enter a valid payment amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await recordClientPayment(
        client.id,
        amountNum,
        paymentData.date,
        paymentData.notes,
        selectedInvoiceIds
      );

      if (res?.success === false) {
        setPaymentError(res.error);
      } else {
        // Success: Redirect with a small delay for the notification to be seen
        setTimeout(() => {
          navigate('/clients');
        }, 800);
      }
    } catch (err) {
      setPaymentError('System synchronization failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;
  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in text-center p-12">
        <div className="glass-panel !py-12 px-8 max-w-sm rounded-[3rem] border-dashed border-2">
            <AlertCircle size={64} className="mx-auto mb-6 text-red-500 opacity-20" />
            <h2 className="text-3xl font-semibold mb-2">Record Not Found.</h2>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-6">The client ID provided is missing or deleted.</p>
            <button onClick={() => navigate('/clients')} className="btn-signature !px-10 !h-14 !rounded-pill">BACK TO DIRECTORY</button>
        </div>
      </div>
    );
  }

  const selectedTotal = clientInvoices
    .filter(i => selectedInvoiceIds.includes(i.id))
    .reduce((sum, i) => sum + i.grand_total, 0);

  return (
    <div className="animate-fade-in pb-12">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 mt-2">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/clients')}
            className="w-14 h-14 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary group shadow-sm bg-white"
            title="Back to Directory"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-3 text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
              <span className="hover:text-ink-primary cursor-pointer transition-colors" onClick={() => navigate('/clients')}>Directory</span>
              <ChevronRight size={10} className="opacity-30" />
              <span className="text-accent-signature">Settlement Dashboard</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black font-sora text-ink-primary leading-none tracking-tighter mb-0 uppercase">SETTLE<span className="text-accent-signature">.</span></h1>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-3 px-6 py-3 bg-white border border-black/5 rounded-2xl shadow-sm">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Secure Payment Workspace</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar: Client & Entry Form */}
        <div className="lg:col-span-4 space-y-6">
          {/* Client Profile Card */}
          <div className="glass-panel !p-8 rounded-[3rem] shadow-premium overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            
            <div className="flex items-center gap-5 mb-8 relative z-10">
              <div className="w-16 h-16 rounded-full bg-accent-signature/20 border border-accent-signature/30 flex items-center justify-center text-ink-primary text-2xl font-black">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-ink-primary leading-tight lowercase first-letter:uppercase">{client.name}</h3>
                <p className="text-[9px] font-bold text-gray-400 font-mono tracking-wider">#{client.id?.split('-')[0] || 'N/A'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-canvas p-4 rounded-2xl border border-black/5">
                <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1">Outstanding</p>
                <div className="text-2xl font-black text-red-500 tabular-nums">
                  {businessProfile?.currencySymbol || '₹'}{Math.round(client.outstanding_balance || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-canvas p-4 rounded-2xl border border-black/5">
                <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1">Unpaid Bills</p>
                <div className="text-2xl font-black text-ink-primary tabular-nums">
                  {(clientInvoices || []).length}
                </div>
              </div>
            </div>

            <div className="space-y-3 opacity-70">
              <div className="flex items-center gap-3 text-xs font-semibold text-gray-600">
                <Phone size={14} className="opacity-40" /> {client.phone || 'N/A'}
              </div>
              <div className="flex items-start gap-3 text-xs font-semibold text-gray-600">
                <MapPin size={14} className="opacity-40 mt-0.5" /> {client.address || 'No Address'}
              </div>
            </div>
          </div>

          {/* Payment Entry Form */}
          <div className="glass-panel !p-8 rounded-[3rem] shadow-premium">
            <h4 className="text-xs font-black text-ink-primary tracking-widest uppercase mb-6 flex items-center gap-2">
              <Receipt size={16} /> RECORD RECEIPT
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              {paymentError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
                  <AlertCircle size={18} className="text-red-500 shrink-0" />
                  <p className="text-[11px] font-semibold text-red-600 leading-relaxed">{paymentError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="relative group">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Payment Date</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-primary opacity-30 group-focus-within:opacity-100 transition-opacity" />
                    <input 
                      required
                      type="date" 
                      className="w-full bg-canvas border border-black/5 rounded-2xl pl-14 pr-5 py-4 font-bold text-sm text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all cursor-pointer"
                      value={paymentData.date}
                      onChange={e => setPaymentData({...paymentData, date: e.target.value})}
                    />
                  </div>
                </div>

                <div className="relative group">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Credit Settlement (Amount)</label>
                  <div className="relative">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-ink-primary opacity-30">{businessProfile?.currencySymbol || '₹'}</div>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      placeholder="0.00"
                      className="w-full bg-canvas border border-black/5 rounded-2xl pl-14 pr-5 py-5 font-black text-3xl text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all font-mono tabular-nums"
                      value={paymentData.amount}
                      onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
                    />
                  </div>
                  {selectedTotal > 0 && (
                      <div className="mt-2 ml-1 px-3 py-1.5 bg-accent-signature/10 rounded-lg inline-flex items-center gap-2 border border-accent-signature/20">
                          <CheckCircle2 size={12} className="text-ink-primary" />
                          <span className="text-[10px] font-bold text-ink-primary">Invoices match: {businessProfile?.currencySymbol}{selectedTotal.toLocaleString()}</span>
                      </div>
                  )}
                </div>

                <div className="relative group">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Transaction Notes</label>
                  <textarea 
                    className="w-full bg-canvas border border-black/5 rounded-2xl p-5 font-semibold text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/10 transition-all resize-none h-24"
                    placeholder="CHEQUE NO, REF ID, BANK DETAILS..."
                    value={paymentData.notes}
                    onChange={e => setPaymentData({...paymentData, notes: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full btn-signature !h-16 !text-sm !font-black flex items-center justify-center gap-4 !rounded-2xl group active:scale-95 transition-transform"
              >
                {isSubmitting ? 'SYNCHRONIZING...' : 'FINALIZE SETTLEMENT'}
                <div className="w-10 h-10 rounded-full bg-ink-primary shadow-lg flex items-center justify-center scale-90">
                  <Save size={18} className="text-accent-signature" />
                </div>
              </button>
            </form>
          </div>
        </div>

        {/* Right Content: Invoices Workspace */}
        <div className="lg:col-span-8 flex flex-col h-full min-h-[600px]">
          <div className="glass-panel !p-0 rounded-[3rem] shadow-premium overflow-hidden flex flex-col flex-1 border border-black/5">
            {/* Table Header / Utility Bar */}
            <div className="p-6 border-b border-black/5 bg-white/50 backdrop-blur-sm flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative group flex-1 md:w-64">
                  <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-primary opacity-30" />
                  <input 
                    type="text" 
                    placeholder="Search invoices..." 
                    className="w-full h-11 pl-12 pr-5 rounded-pill bg-canvas border border-black/5 text-[11px] font-bold outline-none focus:border-ink-primary transition-all shadow-inner"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={toggleSelectAll}
                  className="px-5 h-11 rounded-pill bg-ink-primary text-white text-[10px] font-bold tracking-widest whitespace-nowrap hover:bg-ink-primary/90 transition-all shrink-0 uppercase"
                >
                  {selectedInvoiceIds.length === clientInvoices.length ? 'DESELECT ALL' : 'SELECT ALL'}
                </button>
              </div>
              
              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <span className="px-3 py-2 bg-canvas border border-black/5 rounded-pill">
                  {selectedInvoiceIds.length} Selected
                </span>
                <span className="px-3 py-2 bg-canvas border border-black/5 rounded-pill">
                  Total Exposure: <span className="text-red-500">{businessProfile?.currencySymbol || '₹'}{Math.round(clientInvoices.reduce((s,i) => s + i.grand_total, 0)).toLocaleString()}</span>
                </span>
              </div>
            </div>

            {/* Invoices List */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas/50 sticky top-0 z-10 border-b border-black/5">
                  <tr>
                    <th className="py-4 px-8 text-[9px] font-black text-gray-400 uppercase tracking-widest w-12">#</th>
                    <th className="py-4 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest">Invoice Unit</th>
                    <th className="py-4 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest">Issuance Date</th>
                    <th className="py-4 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Liability</th>
                    <th className="py-4 px-8 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Selection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {clientInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-24 text-center">
                        <div className="opacity-10 mb-4 flex justify-center"><FileText size={64} /></div>
                        <h4 className="text-2xl font-bold text-ink-primary mb-1">Clean Slate.</h4>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">This customer has no outstanding liabilities.</p>
                      </td>
                    </tr>
                  ) : (
                    clientInvoices.map((inv, idx) => {
                      const isSelected = selectedInvoiceIds.includes(inv.id);
                      return (
                        <tr 
                          key={inv.id} 
                          onClick={() => toggleInvoiceSelection(inv)}
                          className={`group cursor-pointer transition-all duration-300 ${isSelected ? 'bg-accent-signature/5 active' : 'hover:bg-canvas/50'}`}
                        >
                          <td className="py-6 px-8 text-[11px] font-bold text-gray-400 font-mono tracking-tight">{idx + 1}</td>
                          <td className="py-6 px-6">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-ink-primary text-accent-signature' : 'bg-canvas border border-black/5 text-gray-400'}`}>
                                <Receipt size={18} />
                              </div>
                              <div>
                                <div className="text-[13px] font-black text-ink-primary uppercase tracking-tight leading-none mb-1">
                                  #{inv.invoice_number}
                                </div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider h-auto">Professional Invoice</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-6 px-6">
                            <div className="text-[11px] font-bold text-ink-primary uppercase tracking-tight mb-0.5">
                              {new Date(inv.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric'})}
                            </div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td className="py-6 px-6 text-right">
                            <div className={`text-lg font-black tabular-nums transition-all ${isSelected ? 'text-ink-primary' : 'text-gray-700'}`}>
                              {businessProfile?.currencySymbol || '₹'}{Math.round(inv.grand_total).toLocaleString()}
                            </div>
                            <div className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Unpaid Liability</div>
                          </td>
                          <td className="py-6 px-8 text-right">
                            <div className={`w-8 h-8 ml-auto rounded-full border-2 flex items-center justify-center transition-all duration-500 ${isSelected ? 'bg-accent-signature border-accent-signature scale-110 shadow-lg shadow-accent-signature/20' : 'border-black/5 bg-white group-hover:border-black/20'}`}>
                              {isSelected && <Check size={16} className="text-ink-primary stroke-[4px]" />}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Sticky Table Footer: Summary Bar */}
            <div className="bg-ink-primary p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-accent-signature/10 to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-bold text-accent-signature uppercase tracking-widest mb-1.5 flex items-center gap-2">
                        <TrendingUp size={14} /> Settlement Summary
                    </p>
                    <div className="text-white text-3xl font-black tabular-nums tracking-tight leading-none">
                        <span className="text-accent-signature opacity-50 mr-2">{businessProfile?.currencySymbol || '₹'}</span>
                        {selectedTotal.toLocaleString()}
                    </div>
                </div>

                <div className="flex items-center gap-4 relative z-10 w-full md:w-auto">
                    <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/10 flex flex-col items-center flex-1 md:flex-none">
                        <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Total Invoices</span>
                        <span className="text-xl font-black text-white">{selectedInvoiceIds.length}</span>
                    </div>
                    <div className="hidden md:block w-px h-12 bg-white/10 mx-2"></div>
                    <div className="text-right flex flex-col justify-center">
                        <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Remaining Liability</span>
                        <span className="text-xl font-black text-accent-signature tabular-nums">
                            {businessProfile?.currencySymbol || '₹'}{(client.outstanding_balance - selectedTotal).toLocaleString()}
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

export default ClientSettlement;
