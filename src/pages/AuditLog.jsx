/**
 * AuditLog Page
 *
 * Append-only activity trail viewer for Owners / Global Admins.
 * Reads from the `audit_log` table populated by the `log_audit_event` RPC.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AUDIT_ACTIONS } from '../lib/auditLog';
import {
  Shield, Search, Calendar, ChevronDown, ChevronLeft, ChevronRight,
  RefreshCw, Filter, X, Clock, User, Activity, FileText, AlertTriangle,
  Info, Eye
} from 'lucide-react';

/* ─── constants ─── */
const PAGE_SIZE = 25;

const ACTION_META = {
  [AUDIT_ACTIONS.ROLE_CHANGE]:       { label: 'Role Change',       color: 'purple', icon: Shield },
  [AUDIT_ACTIONS.PERMISSION_CHANGE]: { label: 'Permission Change', color: 'indigo', icon: Shield },
  [AUDIT_ACTIONS.USER_CREATE]:       { label: 'User Created',      color: 'emerald', icon: User },
  [AUDIT_ACTIONS.USER_DELETE]:       { label: 'User Deleted',      color: 'red',    icon: User },
  [AUDIT_ACTIONS.SALE_DELETE]:       { label: 'Sale Deleted',      color: 'amber',  icon: FileText },
  [AUDIT_ACTIONS.SALE_REFUND]:       { label: 'Sale Refund',       color: 'orange', icon: FileText },
  [AUDIT_ACTIONS.PAYROLL_PROCESS]:   { label: 'Payroll Processed', color: 'blue',   icon: Activity },
  [AUDIT_ACTIONS.PAYROLL_DELETE]:    { label: 'Payroll Deleted',   color: 'rose',   icon: Activity },
  [AUDIT_ACTIONS.TENANT_PLAN_CHANGE]:{ label: 'Plan Change',       color: 'teal',   icon: AlertTriangle },
};

const colorMap = {
  purple:  'bg-purple-50  text-purple-700  border-purple-200',
  indigo:  'bg-indigo-50  text-indigo-700  border-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red:     'bg-red-50     text-red-700     border-red-200',
  amber:   'bg-amber-50   text-amber-700   border-amber-200',
  orange:  'bg-orange-50  text-orange-700  border-orange-200',
  blue:    'bg-blue-50    text-blue-700    border-blue-200',
  rose:    'bg-rose-50    text-rose-700    border-rose-200',
  teal:    'bg-teal-50    text-teal-700    border-teal-200',
  gray:    'bg-gray-50    text-gray-700    border-gray-200',
};

/* ─── helpers ─── */
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const relativeTime = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
};

