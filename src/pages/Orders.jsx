import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useSales } from '../hooks/useSales';
import { usePeople } from '../hooks/usePeople';
import { useOperations } from '../hooks/useOperations';
import {
  ShoppingBag, Truck, CheckCircle2, XCircle, Clock,
  Search, Trash2, CreditCard, User, Package,
  Activity, TrendingUp, Printer
} from 'lucide-react';
import POSReceipt from '../components/invoice/POSReceipt';
import { todayISOInAppTZ, formatDate } from '../lib/utils';

const Orders = () => {
  const { hasPermission } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  const { sales, deleteSale, settleSale, loading: salesLoading } = useSales(currentTenantId);
  const { users, clients, loading: peoLoading } = usePeople(currentTenantId);
  const { vehicles, loading: opsLoading } = useOperations(currentTenantId);

  const sym = businessProfile?.currencySymbol || '₹';

  const getClientName  = (id) => clients.find(c => c.id === id)?.name || 'Walk-in';
  const getVehicleName = (id) => vehicles.find(v => v.id === id)?.name || '—';
  const getUserName    = (id) => users.find(u => u.id === id)?.name || '—';

  const [activeTab,  setActiveTab]  = useState('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [showReceipt, setShowReceipt] = useState(null);

  const filteredOrders = useMemo(() => {
    return (sales || [])
      .filter(s => {
        if (activeTab === 'PENDING')   return s.status === 'PENDING' || s.status === 'PARTIAL';
        if (activeTab === 'COMPLETED') return s.status === 'PAID'    || s.status === 'COMPLETED';
        return true;
      })
      .filter(s => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
          s.invoice_number?.toLowerCase().includes(q) ||
          getClientName(s.client_id)?.toLowerCase().includes(q)
        );
      });
  }, [sales, activeTab, searchTerm]);

  const handleSettle = async (order) => {
    if (!hasPermission('finance', 'edit')) return;
    const due = (order.total_amount || 0) - (order.paid_amount || 0);
    const input = prompt(`Amount to settle (due: ${sym}${due}):`, due);
    if (input && !isNaN(input)) await settleSale(order.id, parseFloat(input));
  };

  const handleDelete = async (id) => {
    if (!hasPermission('sales', 'delete')) return;
    if (window.confirm('Delete this order permanently?')) await deleteSale(id);
  };

  const statusBadge = (status) => {
    const map = {
      PENDING:   { cls: 'bg-amber-50  text-amber-600  border-amber-200',  icon: <Clock size={11} />,       label: 'Pending'   },
      PARTIAL:   { cls: 'bg-blue-50   text-blue-600   border-blue-200',   icon: <Activity size={11} />,    label: 'Partial'   },
      PAID:      { cls: 'bg-green-50  text-green-600  border-green-200',  icon: <CheckCircle2 size={11} />, label: 'Paid'     },
      COMPLETED: { cls: 'bg-green-50  text-green-600  border-green-200',  icon: <CheckCircle2 size={11} />, label: 'Completed'},
      VOID:      { cls: 'bg-red-50    text-red-500    border-red-200',    icon: <XCircle size={11} />,     label: 'Void'      },
    };
    const s = map[status] || map.PENDING;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${s.cls}`}>
        {s.icon}{s.label}
      </span>
    );
  };

  const kpis = [
    {
      label: 'Pending',
      value: sales.filter(s => s.status !== 'PAID' && s.status !== 'COMPLETED').length,
      icon: <Clock size={20} />, color: 'text-amber-500',
    },
    {
      label: 'Total Orders',
      value: sales.length,
      icon: <ShoppingBag size={20} />, color: 'text-blue-500',
    },
    {
      label: "Today's Revenue",
      value: `${sym}${sales.filter(s => s.date === todayISOInAppTZ()).reduce((s, i) => s + (i.total_amount || 0), 0).toLocaleString()}`,
      icon: <TrendingUp size={20} />, color: 'text-green-500',
    },
    {
      label: 'Avg Order',
      value: `${sym}${Math.round(sales.reduce((s, i) => s + (i.total_amount || 0), 0) / (sales.length || 1)).toLocaleString()}`,
      icon: <Activity size={20} />, color: 'text-purple-500',
    },
  ];

  if (salesLoading || peoLoading || opsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-accent-signature/30 border-t-accent-signature rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-16">

      {/* Header */}
      <div>
        <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight uppercase">
          ORDERS<span className="text-accent-signature">.</span>
        </h1>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-2">
          Sales history & payment management
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-[1.5rem] border border-black/5 shadow-sm p-5 relative overflow-hidden group hover:border-black/10 transition-all">
            <div className={`absolute top-4 right-4 opacity-[0.07] group-hover:opacity-[0.13] transition-opacity ${k.color}`}>
              {k.icon}
            </div>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1 block">{k.label}</span>
            <div className="text-2xl font-black text-ink-primary tabular-nums leading-tight">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white border border-black/5 rounded-[2rem] shadow-sm p-2 gap-2">
        {/* Status tabs */}
        <div className="flex bg-canvas border border-black/5 rounded-full p-1.5 shrink-0">
          {['PENDING', 'COMPLETED', 'ALL'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-full text-[11px] font-bold tracking-wider transition-all ${
                activeTab === tab ? 'bg-ink-primary text-white shadow-md' : 'text-gray-500 hover:text-ink-primary hover:bg-black/5'
              }`}
            >
              {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative group flex-1 max-w-xs">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:opacity-80 transition-opacity" />
          <input
            type="text"
            placeholder="Search by order # or client..."
            className="w-full h-11 pl-10 pr-4 rounded-full bg-canvas border border-black/5 shadow-inner text-xs font-bold text-ink-primary placeholder:text-gray-400 outline-none focus:border-black/20 focus:bg-white transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2rem] border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-black/5 bg-canvas/50">
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Order</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Client</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vehicle / Driver</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredOrders.map(order => (
                <tr key={order.id} className="group hover:bg-canvas/40 transition-colors">
                  {/* Order */}
                  <td className="py-4 px-6">
                    <div className="text-sm font-black text-ink-primary leading-none mb-1">
                      #{order.invoice_number || order.id?.split('-').pop()}
                    </div>
                    <div className="text-[10px] text-gray-400 font-semibold">{formatDate(order.date)}</div>
                  </td>

                  {/* Client */}
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-signature/10 flex items-center justify-center shrink-0">
                        <User size={14} className="text-ink-primary" />
                      </div>
                      <span className="text-sm font-bold text-ink-primary">{getClientName(order.client_id)}</span>
                    </div>
                  </td>

                  {/* Vehicle / Driver */}
                  <td className="py-4 px-6">
                    <div className="text-sm font-semibold text-ink-primary">{getVehicleName(order.vehicle_id)}</div>
                    <div className="text-[10px] text-gray-400 font-semibold">{getUserName(order.user_id)}</div>
                  </td>

                  {/* Amount */}
                  <td className="py-4 px-6 text-right tabular-nums">
                    <div className="text-sm font-black text-ink-primary">{sym}{(order.total_amount || 0).toLocaleString()}</div>
                    {(order.paid_amount || 0) > 0 && (
                      <div className="text-[10px] text-green-500 font-semibold">Paid: {sym}{order.paid_amount.toLocaleString()}</div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-4 px-6">{statusBadge(order.status)}</td>

                  {/* Actions */}
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setShowReceipt(order)}
                        className="w-9 h-9 rounded-xl bg-canvas border border-black/5 flex items-center justify-center text-gray-500 hover:bg-ink-primary hover:text-white transition-all"
                        title="Print receipt"
                      >
                        <Printer size={14} />
                      </button>

                      {order.status !== 'PAID' && order.status !== 'COMPLETED' && hasPermission('finance', 'edit') && (
                        <button
                          onClick={() => handleSettle(order)}
                          className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center text-green-600 hover:bg-green-500 hover:text-white transition-all"
                          title="Settle payment"
                        >
                          <CreditCard size={14} />
                        </button>
                      )}

                      {hasPermission('sales', 'delete') && (
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all"
                          title="Delete order"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="py-24 text-center">
              <Package size={48} className="mx-auto mb-4 opacity-10" strokeWidth={1} />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No orders found</p>
            </div>
          )}
        </div>
      </div>

      {/* POS Receipt Modal */}
      {showReceipt && (
        <POSReceipt
          invoice={{
            id: showReceipt.id,
            invoice_number: showReceipt.invoice_number || showReceipt.id?.split('-').pop(),
            invoice_date: showReceipt.date,
            items: (showReceipt.items || []).map(i => ({
              name: i.name || i.productName || 'Item',
              qty: i.quantity || i.qty || 1,
              rate: i.price || i.sellingPrice || i.rate || 0,
              taxRate: i.taxRate || 0,
              unit: i.unit || 'PCS',
            })),
            grand_total: showReceipt.total_amount,
            paid_amount: showReceipt.paid_amount || 0,
            payment_status: showReceipt.status === 'PAID' || showReceipt.status === 'COMPLETED' ? 'PAID' : 'UNPAID',
          }}
          businessProfile={businessProfile}
          client={clients.find(c => c.id === showReceipt.client_id) || { name: 'Walk-in' }}
          onClose={() => setShowReceipt(null)}
        />
      )}
    </div>
  );
};

export default Orders;
