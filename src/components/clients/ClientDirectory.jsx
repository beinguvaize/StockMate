import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import {
  UserCircle, Plus, Edit3, Trash2, Check,
  Phone, AlertCircle, Search, TrendingUp, Users, CreditCard, Clock,
  Mail, Receipt, MapPin, ShieldCheck, FileText
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

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Clients',
            value: filteredClients.length,
            suffix: 'Accounts',
            icon: <Users size={36} strokeWidth={1.5} />,
            color: 'text-accent-signature',
          },
          {
            label: 'Total Receivables',
            value: `${sym}${Math.round(topMetrics.totalReceivables || 0).toLocaleString()}`,
            icon: <CreditCard size={36} strokeWidth={1.5} />,
            color: 'text-ink-primary',
          },
          {
            label: 'Top Debtor',
            value: `${sym}${Math.round(topMetrics.topDebtor?.amount || 0).toLocaleString()}`,
            sub: topMetrics.topDebtor?.name !== 'None' ? topMetrics.topDebtor?.name : 'No Exposure',
            icon: <TrendingUp size={36} strokeWidth={1.5} />,
            color: 'text-red-400',
          },
          {
            label: 'Pending Collections',
            value: topMetrics.pendingCollections || 0,
            suffix: 'Accounts',
            icon: <Clock size={36} strokeWidth={1.5} />,
            color: 'text-orange-400',
          },
        ].map((m, i) => (
          <div key={i} className="p-5 bg-white border border-black/5 rounded-[1.5rem] shadow-sm relative overflow-hidden group hover:border-black/10 transition-all flex flex-col justify-center">
            <div className={`absolute top-4 right-4 opacity-[0.07] group-hover:opacity-[0.13] transition-opacity pointer-events-none ${m.color}`}>
              {m.icon}
            </div>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-1">{m.label}</span>
            <div className="text-2xl font-black text-ink-primary tabular-nums leading-tight">
              {m.value}
              {m.suffix && <span className="text-xs font-bold opacity-30 ml-1">{m.suffix}</span>}
            </div>
            {m.sub && <div className="text-[10px] font-semibold text-gray-500 mt-1 truncate">{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between bg-white border border-black/5 rounded-[2rem] shadow-sm p-2 gap-2">
        {/* Status filter */}
        <div className="flex bg-canvas border border-black/5 rounded-pill p-1.5 shrink-0">
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
              className="w-full h-11 pl-10 pr-4 rounded-pill bg-canvas border border-black/5 shadow-inner text-xs font-bold text-ink-primary placeholder:text-gray-400 outline-none focus:border-black/20 focus:bg-white transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Add button */}
          {hasPermission('clients', 'edit') && (
            <button
              onClick={openAdd}
              className="btn-signature h-11 !rounded-pill !pl-5 !pr-2 flex items-center gap-3 shrink-0"
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
        <div className="bg-white p-24 rounded-[2.5rem] text-center border border-black/5 shadow-sm">
          <UserCircle size={56} className="mx-auto mb-4 opacity-10" strokeWidth={1} />
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No clients found</p>
          {hasPermission('clients', 'edit') && (
            <button onClick={openAdd} className="mt-6 btn-signature !h-11 !rounded-pill !px-8 text-xs font-bold">
              ADD FIRST CLIENT
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredClients.map(client => {
            const stats = clientStats[client.id] || { totalSales: 0, orderCount: 0 };
            const outstanding = client.outstanding_balance || 0;
            const cleared = outstanding <= 0;
            const collected = stats.totalSales > 0
              ? Math.max(0, Math.min(100, (stats.totalSales - outstanding) / stats.totalSales * 100))
              : 100;

            return (
              <div
                key={client.id}
                className="bg-white rounded-[2rem] border border-black/5 hover:border-black/10 hover:shadow-lg transition-all duration-300 flex flex-col overflow-hidden shadow-sm"
              >
                {/* Card Header */}
                <div className="p-5 pb-4 border-b border-black/5">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-accent-signature/15 border border-accent-signature/25 flex items-center justify-center text-lg font-black text-ink-primary shrink-0">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-ink-primary leading-tight">{client.name}</h3>
                        <div className="text-[10px] font-semibold text-gray-400 font-mono tracking-wide mt-0.5">
                          {stats.orderCount} {stats.orderCount === 1 ? 'order' : 'orders'}
                        </div>
                      </div>
                    </div>
                    {hasPermission('clients', 'edit') && (
                      <button
                        onClick={() => openEdit(client)}
                        className="p-2 rounded-full bg-canvas border border-black/5 hover:bg-black/5 text-gray-400 hover:text-ink-primary transition-all"
                        title="Edit"
                      >
                        <Edit3 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Contact Info */}
                <div className="px-5 py-4 flex flex-col gap-2 border-b border-black/5">
                  {/* Contact + Phone grid */}
                  {(client.contact || client.phone) && (
                    <div className="grid grid-cols-2 gap-2">
                      {client.contact && (
                        <div className="bg-canvas rounded-xl p-3">
                          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <UserCircle size={10} /> Contact
                          </div>
                          <div className="text-xs font-bold text-ink-primary truncate">{client.contact}</div>
                        </div>
                      )}
                      {client.phone && (
                        <div className="bg-canvas rounded-xl p-3">
                          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Phone size={10} /> Phone
                          </div>
                          <div className="text-xs font-bold text-ink-primary tabular-nums">{client.phone}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Email */}
                  {client.email && (
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-500">
                      <Mail size={11} className="opacity-60 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {/* Address */}
                  {client.address && (
                    <div className="flex items-start gap-2 text-[11px] font-semibold text-gray-500">
                      <MapPin size={11} className="opacity-60 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{client.address}</span>
                    </div>
                  )}
                  {/* GST badge */}
                  {client.gstin && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-[9px] font-bold text-blue-600 tracking-wider uppercase">
                        <ShieldCheck size={10} /> GST · {client.gstin}
                      </span>
                      {client.state && (
                        <span className="text-[10px] font-semibold text-gray-400">{client.state}{client.state_code ? ` (${client.state_code})` : ''}</span>
                      )}
                    </div>
                  )}
                  {!client.contact && !client.phone && !client.email && !client.address && (
                    <p className="text-[11px] text-gray-400 font-semibold">No contact info on record.</p>
                  )}
                </div>

                {/* Financials */}
                <div className="px-5 py-4 flex-1">
                  <div className="flex justify-between items-end mb-3">
                    <div>
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Lifetime Revenue</div>
                      <div className="text-2xl font-black text-ink-primary tabular-nums leading-none">
                        {sym}{Math.round(stats.totalSales).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Outstanding</div>
                      <div className={`text-2xl font-black tabular-nums leading-none ${cleared ? 'text-green-500' : 'text-red-500'}`}>
                        {sym}{Math.round(outstanding).toLocaleString()}
                      </div>
                      <div className={`text-[9px] font-bold mt-1 flex items-center justify-end gap-1 ${cleared ? 'text-green-600' : 'text-red-500'}`}>
                        {cleared ? <><Check size={10} /> Cleared</> : <><AlertCircle size={10} /> Unpaid</>}
                      </div>
                    </div>
                  </div>

                  {/* Collection progress bar */}
                  <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${cleared ? 'bg-green-400' : 'bg-accent-signature'}`}
                      style={{ width: `${collected}%` }}
                    />
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="px-5 pb-5 pt-2 flex items-center gap-2">
                  <button
                    onClick={() => goToSettle(client.id)}
                    className="flex-1 py-3 px-4 rounded-xl bg-ink-primary text-accent-signature text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    <Receipt size={13} /> Settle Account
                  </button>
                  {hasPermission('clients', 'edit') && (
                    <button
                      onClick={() => { if (window.confirm('Delete this client permanently?')) handleDelete(client.id); }}
                      className="w-10 h-10 rounded-xl border border-red-200 bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
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
