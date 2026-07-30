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
          <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-accent-signature/20 blur-2xl pointer-events-none" />
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-accent-signature/70">
            <TrendingUp size={11} /> Total Receivables
          </div>
          <div className="tabular-nums text-[26px] font-bold text-white mt-1 leading-none">
            <span className="text-base text-accent-signature/70 mr-0.5">{sym}</span>{Math.round(topMetrics.totalReceivables || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-white/40 tabular-nums mt-1.5">
            {topMetrics.pendingCollections || 0} accounts pending
          </div>
        </div>

        {/* Total clients */}
        <div className="rounded-2xl bg-white border border-black/5 px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-muted grid place-items-center text-muted-foreground"><Users size={14} /></div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Total Clients</div>
            <div className="tabular-nums text-xl font-bold leading-none text-ink-primary mt-0.5">{filteredClients.length}</div>
          </div>
        </div>

        {/* Top debtor */}
        <div className="rounded-2xl bg-white border border-black/5 px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-accent-signature/10 grid place-items-center text-accent-signature"><CreditCard size={14} /></div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Top Debtor</div>
            <div className="tabular-nums text-lg font-bold leading-none text-red-600 mt-0.5">
              <span className="text-sm text-red-400 mr-0.5">{sym}</span>{Math.round(topMetrics.topDebtor?.amount || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">{topMetrics.topDebtor?.name && topMetrics.topDebtor.name !== 'None' ? topMetrics.topDebtor.name : 'No exposure'}</div>
          </div>
        </div>

        {/* Pending collections */}
        <div className="rounded-2xl bg-white border border-black/5 px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-muted grid place-items-center text-muted-foreground"><Clock size={14} /></div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Pending</div>
            <div className="tabular-nums text-xl font-bold leading-none text-ink-primary mt-0.5">{topMetrics.pendingCollections || 0}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">collections</div>
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
                statusFilter === f ? 'bg-white text-ink-primary shadow-sm' : 'text-muted-foreground hover:text-ink-primary'
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
                  : 'text-muted-foreground hover:text-ink-primary'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search clients"
              className="h-10 w-56 pl-9 pr-3 rounded-xl bg-white border border-border text-[13px] text-ink-primary placeholder:text-muted-foreground outline-none focus:border-accent-signature/70 focus:ring-4 focus:ring-accent-signature/10 transition-all"
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
              className="h-10 px-4 rounded-xl bg-accent-signature text-white text-[13px] font-bold flex items-center gap-2 hover:bg-accent-signature-hover transition-all"
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
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Client</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Contact</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Outstanding</span>
            <span className="w-32 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right" />
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
                  <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-accent-signature/10 to-accent-signature/15 border border-accent-signature/20 flex items-center justify-center text-[13px] tabular-nums font-bold text-accent-signature-hover">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink-primary truncate leading-tight">{client.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[12px] text-muted-foreground">
                      {client.state && <span className="capitalize">{client.state.toLowerCase()}</span>}
                      {client.state && <span className="opacity-40">·</span>}
                      <span className="tabular-nums">{sym}{Math.round(stats.totalSales).toLocaleString('en-IN')}</span>
                      <span>lifetime</span>
                      {inTransitCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full ml-0.5">
                          <Truck size={8} /> {inTransitCount}
                        </span>
                      )}
                      {pendingDelivCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-accent-signature bg-accent-signature/10 border border-accent-signature/15 px-1.5 py-0.5 rounded-full">
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
                    <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
                      <Phone size={12} className="text-muted-foreground shrink-0" />
                      <span className="tabular-nums truncate">{client.phone}</span>
                    </div>
                  ) : client.email ? (
                    <div className="flex items-center gap-2 text-[13px] text-ink-secondary min-w-0">
                      <Mail size={12} className="text-muted-foreground shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  ) : client.address ? (
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
                      <MapPin size={12} className="text-muted-foreground shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </div>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">—</span>
                  )}
                </div>

                {/* Outstanding — dot + word (negative = advance credit) */}
                <div className="text-right">
                  {outstanding < 0 ? (
                    <>
                      <div className="text-[15px] font-bold tabular-nums text-emerald-600 leading-none">
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
                      <span className="text-[12px] font-semibold text-muted-foreground">Cleared</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-[15px] font-bold tabular-nums text-ink-primary leading-none">
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
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-all"
                        title="Edit"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => { if (window.confirm('Delete this client permanently?')) handleDelete(client.id); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-all"
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
