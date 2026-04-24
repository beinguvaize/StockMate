import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useSales } from '../hooks/useSales';
import { usePeople } from '../hooks/usePeople';
import { useOperations } from '../hooks/useOperations';
import { 
  ShoppingBag, Truck, CheckCircle2, XCircle, Clock,
  Search, Filter, ChevronRight, Eye, Trash2, Edit3,
  MapPin, Printer, ShieldCheck, CreditCard, User,
  ArrowUpRight, Package, AlertCircle, X, Check, Activity, TrendingUp
} from 'lucide-react';
import PremiumInvoice from '../components/sales/PremiumInvoice';
import { todayISOInAppTZ, formatDate } from '../lib/utils';

const Orders = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { 
    sales, updateSale, deleteSale, settleSale, loading: salesLoading 
  } = useSales(currentTenantId);
  const { 
    users, clients, loading: peoLoading 
  } = usePeople(currentTenantId);
  const { 
    vehicles, loading: opsLoading 
  } = useOperations(currentTenantId);

  const getShopName = (id) => clients.find(c => c.id === id)?.name || 'Walk-in Client';
  const getVehicleName = (id) => vehicles.find(v => v.id === id)?.name || 'Local Delivery';
  const getUserName = (id) => users.find(u => u.id === id)?.name || 'Unknown';

  const [activeTab, setActiveTab] = useState('PENDING');
  const [filterType, setFilterType] = useState('ALL'); 
  const [showReceipt, setShowReceipt] = useState(null); 
  const [editingSale, setEditingSale] = useState(null);
  const [editCart, setEditCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Data Processing
  const filteredOrders = useMemo(() => {
    let result = (sales || []).filter(s => {
      if (activeTab === 'PENDING') return s.status === 'PENDING' || s.status === 'PARTIAL';
      if (activeTab === 'COMPLETED') return s.status === 'PAID' || s.status === 'COMPLETED';
      return true;
    });

    if (filterType !== 'ALL') {
      result = result.filter(s => s.payment_method === filterType);
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(s => 
        s.invoice_number?.toLowerCase().includes(lower) ||
        getShopName(s.client_id)?.toLowerCase().includes(lower)
      );
    }

    return result;
  }, [sales, activeTab, filterType, searchTerm, getShopName]);

  // 2. Handlers
  const handleSettle = async (sale) => {
    if (!hasPermission('finance', 'edit')) return;
    const amount = prompt(`Enter Payment Amount to Settle for Invoice #${sale.invoice_number}:`, sale.total_amount - (sale.paid_amount || 0));
    if (amount && !isNaN(amount)) {
      await settleSale(sale.id, parseFloat(amount));
    }
  };

  const handleVoid = async (id) => {
    if (!hasPermission('sales', 'delete')) return;
    if (window.confirm("CRITICAL: Operation irreversible. Void this order manifest?")) {
      await deleteSale(id);
    }
  };

  const statusConfig = {
    PENDING: { color: 'bg-yellow-500/10 text-yellow-600', icon: <Clock size={12} /> },
    PARTIAL: { color: 'bg-blue-500/10 text-blue-600', icon: <Activity size={12} /> },
    PAID: { color: 'bg-emerald-500/10 text-emerald-600', icon: <CheckCircle2 size={12} /> },
    COMPLETED: { color: 'bg-emerald-500/10 text-emerald-600', icon: <CheckCircle2 size={12} /> },
    VOID: { color: 'bg-red-500/10 text-red-600', icon: <XCircle size={12} /> }
  };

  if (salesLoading || peoLoading || opsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-accent-signature/30 border-t-accent-signature rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-black/5">
        <div>
          <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">
            ORDERS<span className="text-accent-signature">.</span>
          </h1>
          <p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase tracking-widest">
            Commercial Transaction Manifests & Settlement Control
          </p>
        </div>
      </div>

      {/* Analytics Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending Settlement', value: sales.filter(s => s.status !== 'PAID').length, icon: <Clock size={20} />, color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Total Volume', value: sales.length, icon: <ShoppingBag size={20} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'Daily Revenue', value: `${businessProfile.currencySymbol}${sales.filter(s => s.date === todayISOInAppTZ()).reduce((s,i) => s + i.total_amount, 0).toLocaleString()}`, icon: <TrendingUp size={20} />, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Avg Basket', value: `${businessProfile.currencySymbol}${Math.round(sales.reduce((s,i) => s + i.total_amount, 0) / (sales.length || 1)).toLocaleString()}`, icon: <Activity size={20} />, color: 'bg-purple-50 text-purple-600' }
        ].map((kpi, i) => (
          <div key={i} className="glass-panel !rounded-bento p-5 border border-black/5 hover:border-black/10 transition-all">
            <div className={`w-10 h-10 rounded-xl ${kpi.color} flex items-center justify-center mb-4`}>
              {kpi.icon}
            </div>
            <p className="text-2xl font-black text-ink-primary font-sora block leading-none mb-1 uppercase tracking-tight">{kpi.value}</p>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter Utility */}
      <div className="flex flex-wrap items-center gap-3 bg-white/60 backdrop-blur-3xl border border-black/5 p-2 rounded-[2rem] shadow-sm">
        <div className="relative flex-1 min-w-[300px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search manifest ID or client..." 
            className="w-full h-12 bg-canvas/50 border border-black/5 rounded-pill pl-12 pr-4 text-xs font-semibold outline-none focus:ring-4 focus:ring-accent-signature/20 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-1 bg-canvas p-1 rounded-pill border border-black/5 h-12">
          {['PENDING', 'COMPLETED', 'ALL'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 h-full rounded-pill text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === tab ? 'bg-ink-primary text-white shadow-xl' : 'text-gray-400 hover:text-ink-primary'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 bg-surface shadow-premium">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-canvas/50 border-b border-black/5">
              <tr>
                <th className="p-1.5 pl-8 text-[10px] font-black text-gray-400 uppercase tracking-widest py-6">Reference Node</th>
                <th className="p-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest py-6">Client Entity</th>
                <th className="p-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest py-6">Operator / Fleet</th>
                <th className="p-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest py-6 text-right">Value Descriptor</th>
                <th className="p-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest py-6 text-center">Status Matrix</th>
                <th className="p-1.5 pr-8 text-[10px] font-black text-gray-400 uppercase tracking-widest py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredOrders.map(order => (
                <tr key={order.id} className="group hover:bg-canvas/40 transition-all duration-300">
                  <td className="p-1.5 pl-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-ink-primary leading-none uppercase tracking-tight mb-1">#{order.invoice_number}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                        {formatDate(order.date)}
                      </span>
                    </div>
                  </td>
                  <td className="p-1.5 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-ink-primary/5 flex items-center justify-center text-ink-primary group-hover:scale-110 transition-transform">
                        <User size={14} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-ink-primary uppercase tracking-tight truncate max-w-[150px]">{getShopName(order.client_id)}</span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">ID: {order.client_id?.slice(0, 8)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-1.5 py-6 font-mono">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-ink-primary">{getVehicleName(order.vehicle_id)}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{getUserName(order.user_id)}</span>
                    </div>
                  </td>
                  <td className="p-1.5 py-6 text-right tabular-nums">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-ink-primary leading-none mb-1">
                        {businessProfile.currencySymbol}{order.total_amount?.toLocaleString()}
                      </span>
                      <span className="text-[8px] font-bold text-accent-signature uppercase tracking-widest">
                        Paid: {businessProfile.currencySymbol}{order.paid_amount?.toLocaleString()}
                      </span>
                    </div>
                  </td>
                  <td className="p-1.5 py-6">
                    <div className="flex justify-center">
                      <div className={`px-3 py-1.5 rounded-pill flex items-center gap-2 border border-black/5 shadow-sm ${statusConfig[order.status]?.color}`}>
                        {statusConfig[order.status]?.icon}
                        <span className="text-[9px] font-black uppercase tracking-widest">{order.status}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-1.5 pr-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => setShowReceipt(order)}
                        className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center text-ink-primary hover:bg-ink-primary hover:text-white transition-all shadow-sm"
                        title="View Receipt"
                      >
                        <Printer size={16} />
                      </button>
                      
                      {order.status !== 'PAID' && (
                        <button 
                          onClick={() => handleSettle(order)}
                          className="w-10 h-10 rounded-xl bg-accent-signature/10 flex items-center justify-center text-ink-primary hover:bg-accent-signature transition-all shadow-sm"
                          title="Settle Payment"
                        >
                          <CreditCard size={16} />
                        </button>
                      )}

                      <button 
                        onClick={() => handleVoid(order.id)}
                        className="w-10 h-10 rounded-xl bg-red-500/5 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        title="Void Order"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 opacity-20">
              <ShoppingBag size={64} strokeWidth={1} />
              <p className="text-sm font-black uppercase mt-6 tracking-widest text-center">
                Manifest Ledger Null <br /> Zero {activeTab} Operations
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showReceipt && (
        <div className="modal-overlay z-[100] animate-in fade-in duration-300">
          <div className="glass-modal !max-w-[450px] !p-0 overflow-hidden">
            <div className="p-6 bg-canvas border-b border-black/5 flex justify-between items-center no-print">
              <h1 className="text-sm font-black uppercase tracking-widest text-gray-500">Commercial Receipt Matrix</h1>
              <button 
                onClick={() => setShowReceipt(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-1 overflow-y-auto max-h-[80vh] custom-scrollbar">
              <PremiumInvoice 
                order={showReceipt} 
                business={businessProfile} 
                onClose={() => setShowReceipt(null)} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-4 py-12 opacity-20 no-print">
        <ShieldCheck size={16} />
        <span className="text-[8px] font-black uppercase tracking-[0.2em]">Validated Transaction Protocol Node v4.0.2</span>
      </div>
    </div>
  );
};

export default Orders;
