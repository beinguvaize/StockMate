import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import { EmptyState } from '../ui/States';
import {
  UserCircle, Plus, Edit3, Trash2, Check,
  Phone, AlertCircle, Search, TrendingUp, Users, CreditCard, Clock,
  Mail, Receipt, MapPin, ShieldCheck, FileText, Truck
} from 'lucide-react';

const ClientDirectory = ({
  filteredClients,
  clientStats,
  topMetrics,
  businessProfile,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  openAdd,
  openEdit,
  handleDelete,
  hasPermission,
  onViewStatement,
  clientDeliveries = [],
}) => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { currentTenant } = useTenant();
  const slug = tenantSlug || currentTenant?.slug;
  const sym = businessProfile?.currencySymbol || '₹';

  const goToSettle = (clientId) => {
    if (slug) navigate(`/${slug}/clients/settle/${clientId}`);
    else console.warn('goToSettle: slug not available yet');
  };

  return (
    <div className="space-y-6">

      {/* KPI Row — compact mono/amber strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm">
        {[
          { label: 'Total Clients', value: filteredClients.length, suffix: 'accounts', icon: <Users size={14} /> },
          { label: 'Total Receivables', value: Math.round(topMetrics.totalReceivables || 0).toLocaleString('en-IN'), money: true, icon: <CreditCard size={14} /> },
          { label: 'Top Debtor', value: Math.round(topMetrics.topDebtor?.amount || 0).toLocaleString('en-IN'), money: true, sub: topMetrics.topDebtor?.name !== 'None' ? topMetrics.topDebtor?.name : 'No exposure', icon: <TrendingUp size={14} /> },
          { label: 'Pending Collections', value: topMetrics.pendingCollections || 0, suffix: 'accounts', icon: <Clock size={14} /> },
        ].map((m, i) => (
          <div key={i} className="bg-white px-4 py-3.5 flex flex-col gap-1.5 hover:bg-amber-500/[0.03] transition-colors">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-400 tracking-widest">
              <span className="text-stone-300">{m.icon}</span>{m.label}
            </div>
            <div className="font-mono text-xl font-bold tabular-nums leading-none text-ink-primary">
              {m.money && <span className="text-amber-400 text-sm mr-0.5">{sym}</span>}{m.value}
              {m.suffix && <span className="text-[10px] font-bold text-gray-300 ml-1 lowercase">{m.suffix}</span>}
            </div>
            {m.sub && <div className="text-[10px] font-semibold text-gray-400 truncate">{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white border border-black/5 rounded-[2rem] shadow-sm p-2 gap-2">
        {/* Status filter */}
        <div className="flex bg-white border border-gray-300 shadow-sm rounded-pill p-1.5 shrink-0">
          {['ALL', 'ACTIVE', 'INACTIVE'].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-5 py-2 rounded-pill text-[11px] font-bold tracking-wider transition-all ${
                statusFilter === f ? 'bg-ink-primary text-white shadow-md' : 'text-gray-500 hover:text-ink-primary hover:bg-black/5'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-end gap-3 min-w-[260px]">
          {/* Search */}
          <div className="relative group flex-1 max-w-xs">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-primary opacity-30 group-focus-within:opacity-80 transition-opacity" />
            <input
              type="text"
              placeholder="Search clients..."
              className="w-full h-11 pl-10 pr-4 rounded-pill bg-white border border-gray-300 shadow-sm shadow-inner text-xs font-bold text-ink-primary placeholder:text-gray-400 outline-none focus:border-black/20 focus:bg-white transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Add button */}
          {hasPermission('clients', 'edit') && (
            <button
              onClick={openAdd}
              className="btn-signature flex items-center gap-3 text-xs font-black shrink-0"
            >
              <span className="text-xs font-bold tracking-wide">NEW CLIENT</span>
              <div className="w-8 h-8 rounded-full bg-ink-primary flex items-center justify-center">
                <Plus size={16} className="text-accent-signature" />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Client Cards */}
      {filteredClients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
          <EmptyState
            icon={UserCircle}
            title={searchTerm || statusFilter !== 'ALL' ? 'No matching clients' : 'No clients yet'}
            description={searchTerm || statusFilter !== 'ALL' ? 'Try a different search or clear filters.' : 'Add your first client to start tracking receivables and sales.'}
            action={hasPermission('clients', 'edit') ? { label: 'Add client', icon: <Plus size={14} />, onClick: openAdd } : null}
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-5 py-2.5 bg-canvas border-b border-black/5">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Client</span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Contact</span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Revenue</span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Outstanding</span>
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</span>
          </div>

          {filteredClients.map((client, idx) => {
            const stats = clientStats[client.id] || { totalSales: 0, orderCount: 0 };
            const outstanding = client.outstanding_balance || 0;
            const cleared = outstanding <= 0;
            const pendingDelivCount = clientDeliveries.filter(d => d.client_id === client.id && d.delivery_status === 'PENDING').length;
            const inTransitCount   = clientDeliveries.filter(d => d.client_id === client.id && d.delivery_status === 'IN_TRANSIT').length;

            return (
              <div
                key={client.id}
                className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 items-center px-5 py-3.5 border-b border-black/5 last:border-0 hover:bg-canvas/60 transition-colors group ${idx % 2 === 0 ? '' : 'bg-black/[0.01]'}`}
              >
                {/* Name + meta */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-accent-signature/10 border border-accent-signature/20 flex items-center justify-center text-xs font-black text-ink-primary shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-primary truncate leading-tight">{client.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[9px] font-semibold text-gray-400">{stats.orderCount} orders</span>
                      {inTransitCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-pill">
                          <Truck size={7} /> {inTransitCount} in transit
                        </span>
                      )}
                      {pendingDelivCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[8px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-pill">
                          <Truck size={7} /> {pendingDelivCount} pending
                        </span>
                      )}
                      {client.gstin && (
                        <span className="flex items-center gap-0.5 text-[8px] font-bold text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                          <ShieldCheck size={7} /> GST
                        </span>
                      )}
                      {client.state && (
                        <span className="text-[9px] text-gray-400 font-medium">{client.state}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div className="min-w-0">
                  {client.phone && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-primary">
                      <Phone size={10} className="text-gray-400 shrink-0" />
                      <span className="tabular-nums truncate">{client.phone}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-0.5">
                      <Mail size={9} className="shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.address && !client.phone && !client.email && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                      <MapPin size={9} className="shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </div>
                  )}
                  {!client.phone && !client.email && !client.address && (
                    <span className="text-[10px] text-gray-300 font-medium">—</span>
                  )}
                </div>

                {/* Revenue */}
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-ink-primary tabular-nums">
                    <span className="text-amber-400 mr-0.5">{sym}</span>{Math.round(stats.totalSales).toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Outstanding */}
                <div className="text-right">
                  <div className={`font-mono text-sm font-bold tabular-nums ${cleared ? 'text-emerald-500' : 'text-red-500'}`}>
                    {sym}{Math.round(outstanding).toLocaleString('en-IN')}
                  </div>
                  <div className={`text-[9px] font-semibold mt-0.5 flex items-center justify-end gap-0.5 ${cleared ? 'text-emerald-500' : 'text-red-400'}`}>
                    {cleared ? <><Check size={8} /> Cleared</> : <><AlertCircle size={8} /> Unpaid</>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => goToSettle(client.id)}
                    title="Settle Account"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-primary text-accent-signature text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                  >
                    <Receipt size={10} /> Settle
                  </button>
                  {hasPermission('clients', 'edit') && (
                    <>
                      <button
                        onClick={() => openEdit(client)}
                        className="w-7 h-7 rounded-lg border border-black/5 bg-canvas flex items-center justify-center hover:bg-ink-primary hover:text-white text-gray-400 transition-all"
                        title="Edit"
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        onClick={() => { if (window.confirm('Delete this client permanently?')) handleDelete(client.id); }}
                        className="w-7 h-7 rounded-lg border border-red-100 bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientDirectory;
