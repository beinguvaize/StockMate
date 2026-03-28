import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
    UserCircle, Plus, DollarSign, Building, Phone, MapPin, 
    Edit3, Trash2, X, Check, Save, UserCheck, CreditCard, 
    ChevronRight, ExternalLink, ShieldCheck, Mail, Search,
    TrendingUp, AlertCircle, Users, BarChart3, Receipt, History
} from 'lucide-react';
import ClientDirectory from '../components/clients/ClientDirectory';
import ClientAging from '../components/clients/ClientAging';
import ClientPayments from '../components/clients/ClientPayments';
import ClientStatementViewer from '../components/clients/ClientStatementViewer';

const Clients = () => {
    const { clients, addShop: addClient, updateShop: updateClient, deleteShop: deleteClient, sales, recordClientPayment, clientPayments, businessProfile, isViewOnly, hasPermission } = useAppContext();
    const [activeTab, setActiveTab] = useState('DIRECTORY'); // DIRECTORY, AGING, PAYMENTS, STATEMENTS
    
    // Payment Modal State
    const [selectedClientForPayment, setSelectedClientForPayment] = useState(null);
    const [paymentData, setPaymentData] = useState({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
    const [paymentError, setPaymentError] = useState('');

    // Statement State
    const [selectedClientForStatement, setSelectedClientForStatement] = useState(null);

    const handleRecordPaymentSubmit = async (e) => {
        e.preventDefault();
        setPaymentError('');
        const amount = parseFloat(paymentData.amount);
        if (isNaN(amount) || amount <= 0) {
            setPaymentError('Enter a valid amount');
            return;
        }
        if (amount > selectedClientForPayment.outstanding_balance) {
            setPaymentError('Amount exceeds outstanding balance');
            return;
        }
        
        const res = await recordClientPayment(selectedClientForPayment.id, amount, paymentData.date, paymentData.notes);
        if (res?.success === false) {
            setPaymentError(res.error);
        } else {
            setSelectedClientForPayment(null);
            setPaymentData({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
        }
    };

    const getClientStatement = (clientId) => {
        const clientSales = (sales || [])
            .filter(s => s.clientId === clientId && (s.paymentMethod === 'credit' || s.paymentMethod === 'CREDIT'))
            .map(s => ({
                id: s.id,
                date: s.date,
                type: 'SALE',
                description: `Credit Sale #${s.id.split('-').pop()}`,
                debit: s.totalAmount, // Increases outstanding balance
                credit: 0
            }));
            
        const payments = (clientPayments || [])
            .filter(p => p.client_id === clientId)
            .map(p => ({
                id: p.id,
                date: p.date,
                type: 'PAYMENT',
                description: p.notes ? `Payment: ${p.notes}` : 'Payment Received',
                debit: 0,
                credit: p.amount // Decreases outstanding balance
            }));

        const combined = [...clientSales, ...payments].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        let runningBalance = 0;
        return combined.map(txn => {
            runningBalance += txn.debit;
            runningBalance -= txn.credit;
            return { ...txn, balance: runningBalance };
        });
    };

    const clientStats = useMemo(() => {
        const stats = {};
        (clients || []).forEach(s => stats[s.id] = { totalSales: 0, orderCount: 0 });

        (sales || []).forEach(sale => {
            if (stats[sale.clientId]) {
                stats[sale.clientId].totalSales += sale.totalAmount;
                stats[sale.clientId].orderCount += 1;
            }
        });
        return stats;
    }, [sales, clients]);

    const topMetrics = useMemo(() => {
        let topDebtor = { name: 'None', amount: 0 };
        let topPerformer = { name: 'None', amount: 0 };

        (clients || []).forEach(client => {
            const stats = clientStats[client.id];
            if (client.outstanding_balance > topDebtor.amount) {
                topDebtor = { name: client.name, amount: client.outstanding_balance };
            }
            if (stats && stats.totalSales > topPerformer.amount) {
                topPerformer = { name: client.name, amount: stats.totalSales };
            }
        });

        return { topDebtor, topPerformer };
    }, [clients, clientStats]);

    const filteredClients = useMemo(() => {
        return (clients || []).filter(client => {
            const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                client.contact?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                client.id.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = statusFilter === 'ALL' || client.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });
    }, [clients, searchTerm, statusFilter]);

    const openAdd = () => {
        setEditingClient(null);
        setFormData({ name: '', contact: '', phone: '', address: '', status: 'ACTIVE' });
        setIsAdding(true);
    };

    const openEdit = (client) => {
        setEditingClient(client);
        setFormData({ name: client.name, contact: client.contact, phone: client.phone, address: client.address, status: client.status || 'ACTIVE' });
        setIsAdding(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = { ...formData, status: formData.status || 'ACTIVE' };
        if (editingClient) {
            updateClient({ ...editingClient, ...data });
        } else {
            addClient(data);
        }
        setIsAdding(false);
        setEditingClient(null);
        setFormData({ name: '', contact: '', phone: '', address: '', status: 'ACTIVE' });
    };

    const toggleStatus = (client) => {
        const newStatus = client.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
        updateClient({ ...client, status: newStatus });
    };

    const handleDelete = (clientId) => {
        deleteClient(clientId);
        setDeleteConfirm(null);
    };

    return (
        <>
            <div className="animate-fade-in flex flex-col gap-6 pb-12">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-2">
                    <div>
                        <h1 className="text-3xl md:text-6xl font-black tracking-tighter text-ink-primary uppercase leading-none mb-2">CLIENTS.</h1>
                        <p className="text-[10px] font-black text-ink-secondary uppercase tracking-widest opacity-70">CUSTOMER NETWORK & ACCOUNTS</p>
                    </div>
                    
                    {/* Tab Navigation */}
                    <div className="flex bg-canvas border border-black/5 rounded-2xl p-1 shadow-sm w-full md:w-auto overflow-x-auto no-scrollbar">
                        {[
                            { id: 'DIRECTORY', label: 'Directory', icon: <Users size={14} /> },
                            { id: 'AGING', label: 'Aging Report', icon: <History size={14} /> },
                            { id: 'PAYMENTS', label: 'Payment History', icon: <CreditCard size={14} /> },
                            { id: 'STATEMENTS', label: 'Statements', icon: <Receipt size={14} /> }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                                    activeTab === tab.id 
                                    ? 'bg-ink-primary text-accent-signature shadow-premium' 
                                    : 'text-ink-secondary hover:bg-black/5'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sub-Module Content */}
                <div className="min-h-[500px]">
                    {activeTab === 'DIRECTORY' && (
                        <ClientDirectory 
                            filteredClients={filteredClients}
                            clientStats={clientStats}
                            topMetrics={topMetrics}
                            businessProfile={businessProfile}
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            statusFilter={statusFilter}
                            setStatusFilter={setStatusFilter}
                            openAdd={openAdd}
                            openEdit={openEdit}
                            toggleStatus={toggleStatus}
                            handleDelete={handleDelete}
                            hasPermission={hasPermission}
                            setSelectedClientForPayment={setSelectedClientForPayment}
                            setSelectedClientForStatement={(c) => { 
                                setSelectedClientForStatement(c);
                                setActiveTab('STATEMENTS');
                            }}
                            setPaymentData={setPaymentData}
                            setPaymentError={setPaymentError}
                        />
                    )}

                    {activeTab === 'AGING' && (
                        <ClientAging 
                            clients={clients}
                            sales={sales}
                            clientPayments={clientPayments}
                            businessProfile={businessProfile}
                        />
                    )}

                    {activeTab === 'PAYMENTS' && (
                        <ClientPayments 
                            clientPayments={clientPayments}
                            clients={clients}
                            businessProfile={businessProfile}
                        />
                    )}

                    {activeTab === 'STATEMENTS' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                             {!selectedClientForStatement ? (
                                 <div className="glass-panel !py-32 rounded-[3rem] text-center border-dashed border-2">
                                     <Receipt size={64} className="mx-auto mb-6 opacity-10" />
                                     <h3 className="text-3xl font-black tracking-tighter uppercase mb-4">Select a Client</h3>
                                     <p className="text-[10px] font-black tracking-widest uppercase opacity-50 mb-8 max-w-[300px] mx-auto">Choose a customer from the directory to view their detailed transaction statement.</p>
                                     <button 
                                        onClick={() => setActiveTab('DIRECTORY')}
                                        className="btn-signature !px-10 !h-14 !rounded-pill"
                                     >
                                         OPEN DIRECTORY
                                     </button>
                                 </div>
                             ) : (
                                 <ClientStatementViewer 
                                    client={selectedClientForStatement}
                                    clientStats={clientStats}
                                    businessProfile={businessProfile}
                                    getClientStatement={getClientStatement}
                                    onClose={() => setSelectedClientForStatement(null)}
                                 />
                             )}
                        </div>
                    )}
                </div>
            </div>

            {/* Client Form Modal */}
            {isAdding && (
                <div className="modal-overlay">
                    <div className="glass-modal">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h2 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">
                                    {editingClient ? 'EDIT CLIENT.' : 'NEW CLIENT.'}
                                </h2>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-80">
                                    REGISTER BUSINESS OUTLET DETAILS
                                </p>
                            </div>
                            <button
                                onClick={() => { setIsAdding(false); setEditingClient(null); }}
                                className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Business Name</label>
                                    <input 
                                        required 
                                        type="text" 
                                        placeholder="BUSINESS ENTITY NAME..."
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-lg text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Primary Contact</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                        placeholder="PERSONNEL NAME..."
                                        value={formData.contact} 
                                        onChange={e => setFormData({...formData, contact: e.target.value})} 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Phone Number</label>
                                    <input 
                                        required 
                                        type="text" 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all tabular-nums" 
                                        placeholder="+1 (000) 000-0000"
                                        value={formData.phone} 
                                        onChange={e => setFormData({...formData, phone: e.target.value})} 
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Account Status</label>
                                    <select 
                                        className="w-full bg-canvas border-none rounded-2xl p-5 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase appearance-none cursor-pointer" 
                                        value={formData.status} 
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="ACTIVE">ACTIVE ACCOUNT</option>
                                        <option value="INACTIVE">INACTIVE / ON HOLD</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button type="button" className="px-8 py-4 rounded-pill border border-black/10 font-black text-ink-primary text-xs uppercase tracking-[0.2em] hover:bg-black/5 transition-all cursor-pointer" onClick={() => { setIsAdding(false); setEditingClient(null); }}>Cancel</button>
                                <button type="submit" className="btn-signature !h-14 !text-sm flex items-center justify-center px-6 !rounded-pill">
                                    {editingClient ? 'SAVE CHANGES' : 'ADD CLIENT'}
                                    <div className="icon-nest !w-10 !h-10 ml-4">
                                        <Save size={22} />
                                    </div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Record Payment Modal */}
            {selectedClientForPayment && (
                <div className="modal-overlay z-50">
                    <div className="glass-modal max-w-sm w-full mx-auto">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h2 className="text-2xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-1">RECORD PAYMENT</h2>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-80">{selectedClientForPayment.name}</p>
                            </div>
                            <button
                                onClick={() => setSelectedClientForPayment(null)}
                                className="w-8 h-8 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
                            {paymentError && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-2">
                                    <AlertCircle size={14} /> {paymentError}
                                </div>
                            )}
                            
                            <div className="p-3 bg-canvas border border-black/5 rounded-xl flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#4b5563]">Current Balance</span>
                                <span className="text-lg font-black font-mono text-red-500 tabular-nums">{businessProfile?.currencySymbol || '₹'}{Math.round(selectedClientForPayment.outstanding_balance || 0).toLocaleString()}</span>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Amount Received</label>
                                <div className="relative">
                                    <DollarSign size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-primary opacity-50" />
                                    <input 
                                        required 
                                        type="number" 
                                        step="0.01"
                                        min="0.01"
                                        max={selectedClientForPayment.outstanding_balance}
                                        className="w-full bg-canvas border-none rounded-xl pl-10 pr-4 py-4 font-black text-xl text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all font-mono" 
                                        placeholder="0.00"
                                        value={paymentData.amount} 
                                        onChange={e => setPaymentData({...paymentData, amount: e.target.value})} 
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Payment Date</label>
                                <input 
                                    required 
                                    type="date" 
                                    className="w-full bg-canvas border-none rounded-xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase" 
                                    value={paymentData.date} 
                                    onChange={e => setPaymentData({...paymentData, date: e.target.value})} 
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-ink-secondary opacity-70 mb-1.5">Notes (Optional)</label>
                                <textarea 
                                    className="w-full bg-canvas border-none rounded-xl p-4 font-black text-xs text-ink-primary outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all uppercase resize-none h-20" 
                                    placeholder="CHEQUE NO, REF, ETC..."
                                    value={paymentData.notes} 
                                    onChange={e => setPaymentData({...paymentData, notes: e.target.value})} 
                                />
                            </div>

                            <button type="submit" className="w-full mt-2 btn-signature !h-14 !text-xs flex items-center justify-center !rounded-xl">
                                SAVE PAYMENT
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Client Statement Modal */}
            {selectedClientForStatement && (
                <div className="modal-overlay z-40">
                    <div className="glass-modal max-w-2xl w-full mx-auto max-h-[85vh] flex flex-col">
                        <div className="flex justify-between items-start mb-6 shrink-0">
                            <div>
                                <h2 className="text-3xl font-black text-ink-primary tracking-tighter uppercase leading-none mb-2">CLIENT STATEMENT.</h2>
                                <p className="text-[10px] font-black text-[#4b5563] uppercase tracking-[0.3em] opacity-80">{selectedClientForStatement.name}</p>
                            </div>
                            <button
                                onClick={() => setSelectedClientForStatement(null)}
                                className="w-10 h-10 rounded-pill border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all text-ink-primary"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-6 shrink-0">
                            <div className="p-4 bg-canvas border border-black/5 rounded-2xl flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#4b5563] mb-1">Current Outstanding</span>
                                <span className={`text-3xl font-black font-mono tracking-tighter tabular-nums leading-none ${(selectedClientForStatement.outstanding_balance || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {businessProfile?.currencySymbol || '₹'}{Math.round(selectedClientForStatement.outstanding_balance || 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="p-4 bg-canvas border border-black/5 rounded-2xl flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#4b5563] mb-1">Total Lifetime Sales</span>
                                <span className="text-3xl font-black font-mono tracking-tighter text-ink-primary tabular-nums leading-none flex items-baseline gap-2">
                                    {businessProfile?.currencySymbol || '₹'}{Math.round(clientStats[selectedClientForStatement.id]?.totalSales || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-[300px] border border-black/10 rounded-2xl bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-canvas/90 backdrop-blur-sm z-10 border-b border-black/10">
                                    <tr>
                                        <th className="py-3 px-4 text-[9px] font-black uppercase tracking-[0.2em] text-[#4b5563]">Date</th>
                                        <th className="py-3 px-4 text-[9px] font-black uppercase tracking-[0.2em] text-[#4b5563]">Description</th>
                                        <th className="py-3 px-4 text-[9px] font-black uppercase tracking-[0.2em] text-[#4b5563] text-right">Debit (Sale)</th>
                                        <th className="py-3 px-4 text-[9px] font-black uppercase tracking-[0.2em] text-[#4b5563] text-right">Credit (Pay)</th>
                                        <th className="py-3 px-4 text-[9px] font-black uppercase tracking-[0.2em] text-[#4b5563] text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {getClientStatement(selectedClientForStatement.id).length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="py-12 text-center text-[11px] font-black text-ink-secondary uppercase tracking-widest">No Transactions Found</td>
                                        </tr>
                                    ) : (
                                        getClientStatement(selectedClientForStatement.id).map((txn, idx) => (
                                            <tr key={`${txn.id}-${idx}`} className="hover:bg-canvas/50 transition-colors">
                                                <td className="py-3 px-4">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-ink-primary">
                                                        {new Date(txn.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${txn.type === 'SALE' ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                                        <span className="text-[11px] font-black uppercase tracking-widest text-[#4b5563]">
                                                            {txn.description}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    {txn.debit > 0 ? (
                                                        <span className="text-[11px] font-black font-mono text-red-500 tabular-nums">
                                                            {businessProfile?.currencySymbol || '₹'}{Math.round(txn.debit).toLocaleString()}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    {txn.credit > 0 ? (
                                                        <span className="text-[11px] font-black font-mono text-green-500 tabular-nums">
                                                            {businessProfile?.currencySymbol || '₹'}{Math.round(txn.credit).toLocaleString()}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`text-[11px] font-black font-mono tabular-nums ${txn.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                        {businessProfile?.currencySymbol || '₹'}{Math.round(txn.balance).toLocaleString()}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Clients;
