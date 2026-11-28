/**
 * Audit log (web redesign, approved mockups audit-01 to 08).
 *
 * Append-only activity trail for owners and global admins, read from
 * `audit_log` (written by the `log_audit_event` RPC). Reads only: the same
 * tenant-scoped, filtered, paged query as before, plus head-only counts for
 * the figure strip and the shop's login names for the "Who" column.
 * View rules: lib/auditView.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Filter, RefreshCw, Search, X, ChevronDown, ChevronLeft, ChevronRight, ShieldCheck, User, Trash2,
  RotateCcw, Banknote, CreditCard, Activity, Inbox, AlertTriangle, Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cn } from '../lib/utils';
import {
  PAGE_SIZE, actionMeta, actionOptions, blankFilters, activeFilterCount, applyAuditFilters, pageRange, pageNumbers,
  whenShort, whenLong, relativeTime, entityLine, actorOf, metadataLines, noMatchWords, eventsWord, shortId,
  weekStartDay, daysBackDay, dayWords, shopDayStartISO, MONEY_ACTIONS, LOGIN_ACTIONS,
} from '../lib/auditView';
import { FigureStrip, Figure, Eyebrow } from '../components/ui/FigureStrip';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const ICONS = { refund: RotateCcw, shield: ShieldCheck, trash: Trash2, pay: Banknote, user: User, plan: CreditCard, event: Activity };
const TONE = {
  rd: 'bg-bad-soft text-bad-text', am: 'bg-amber-soft text-amber-text', bl: 'bg-info-soft text-info-text', gr: 'bg-good-soft text-good-text', '': 'bg-tile text-ink-2',
};
const GRID = 'grid grid-cols-[36px_150px_minmax(0,1fr)_210px_120px_28px] items-center gap-3.5 px-[18px]';

const Empty = ({ icon: Icon, title, children, action, danger, className }) => (
  <div className={cn('px-5 pt-14 pb-[60px] text-center', className)}>
    <div className={cn('mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl', danger ? 'bg-bad-soft text-bad-text' : 'bg-tile text-body')}>
      <Icon size={24} strokeWidth={1.7} />
    </div>
    <h4 className="font-tight text-[17px] font-semibold">{title}</h4>
    <p className="mx-auto mt-1 mb-4 max-w-[440px] text-[13.5px] text-body">{children}</p>
    {action}
  </div>
);

const AuditLog = () => {
  const { currentUser } = useAuth();
  const { currentTenantId, currentTenant, businessProfile } = useTenant();

  const roles = currentUser?.roles || (currentUser?.role ? [currentUser.role] : []);
  const isOwner = roles.includes('OWNER') || roles.includes('GLOBAL_ADMIN');
  const shopName = businessProfile?.name || currentTenant?.name || 'This shop';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState(blankFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [strip, setStrip] = useState(null);       // { all, week, money, logins } or null while loading
  const [names, setNames] = useState({});

  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(0); };

  const fetchLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !isOwner || !currentTenantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Filter by tenant explicitly. The audit_log RLS policy reads
      // `is_global_admin() OR tenant_id = current_tenant_id()`, so a global
      // admin viewing this tenant-scoped page would otherwise see every
      // tenant's activity merged into one trail.
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false });
      query = applyAuditFilters(query, filters);
      const { from, to } = pageRange(page);
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      setRows(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('[AuditLog] fetch error', err?.message || err);
      setRows([]);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, isOwner, filters, page]);

  // Figure strip: head-only counts, never rows. A failed count shows a dash.
  const fetchStrip = useCallback(async () => {
    if (!isSupabaseConfigured || !isOwner || !currentTenantId) return;
    setStrip(null);
    const base = () => supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId);
    const weekFrom = shopDayStartISO(weekStartDay());
    const monthFrom = shopDayStartISO(daysBackDay(30));
    const settle = async (q) => { try { const { count, error } = await q; return error ? null : (count ?? 0); } catch { return null; } };
    const [all, week, money, logins] = await Promise.all([
      settle(base()),
      settle(base().gte('created_at', weekFrom)),
      settle(base().gte('created_at', monthFrom).in('action', MONEY_ACTIONS)),
      settle(base().gte('created_at', monthFrom).in('action', LOGIN_ACTIONS)),
    ]);
    setStrip({ all, week, money, logins });
  }, [currentTenantId, isOwner]);

  // Names for the "Who" column. Display only; an email shows if this fails.
  useEffect(() => {
    if (!isSupabaseConfigured || !isOwner || !currentTenantId) return;
    let live = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('users').select('id, name').eq('tenant_id', currentTenantId);
        if (!error && live) setNames(Object.fromEntries((data || []).filter((u) => u.name).map((u) => [u.id, u.name])));
      } catch { /* the email is shown instead */ }
    })();
    return () => { live = false; };
  }, [currentTenantId, isOwner]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { fetchStrip(); }, [fetchStrip]);

  const refresh = () => { fetchLogs(); fetchStrip(); };
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const options = useMemo(() => actionOptions(), []);
  const nFilters = activeFilterCount(filters);
  const clearFilters = () => { setFilters(blankFilters()); setPage(0); };

  if (!isOwner) {
    return (
      <Empty icon={Lock} title="The audit log is for the owner" className="pt-[120px]"
        action={<Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>}>
        It lists who changed what in the shop. Ask the owner if you need something checked.
      </Empty>
    );
  }

  const neverAny = !loading && !loadError && rows.length === 0 && nFilters === 0 && page === 0;
  const showStrip = !loadError && !neverAny;
  const dash = (v) => (strip === null || v === null || v === undefined ? '—' : v.toLocaleString('en-IN'));
  const weekDay = weekStartDay();

  return (
    <div className="flex flex-col pb-16">
      {showStrip && (
        <FigureStrip cols={4} className="m-rise mb-5">
          <Figure label="Events" value={dash(strip?.all)} sub="all time" />
          <Figure label="This week" value={dash(strip?.week)} sub={`since ${dayWords(weekDay, { weekday: true })}`} />
          <Figure label="Money changes" value={dash(strip?.money)} sub="refunds, voids, payroll, last 30 days" />
          <Figure label="Logins and roles" value={dash(strip?.logins)} sub="created, role, permission, last 30 days" />
        </FigureStrip>
      )}

      <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5" style={{ '--i': 1 }}>
        <span className="text-[13px] text-mute">Owners only. Kept for every change listed below; nothing here can be edited or deleted.</span>
        <div className="flex-1" />
        <Button variant={showFilters || nFilters > 0 ? 'dark' : 'secondary'} size="sm" aria-expanded={showFilters}
          onClick={() => setShowFilters((s) => !s)}>
          <Filter /> Filters
          {nFilters > 0 && <span className="ml-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-amber px-[5px] font-tight text-[11px] font-semibold text-white">{nFilters}</span>}
        </Button>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {showFilters && (
        <div className="m-rise mb-3 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-line bg-tile p-3">
          <div className="relative w-full sm:w-[300px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" size={16} />
            <input type="text" aria-label="Search by email or summary" placeholder="Search by email or summary" value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              className="h-9 w-full rounded-pill bg-surface pl-10 pr-9 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-mute transition-shadow duration-(--dur-press) focus:shadow-[inset_0_0_0_2px_var(--color-ink)]" />
            {filters.search && (
              <button type="button" aria-label="Clear search" onClick={() => setFilter('search', '')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-ink"><X size={14} /></button>
            )}
          </div>
          <label className="relative inline-flex h-9 items-center gap-1.5 rounded-pill bg-surface pl-3.5 pr-8 font-tight text-[13px] font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <em className="not-italic font-medium text-mute">Action</em>
            <select value={filters.action} onChange={(e) => setFilter('action', e.target.value)} aria-label="Action"
              className="appearance-none bg-transparent outline-none [field-sizing:content]">
              <option value="ALL">All</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 text-mute" />
          </label>
          <div className="flex items-center gap-1.5 text-[12.5px] text-mute">
            <Input type="date" aria-label="From" value={filters.start} onChange={(e) => setFilter('start', e.target.value)} className="h-9 w-auto text-[13px]" />
            to
            <Input type="date" aria-label="To" value={filters.end} onChange={(e) => setFilter('end', e.target.value)} className="h-9 w-auto text-[13px]" />
          </div>
          <div className="flex-1" />
          {nFilters > 0 && (
            <button type="button" onClick={clearFilters} className="font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-2">Clear all</button>
          )}
        </div>
      )}

      <div className="m-rise overflow-x-auto rounded-[14px] border border-line bg-surface" style={{ '--i': 2 }}>
        {loadError ? (
          <Empty icon={AlertTriangle} danger title="The audit log could not be loaded"
            action={<Button variant="secondary" onClick={refresh}><RefreshCw /> Try again</Button>}>
            The server did not answer: {String(loadError?.message || loadError || 'no reason given')}. Nothing is wrong with your records.
          </Empty>
        ) : neverAny ? (
          <Empty icon={Inbox} title="No events yet">
            Role changes, new logins, refunds, voided bills and payroll runs appear here as they happen.
          </Empty>
        ) : !loading && rows.length === 0 ? (
          <Empty icon={Search} title="Nothing matches these filters"
            action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}>
            {noMatchWords(filters)}
          </Empty>
        ) : (
          <div className="min-w-[760px]">
            <div className={cn(GRID, 'py-2.5 font-tight text-[12px] font-semibold text-mute')}>
              <span /><span>Action</span><span>What happened</span><span>Who</span><span>When</span><span />
            </div>
            {loading ? Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={cn(GRID, 'border-t border-sep py-3')} aria-hidden="true">
                <span className="h-8 w-8 rounded-[10px] bg-tile" />
                <span className="h-3 w-[110px] animate-pulse rounded-md bg-well" />
                <span className="h-3 animate-pulse rounded-md bg-well" style={{ width: `${[80, 62, 74, 55, 70, 66, 58, 77][i]}%` }} />
                <span className="h-3 w-[130px] animate-pulse rounded-md bg-well" />
                <span className="h-3 w-20 animate-pulse rounded-md bg-well" />
                <span />
              </div>
            )) : rows.map((row) => {
              const meta = actionMeta(row.action);
              const Icon = ICONS[meta.icon] || Activity;
              const open = expandedId === row.id;
              const who = actorOf(row, names);
              const long = whenLong(row.created_at);
              const details = metadataLines(row.metadata);
              return (
                <React.Fragment key={row.id}>
                  <button type="button" aria-expanded={open} onClick={() => setExpandedId(open ? null : row.id)}
                    className={cn(GRID, 'w-full border-t border-sep py-3 text-left transition-colors duration-(--dur-press) hover:bg-tile', open && 'bg-tile')}>
                    <span className={cn('grid h-8 w-8 place-items-center rounded-[10px]', TONE[meta.tone])}><Icon size={15} strokeWidth={1.9} /></span>
                    <span className="justify-self-start whitespace-nowrap rounded-pill bg-well px-[9px] py-[3px] font-tight text-[11.5px] font-semibold text-body">{meta.label}</span>
                    <span className="min-w-0">
                      <b className="block truncate text-[13.5px] font-medium text-ink">{row.summary || '—'}</b>
                      {entityLine(row) && <small className="text-[12px] text-mute">{entityLine(row)}</small>}
                    </span>
                    <span className="min-w-0">
                      <b className="block truncate font-tight text-[13px] font-semibold text-ink">{who.name}</b>
                      {who.sub && <small className="block truncate text-[12px] text-mute">{who.sub}</small>}
                    </span>
                    <span className="font-tight text-[12.5px] font-medium tabular-nums text-ink-2">
                      {whenShort(row.created_at)}
                      <small className="block font-medium text-mute">{relativeTime(row.created_at)}</small>
                    </span>
                    <ChevronDown size={15} aria-hidden="true" className={cn('chevron-turn text-mute', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="bg-tile px-[18px] pt-1 pb-[18px] pl-[68px]">
                      <div className="mb-3 grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
                          <Eyebrow>Done by</Eyebrow>
                          <b className="mt-0.5 block font-tight text-[13.5px] font-semibold">{who.name}</b>
                          <small className="block text-[12px] tabular-nums text-mute" title={row.actor_id || undefined}>
                            {[row.actor_email && who.name !== row.actor_email ? row.actor_email : null, row.actor_id ? `id ${shortId(row.actor_id)}` : null].filter(Boolean).join(' · ') || '—'}
                          </small>
                        </div>
                        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
                          <Eyebrow>When</Eyebrow>
                          <b className="mt-0.5 block font-tight text-[13.5px] font-semibold">{long.date}</b>
                          <small className="block text-[12px] tabular-nums text-mute">{long.time}</small>
                        </div>
                        <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
                          <Eyebrow>Shop</Eyebrow>
                          <b className="mt-0.5 block font-tight text-[13.5px] font-semibold">{row.tenant_id === currentTenantId ? shopName : 'Shop'}</b>
                          <small className="block text-[12px] tabular-nums text-mute" title={row.tenant_id || undefined}>{row.tenant_id ? `id ${shortId(row.tenant_id)}` : '—'}</small>
                        </div>
                      </div>
                      {details && (
                        <>
                          <Eyebrow className="mb-1.5 block">Details</Eyebrow>
                          <pre className="m-0 whitespace-pre-wrap break-all rounded-xl border border-line bg-surface px-3.5 py-3 font-mono text-[12.5px] leading-[1.55] text-ink-2">{details}</pre>
                        </>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {!loading && (
              <div className="flex items-center justify-between gap-3 border-t border-sep px-[18px] py-3 text-[13px] text-body">
                <span>
                  {totalPages > 1
                    ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString('en-IN')} · newest first`
                    : nFilters > 0 ? `${eventsWord(totalCount)} ${totalCount === 1 ? 'matches' : 'match'}` : `${eventsWord(totalCount)} · newest first`}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft /></Button>
                    {pageNumbers(page, totalPages).map((n) => (
                      <button key={n} type="button" onClick={() => setPage(n)} aria-current={page === n ? 'page' : undefined}
                        className={cn('m-press grid h-8 min-w-8 place-items-center rounded-pill px-2 font-tight text-[13px] font-semibold',
                          page === n ? 'bg-ink text-white' : 'text-ink-2 hover:bg-tile')}>
                        {n + 1}
                      </button>
                    ))}
                    <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}><ChevronRight /></Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