/* ═══════════════════════════════════════════════════════════════ */
const AuditLog = () => {
  const { currentUser } = useAuth();

  /* ── access gate ── */
  const roles = currentUser?.roles || (currentUser?.role ? [currentUser.role] : []);
  const isOwner = roles.includes('OWNER') || roles.includes('GLOBAL_ADMIN');

  /* ── state ── */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);

  // detail panel
  const [expandedId, setExpandedId] = useState(null);

  /* ── fetch ── */
  const fetchLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !isOwner) return;
    setLoading(true);
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // action filter
      if (actionFilter !== 'ALL') {
        query = query.eq('action', actionFilter);
      }

      // date range
      if (dateRange.start) {
        query = query.gte('created_at', `${dateRange.start}T00:00:00`);
      }
      if (dateRange.end) {
        query = query.lte('created_at', `${dateRange.end}T23:59:59`);
      }

      // search (actor_email or summary)
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        query = query.or(`actor_email.ilike.${term},summary.ilike.${term}`);
      }

      // pagination
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      setRows(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('[AuditLog] fetch error', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isOwner, actionFilter, dateRange, search, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [actionFilter, dateRange, search]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const actionOptions = useMemo(() =>
    Object.entries(ACTION_META).map(([value, { label }]) => ({ value, label })),
  []);

  const activeFilterCount = [
    actionFilter !== 'ALL',
    !!dateRange.start,
    !!dateRange.end,
    !!search.trim(),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setActionFilter('ALL');
    setDateRange({ start: '', end: '' });
  };

  /* ── access denied ── */
  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-32 opacity-20">
        <Shield size={64} strokeWidth={1} />
        <p className="text-sm font-black uppercase mt-6 tracking-widest text-center">
          Access Denied<br />Owner Clearance Required
        </p>
      </div>
    );
  }

  /* ── render ── */
  return (
    <div className="animate-fade-in flex flex-col gap-6 pb-20">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">
            AUDIT LOG<span className="text-accent-signature">.</span>
          </h1>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-4 bg-accent-signature rounded-full animate-pulse" />
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Immutable Activity Trail — {totalCount} Event{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(s => !s)}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-pill border text-[10px] font-black uppercase tracking-widest transition-all
              ${showFilters || activeFilterCount > 0
                ? 'bg-ink-primary text-white border-ink-primary shadow-lg'
                : 'bg-white border-black/5 text-gray-500 hover:border-black/10 hover:shadow-premium'}
            `}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 w-5 h-5 rounded-full bg-accent-signature text-ink-primary flex items-center justify-center text-[9px] font-black">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-pill bg-white border border-black/5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:shadow-premium transition-all disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-4 bg-white/60 backdrop-blur-xl p-4 rounded-[2rem] border border-black/5 shadow-glass animate-in slide-in-from-top-4 duration-300">

          {/* Search */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 shadow-sm px-4 py-2.5 rounded-pill flex-1 min-w-[220px]">
            <Search size={14} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or summary…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent border-none text-sm font-medium text-ink-primary outline-none w-full placeholder:text-gray-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-400 hover:text-ink-primary">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Action dropdown */}
          <div className="relative group">
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="appearance-none bg-white border border-black/5 px-5 py-2.5 pr-10 rounded-pill text-[10px] font-black uppercase tracking-widest text-ink-primary cursor-pointer hover:shadow-premium transition-all outline-none"
            >
              <option value="ALL">All Actions</option>
              {actionOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 bg-white border border-black/5 px-4 py-2.5 rounded-pill">
            <Calendar size={14} className="text-accent-signature" />
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="bg-transparent border-none text-[10px] font-black text-ink-primary outline-none uppercase font-mono"
            />
            <span className="text-gray-300 font-black px-1">/</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="bg-transparent border-none text-[10px] font-black text-ink-primary outline-none uppercase font-mono"
            />
          </div>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
            >
              <X size={12} />
              Clear All
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium">
        {/* Table header */}
        <div className="bg-ink-primary px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Activity size={20} className="text-accent-signature" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-widest">Activity Timeline</h3>
            <p className="text-white/50 text-[10px] font-bold">
              {totalCount} record{totalCount !== 1 ? 's' : ''} • Page {page + 1} of {Math.max(totalPages, 1)}
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        )}

        {/* Empty state */}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 opacity-40">
            <Info size={40} strokeWidth={1} />
            <p className="text-sm font-black uppercase mt-4 tracking-widest">No Events Found</p>
            <p className="text-xs text-gray-500 mt-1">
              {activeFilterCount > 0 ? 'Try adjusting your filters' : 'Audit events will appear here as actions occur'}
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && rows.length > 0 && (
          <div className="divide-y divide-black/5">
            {rows.map(row => {
              const meta = ACTION_META[row.action] || { label: row.action, color: 'gray', icon: Activity };
              const IconComponent = meta.icon;
              const isExpanded = expandedId === row.id;
              const colors = colorMap[meta.color] || colorMap.gray;

              return (
                <div key={row.id} className="group">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-canvas/50 transition-all"
                  >
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${colors}`}>
                      <IconComponent size={18} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-pill border ${colors}`}>
                          {meta.label}
                        </span>
                        {row.entity_type && (
                          <span className="text-[10px] font-bold text-gray-400 uppercase">
                            {row.entity_type}
                            {row.entity_id ? ` #${row.entity_id.slice(0, 8)}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-ink-primary mt-1 truncate">{row.summary || '—'}</p>
                    </div>

                    {/* Actor */}
                    <div className="hidden md:flex flex-col items-end shrink-0">
                      <span className="text-[11px] font-bold text-ink-primary">{row.actor_email || 'System'}</span>
                      <span className="text-[10px] text-gray-400">{relativeTime(row.created_at)}</span>
                    </div>

                    {/* Expand */}
                    <div className="shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors">
                      <Eye size={16} />
                    </div>
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-6 pb-5 animate-in slide-in-from-top-2 duration-200">
                      <div className="bg-canvas rounded-2xl p-5 ml-14 border border-black/5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Actor</p>
                            <p className="text-sm font-bold text-ink-primary">{row.actor_email || '—'}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{row.actor_id || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Timestamp</p>
                            <p className="text-sm font-bold text-ink-primary">{fmtDate(row.created_at)}</p>
                            <p className="text-[10px] text-gray-400">{fmtTime(row.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Tenant</p>
                            <p className="text-[10px] text-gray-400 font-mono">{row.tenant_id || '—'}</p>
                          </div>
                        </div>

                        {/* Metadata JSON */}
                        {row.metadata && Object.keys(row.metadata).length > 0 && (
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Metadata</p>
                            <div className="bg-ink-primary rounded-xl p-4 overflow-x-auto">
                              <pre className="text-[11px] text-accent-signature font-mono whitespace-pre-wrap break-all leading-relaxed">
                                {JSON.stringify(row.metadata, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 bg-canvas/30">
            <p className="text-[10px] font-bold text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-9 h-9 rounded-xl bg-white border border-black/5 flex items-center justify-center text-ink-primary hover:shadow-premium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>

              {/* Page numbers */}
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i;
                } else if (page < 3) {
                  pageNum = i;
                } else if (page > totalPages - 4) {
                  pageNum = totalPages - 5 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-9 h-9 rounded-xl text-[11px] font-black transition-all ${
                      page === pageNum
                        ? 'bg-ink-primary text-white shadow-lg'
                        : 'bg-white border border-black/5 text-gray-500 hover:shadow-premium'
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="w-9 h-9 rounded-xl bg-white border border-black/5 flex items-center justify-center text-ink-primary hover:shadow-premium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
