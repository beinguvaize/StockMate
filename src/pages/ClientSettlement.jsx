import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePeople } from '../hooks/usePeople';
import { useSales } from '../hooks/useSales';
import { 
  ArrowLeft, User, DollarSign, Calendar, FileText, 
  Check, Save, Search, AlertCircle, TrendingUp, CreditCard, Clock,
  ChevronRight, Building2, Phone, MapPin, Receipt, CheckCircle2, ShieldCheck
} from 'lucide-react';
import { todayISOInAppTZ } from '../lib/utils';

const ClientSettlement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { clients, recordClientPayment, loading: peoLoading } = usePeople(currentTenantId);
  const { invoices, loading: salesLoading } = useSales(currentTenantId);

  const loading = peoLoading || salesLoading;

  // 1. Find Client Data
  const client = useMemo(() => 
    (clients || []).find(c => String(c.id) === String(id)), 
    [clients, id]
  );

  // 2. Local State
  const [paymentData, setPaymentData] = useState({
    amount: '',
    date: todayISOInAppTZ(),
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
        setTimeout(() => {
          navigate(`/${businessProfile.slug}/clients`);
        }, 800);
      }
    } catch (err) {
      setPaymentError('System synchronization failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-accent-signature/30 border-t-accent-signature rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in text-center p-12">
        <div className="glass-panel !py-12 px-8 max-w-sm rounded-[3rem] border-dashed border-2">
            <AlertCircle size={64} className="mx-auto mb-6 text-red-500 opacity-20" />
            <h2 className="text-3xl font-semibold mb-2">Record Not Found.</h2>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-6">The client ID provided is missing or deleted.</p>
            <button onClick={() => navigate(-1)} className="btn-signature !px-10 !h-14 !rounded-pill">BACK TO DIRECTORY</button>
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
            onClick={() => navigate(-1)}
            className="w-14 h-14 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary group shadow-sm bg-white"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-3 text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
              Directory Access Vector
              <ChevronRight size={10} className="opacity-30" />
              <span className="text-accent-signature">Settlement Dashboard</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-0 uppercase">SETTLE<span className="text-accent-signature">.</span></h1>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-3 px-6 py-3 bg-white/60 border border-black/5 rounded-2xl shadow-premium">
          <ShieldCheck size={16} className="text-accent-signature" />
          <span className="text-[10px] font-black text-ink-primary uppercase tracking-widest leading-none">Secure Transaction Node</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar: Client & Entry Form */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel !p-8 rounded-[2.5rem] shadow-premium relative overflow-hidden bg-white/40">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-signature/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            
            <div className="flex items-center gap-5 mb-8 relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-ink-primary flex items-center justify-center text-accent-signature text-2xl font-black shadow-lg">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-2xl font-black text-ink-primary leading-tight tracking-tight uppercase">{client.name}</h3>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Client Identifier Vector</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-canvas p-4 rounded-2xl border border-black/5 flex flex-col justify-center">
                <p className="text-[8px] font-black tracking-widest text-gray-400 uppercase mb-1.5">Net Liability</p>
                <div className="text-2xl font-black text-red-500 tabular-nums leading-none">
                  {businessProfile?.currencySymbol}{Math.round(client.outstanding_balance || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-canvas p-4 rounded-2xl border border-black/5 flex flex-col justify-center">
                <p className="text-[8px] font-black tracking-widest text-gray-400 uppercase mb-1.5">Unpaid Nodes</p>
                <div className="text-2xl font-black text-ink-primary tabular-nums leading-none">
                  {(clientInvoices || []).length}
                </div>
              </div>
            </div>

            <div className="space-y-3 opacity-60">
              <div className="flex items-center gap-3 text-xs font-black text-ink-primary uppercase tracking-tight">
                <Phone size={14} className="text-accent-signature" /> {client.phone || 'N/A'}
              </div>
              <div className="flex items-start gap-3 text-xs font-black text-ink-primary uppercase tracking-tight">
                <MapPin size={14} className="text-accent-signature mt-0.5" /> {client.address || 'No Address Data'}
              </div>
            </div>
          </div>

          <div className="glass-panel !p-8 rounded-[2.5rem] shadow-premium bg-ink-primary border-white/5 relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-signature/10 to-transparent opacity-50 pointer-events-none"></div>
            <h4 className="text-[10px] font-black text-accent-signature tracking-widest uppercase mb-8 flex items-center gap-3 relative z-10 italic">
              <Receipt size={16} /> RECORD RECEIPT MATRIX
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              {paymentError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
                  <AlertCircle size={18} className="text-red-500 shrink-0" />
                  <p className="text-[10px] font-black text-red-500 leading-relaxed uppercase">{paymentError}</p>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-[8px] font-black text-white/40 uppercase tracking-widest mb-3 ml-1">Selection Logic Date</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-accent-signature" />
                    <input 
                      required
                      type="date" 
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-14 pr-5 py-4 font-black text-sm text-white outline-none focus:bg-white/10 transition-all cursor-pointer"
                      value={paymentData.date}
                      onChange={e => setPaymentData({...paymentData, date: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-black text-white/40 uppercase tracking-widest mb-3 ml-1">Capital Settlement Unit</label>
                  <div className="relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-accent-signature opacity-50">{businessProfile?.currencySymbol}</div>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-16 pr-5 py-6 font-black text-4xl text-white outline-none focus:bg-white/10 transition-all font-mono tabular-nums tracking-tighter"
                      value={paymentData.amount}
                      onChange={e => setPaymentData({...paymentData, amount: e.target.value})}
                    />
                  </div>
                  {selectedTotal > 0 && (
                      <div className="mt-3 ml-1 px-4 py-2 bg-accent-signature/20 rounded-xl inline-flex items-center gap-3 border border-accent-signature/30">
                          <CheckCircle2 size={12} className="text-accent-signature" />
                          <span className="text-[9px] font-black text-accent-signature uppercase tracking-widest">Matched: {businessProfile?.currencySymbol}{selectedTotal.toLocaleString()}</span>
                      </div>
                  )}
                </div>

                <div>
                  <label className="block text-[8px] font-black text-white/40 uppercase tracking-widest mb-3 ml-1">Audit Trail Footprint</label>
                  <textarea 
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 font-black text-[10px] text-white outline-none focus:bg-white/10 transition-all resize-none h-24 placeholder:text-white/20 uppercase tracking-widest"
                    placeholder="CHEQUE NO, REF ID, BANK DATA..."
                    value={paymentData.notes}
                    onChange={e => setPaymentData({...paymentData, notes: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting || !hasPermission('clients', 'edit')}
                className="w-full btn-signature !h-20 !text-[11px] !font-black flex items-center justify-center gap-4 !rounded-2xl group active:scale-95 transition-transform disabled:opacity-50"
              >
                {isSubmitting ? 'SYNCHRONIZING...' : 'FINALIZE SETTLEMENT MATRIX'}
                <div className="icon-nest !w-12 !h-12 ml-4">
                  <Save size={20} />
                </div>
              </button>
            </form>
          </div>
        </div>

        {/* Right Content: Invoices Workspace */}
        <div className="lg:col-span-8 flex flex-col h-full min-h-[600px]">
          <div className="glass-panel !p-0 rounded-[2.5rem] shadow-premium overflow-hidden flex flex-col flex-1 border border-black/5 bg-white/40">
            <div className="p-6 border-b border-black/5 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20 bg-white/60 backdrop-blur-3xl">
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="relative group flex-1 md:w-64">
                  <Search size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="FILTER LIABILITIES..." 
                    className="w-full h-14 pl-16 pr-6 rounded-pill bg-canvas border border-black/5 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-8 focus:ring-accent-signature/5 transition-all shadow-inner"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={toggleSelectAll}
                  className="px-8 h-14 rounded-pill bg-ink-primary text-white text-[10px] font-black tracking-widest whitespace-nowrap hover:scale-[1.02] transition-transform shrink-0 uppercase shadow-lg shadow-ink-primary/20"
                >
                  {selectedInvoiceIds.length === clientInvoices.length ? 'PURGE SELECTION' : 'SELECT ENTITY ALL'}
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="px-5 py-3 bg-canvas border border-black/5 rounded-pill text-[9px] font-black text-ink-primary uppercase tracking-widest">
                  {selectedInvoiceIds.length} Nodes Active
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas sticky top-0 z-10 border-b border-black/5">
                  <tr>
                    <th className="py-5 px-8 text-[9px] font-black text-gray-400 uppercase tracking-widest">ID</th>
                    <th className="py-5 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest">Invoice Node</th>
                    <th className="py-5 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest">Timestamp</th>
                    <th className="py-5 px-6 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Exposure Value</th>
                    <th className="py-5 px-8 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Commit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {clientInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-32 text-center">
                        <div className="opacity-10 mb-6 flex justify-center"><ShieldCheck size={80} strokeWidth={1} /></div>
                        <h4 className="text-3xl font-black text-ink-primary mb-2 uppercase italic tracking-tighter">LIABILITY CLEAR.</h4>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">This transaction partner has no outstanding financial friction.</p>
                      </td>
                    </tr>
                  ) : (
                    clientInvoices.map((inv, idx) => {
                      const isSelected = selectedInvoiceIds.includes(inv.id);
                      return (
                        <tr 
                          key={inv.id} 
                          onClick={() => toggleInvoiceSelection(inv)}
                          className={`group cursor-pointer transition-all duration-300 ${isSelected ? 'bg-accent-signature/5 active' : 'hover:bg-white/80'}`}
                        >
                          <td className="py-6 px-8 text-[11px] font-black text-gray-400 tabular-nums">{idx + 1}</td>
                          <td className="py-6 px-6">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-ink-primary text-accent-signature shadow-premium scale-110' : 'bg-canvas border border-black/5 text-gray-300'}`}>
                                <Receipt size={20} />
                              </div>
                              <div>
                                <div className="text-sm font-black text-ink-primary uppercase tracking-tight leading-none mb-1 shadow-sm">
                                  #{inv.invoice_number}
                                </div>
                                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest italic opacity-60">Verified Document</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-6 px-6">
                            <div className="text-[11px] font-black text-ink-primary uppercase tracking-tight mb-1">
                              {new Date(inv.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric'})}
                            </div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><Clock size={10} /> {new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td className="py-6 px-6 text-right">
                            <div className={`text-xl font-black tabular-nums transition-all ${isSelected ? 'text-ink-primary scale-110' : 'text-gray-700'}`}>
                              {businessProfile?.currencySymbol}{Math.round(inv.grand_total).toLocaleString()}
                            </div>
                            <div className="text-[9px] font-black text-red-500 uppercase tracking-widest opacity-60">Friction Point</div>
                          </td>
                          <td className="py-6 px-8 text-right">
                            <div className={`w-10 h-10 ml-auto rounded-full border-2 flex items-center justify-center transition-all duration-500 ${isSelected ? 'bg-accent-signature border-accent-signature scale-110 shadow-xl shadow-accent-signature/30' : 'border-black/5 bg-white group-hover:border-black/10'}`}>
                              {isSelected && <Check size={20} className="text-ink-primary stroke-[4px]" />}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-ink-primary p-8 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-accent-signature/20 to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-black text-accent-signature uppercase tracking-widest mb-2 flex items-center gap-3">
                        <TrendingUp size={16} /> ENTITY SETTLEMENT AGGREGATE
                    </p>
                    <div className="text-white text-4xl font-black tabular-nums tracking-tighter leading-none italic">
                        <span className="text-2xl text-accent-signature opacity-50 mr-2">{businessProfile?.currencySymbol}</span>
                        {selectedTotal.toLocaleString()}
                    </div>
                </div>

                <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
                    <div className="bg-white/5 px-8 py-5 rounded-2xl border border-white/10 flex flex-col items-center flex-1 md:flex-none">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5">Nodes Committed</span>
                        <span className="text-2xl font-black text-white leading-none">{selectedInvoiceIds.length}</span>
                    </div>
                    <div className="text-right flex flex-col justify-center">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5">Residual Exposure</span>
                        <span className="text-2xl font-black text-accent-signature tabular-nums leading-none">
                            {businessProfile?.currencySymbol}{(client.outstanding_balance - selectedTotal).toLocaleString()}
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
