import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import { EmptyState } from '../ui/States';
import {
  UserCircle, Plus, Edit3, Trash2,
  Phone, Search, TrendingUp, Users, CreditCard, Clock,
  Mail, MapPin, ShieldCheck, Truck
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
  dueFilter,
  setDueFilter,
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
    navigate(`/clients/settle/${clientId}`);
  };

  return (
    <div className="space-y-6">

      {/* KPI — receivables hero + stat rail (compact) */}
      <div className="grid grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] gap-3">
        {/* Hero: total receivables */}
        <div className="rounded-2xl bg-ink-primary px-4 py-3.5 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-amber-500/20 blur-2xl pointer-events-none" />
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400">
            <TrendingUp size={11} /> Total Receivables
          </div>
          <div className="font-mono tabular-nums text-[26px] font-bold text-white mt-1 leading-none">
            <span className="text-base text-amber-400/70 mr-0.5">{sym}</span>{Math.round(topMetrics.totalReceivables || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-white/40 font-mono mt-1.5">
            {topMetrics.pendingCollections || 0} accounts pending
          </div>
        </div>

        {/* Total clients */}
        <div className="rounded-2xl bg-white border border-black/5 px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-gray-100 grid place-items-center text-gray-500"><Users size={14} /></div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Total Clients</div>
            <div className="font-mono tabular-nums text-xl font-bold leading-none text-ink-primary mt-0.5">{filteredClients.length}</div>
          </div>
        </div>

        {/* Top debtor */}
        <div className="rounded-2xl bg-white border border-black/5 px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-amber-50 grid place-items-center text-amber-600"><CreditCard size={14} /></div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Top Debtor</div>
            <div className="font-mono tabular-nums text-lg font-bold leading-none text-red-600 mt-0.5">
              <span className="text-sm text-red-400 mr-0.5">{sym}</span>{Math.round(topMetrics.topDebtor?.amount || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-gray-400 truncate mt-0.5">{topMetrics.topDebtor?.name && topMetrics.topDebtor.name !== 'None' ? topMetrics.topDebtor.name : 'No exposure'}</div>
          </div>
        </div>

        {/* Pending collections */}
        <div className="rounded-2xl bg-white border border-black/5 px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-gray-100 grid place-items-center text-gray-500"><Clock size={14} /></div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Pending</div>
            <div className="font-mono tabular-nums text-xl font-bold leading-none text-ink-primary mt-0.5">{topMetrics.pendingCollections || 0}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">collections</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status filter — segmented */}
        <div className="inline-flex p-1 bg-black/[0.06] rounded-xl">
          {['ALL', 'ACTIVE', 'INACTIVE'].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-[12px] font-bold capitalize transition-all ${
                statusFilter === f ? 'bg-white text-ink-primary shadow-sm' : 'text-gray-500 hover:text-ink-primary'
              }`}
            >
              {f.toLowerCase()}
            </button>
          ))}
        </div>

        {/* Outstanding filter — Due / Cleared */}
        <div className="inline-flex p-1 bg-black/[0.06] rounded-xl">
          {[['ALL','All'],['DUE','Due'],['CLEARED','Cleared']].map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setDueFilter?.(k)}
              className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                dueFilter === k
                  ? (k === 'DUE' ? 'bg-white text-red-600 shadow-sm' : k === 'CLEARED' ? 'bg-white text-emerald-600 shadow-sm' : 'bg-white text-ink-primary shadow-sm')
                  : 'text-gray-500 hover:text-ink-primary'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients"
              className="h-10 w-56 pl-9 pr-3 rounded-xl bg-white border border-gray-200 text-[13px] text-ink-primary placeholder:text-gray-400 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            onClick={() => navigate('/bulk-add?type=clients')}
            className="h-10 px-4 rounded-xl bg-white border border-black/10 text-ink-primary text-[13px] font-bold flex items-center gap-2 hover:bg-black/[0.03] transition-all"
          >
            Bulk Add
          </button>
          {(topMetrics?.pendingCollections > 0) && (
            <button
              onClick={() => navigate('/clients/collect')}
              className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-[13px] font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all"
            >
              <CreditCard size={15} strokeWidth={2.6} /> Collect Cash
            </button>
          )}
          {/* Add button */}
          {hasPermission('clients', 'edit') && (
            <button
              onClick={openAdd}
              className="h-10 px-4 rounded-xl bg-amber-600 text-white text-[13px] font-bold flex items-center gap-2 hover:bg-amber-700 transition-all"
            >
              <Plus size={15} strokeWidth={2.6} /> New client
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
        <div className="bg-white rounded-2xl border border-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-14px_rgba(0,0,0,0.10)] overflow-hidden">
          {/* Column head */}
          <div className="grid grid-cols-[2fr_1.5fr_1.2fr_auto] gap-4 px-6 py-3 border-b border-black/5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Client</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contact</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Outstanding</span>
            <span className="w-32 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right" />
          </div>

          <div className="divide-y divide-black/5">
          {filteredClients.map((client) => {
            const stats = clientStats[client.id] || { totalSales: 0, orderCount: 0 };
            const outstanding = client.outstanding_balance || 0;
            const cleared = outstanding <= 0;
            const pendingDelivCount = clientDeliveries.filter(d => d.client_id === client.id && d.delivery_status === 'PENDING').length;
            const inTransitCount   = clientDeliveries.filter(d => d.client_id === client.id && d.delivery_status === 'IN_TRANSIT').length;

            return (
              <div
                key={client.id}
                onClick={() => (onViewStatement ? onViewStatement(client) : goToSettle(client.id))}
                className="grid grid-cols-[2fr_1.5fr_1.2fr_auto] gap-4 items-center px-6 py-4 hover:bg-stone-50/70 transition-colors group cursor-pointer"
              >
                {/* Client + meta */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200/70 flex items-center justify-center text-[13px] font-mono font-bold text-amber-700">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink-primary truncate leading-tight">{client.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[12px] text-gray-400">
                      {client.state && <span className="capitalize">{client.state.toLowerCase()}</span>}
                      {client.state && <span className="opacity-40">·</span>}
                      <span className="font-mono">{sym}{Math.round(stats.totalSales).toLocaleString('en-IN')}</span>
                      <span>lifetime</span>
                      {inTransitCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full ml-0.5">
                          <Truck size={8} /> {inTransitCount}
                        </span>
                      )}
                      {pendingDelivCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                          <Truck size={8} /> {pendingDelivCount}
                        </span>
                      )}
                      {client.gstin && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded ml-0.5">
                          <ShieldCheck size={8} /> GST
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div className="min-w-0">
                  {client.phone ? (
                    <div className="flex items-center gap-2 text-[13px] text-gray-600">
                      <Phone size={12} className="text-gray-300 shrink-0" />
                      <span className="font-mono truncate">{client.phone}</span>
                    </div>
                  ) : client.email ? (
                    <div className="flex items-center gap-2 text-[13px] text-gray-600 min-w-0">
                      <Mail size={12} className="text-gray-300 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  ) : client.address ? (
                    <div className="flex items-center gap-2 text-[13px] text-gray-500 min-w-0">
                      <MapPin size={12} className="text-gray-300 shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </div>
                  ) : (
                    <span className="text-[13px] text-gray-300">—</span>
                  )}
                </div>

                {/* Outstanding — dot + word (negative = advance credit) */}
                <div className="text-right">
                  {outstanding < 0 ? (
                    <>
                      <div className="font-mono text-[15px] font-bold tabular-nums text-emerald-600 leading-none">
                        {sym}{Math.round(Math.abs(outstanding)).toLocaleString('en-IN')}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[11px] font-semibold text-emerald-600">Advance</span>
                      </div>
                    </>
                  ) : cleared ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[12px] font-semibold text-gray-400">Cleared</span>
                    </div>
                  ) : (
                    <>
                      <div className="font-mono text-[15px] font-bold tabular-nums text-ink-primary leading-none">
                        {sym}{Math.round(outstanding).toLocaleString('en-IN')}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-[11px] font-semibold text-red-500">Unpaid</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions — Settle (when owed) + edit/delete on hover */}
                <div className="w-32 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                  {!cleared && (
                    <button
                      onClick={() => goToSettle(client.id)}
                      title="Settle account"
                      className="h-7 px-3 rounded-lg bg-ink-primary text-white text-[11px] font-bold hover:bg-black transition-all"
                    >
                      Settle
                    </button>
                  )}
                  {hasPermission('clients', 'edit') && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(client)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all"
                        title="Edit"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => { if (window.confirm('Delete this client permanently?')) handleDelete(client.id); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDirectory;
