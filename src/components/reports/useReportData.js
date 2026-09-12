import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { realtimeEnabled } from '../../lib/realtime';

/**
 * useReportData - Custom hook for premium report data fetching with Database Sync (Realtime)
 * 
 * @param {Object} options 
 * @param {string} options.table - The Supabase table name
 * @param {string} options.select - The select string (inc. joins)
 * @param {Object} options.filters - Current filter state { dateRange, client, status, etc. }
 * @param {string} options.dateColumn - The column name for date filtering
 */
// Every table reports read from soft-deletes via deleted_at. The hook applies
// the filter automatically for these; without it, 19 of 21 operations reports
// were counting deleted rows (audited live: 5 deleted sales worth ₹6,240 and
// 7 deleted client payments were inflating revenue and client statements).
// Callers can still pass their own nullFilters; this is the safety net.
const SOFT_DELETE_TABLES = new Set([
  'sales', 'expenses', 'purchases', 'products', 'clients', 'suppliers',
  'client_payments', 'invoices', 'product_batches', 'sale_batch_consumption',
  'users', 'vehicles', 'routes', 'employees', 'payroll', 'serial_numbers',
  'inventory_balances', 'movement_log', 'sales_returns', 'day_book',
]);

const useReportData = ({
  table,
  select = '*',
  filters = {},
  dateColumn = 'date',
  params = {}, // Additional static equality params
  nullFilters = {}, // Columns that must be NULL e.g. { deleted_at: null }
  skipTenantFilter = false, // Opt-out for global/admin reports
  rowLimit = 5000 // Hard cap; nothing in the report layer was bounded before
}) => {
  const { currentTenantId } = useTenant();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Ref to track if component is mounted to prevent state updates on unmount
  const isMounted = useRef(true);

  const fetchData = useCallback(async (isSilent = false) => {
    // Wait for tenant context to resolve before firing any query. Skipping
    // this guard lets the report briefly fetch across all tenants before
    // RLS kicks in — a defence-in-depth regression we avoid here.
    if (!skipTenantFilter && !currentTenantId) {
      if (isMounted.current) setLoading(false);
      return;
    }
    if (!isSilent) setLoading(true);
    if (isMounted.current) setError(null);

    try {
      let query = supabase.from(table).select(select);

      // Tenant scoping (defence-in-depth; RLS still enforces at DB level).
      if (!skipTenantFilter && currentTenantId) {
        query = query.eq('tenant_id', currentTenantId);
      }

      // 1. Date Range Filtering (Absolute Logic)
      if (filters.dateRange) {
        const { start, end } = filters.dateRange;
        if (start) query = query.gte(dateColumn, start);
        if (end) query = query.lte(dateColumn, end);
      }

      // 2. Dynamic Filtering Logic
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'dateRange' || value === undefined || value === null || value === 'ALL') return;
        query = query.eq(key, value);
      });

      // 3. Static Params Injection
      Object.entries(params).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      // 4. Null Filters (e.g. soft-delete: deleted_at IS NULL)
      Object.keys(nullFilters).forEach((key) => {
        query = query.is(key, null);
      });

      // 5. Automatic soft-delete exclusion for known tables (see
      // SOFT_DELETE_TABLES above). Skipped when the caller already filtered.
      if (SOFT_DELETE_TABLES.has(table) && !('deleted_at' in nullFilters)) {
        query = query.is('deleted_at', null);
      }

      // Nothing in the report layer was bounded, so a report over a wide date
      // range could ask for the entire table. Cap it, and surface truncation
      // rather than silently showing a partial total as if it were complete.
      const { data: result, error: fetchError } = await query.limit(rowLimit);

      if (fetchError) throw fetchError;

      if (result && result.length === rowLimit) {
        console.warn(
          `[useReportData] ${table} hit the ${rowLimit}-row cap — figures on this report may be incomplete. Narrow the date range or raise rowLimit.`
        );
      }

      if (isMounted.current) {
        setData(result || []);
        setLastUpdated(new Date().toISOString());
      }

    } catch (err) {
      console.error(`[Matrix-Sync] Error synchronizing ${table}:`, err);
      if (isMounted.current) {
        setError(err.message || 'Synchronization conflict. Please check terminal connection.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [table, select, JSON.stringify(filters), dateColumn, JSON.stringify(params), JSON.stringify(nullFilters), currentTenantId, skipTenantFilter, rowLimit]);

  // Initial Fetch on Perspective Change
  useEffect(() => {
    isMounted.current = true;
    fetchData();

    return () => {
      isMounted.current = false;
    };
  }, [table, select, JSON.stringify(filters), JSON.stringify(params), JSON.stringify(nullFilters), currentTenantId, skipTenantFilter]);

  // --- DATABASE SYNC (Realtime) ---
  // Held in a ref so the subscription effect below does NOT depend on
  // fetchData. fetchData is rebuilt whenever filters change, so depending on
  // it tore the channel down and re-subscribed on every date-preset click.
  // Each re-subscribe makes Supabase Realtime re-evaluate its publication
  // tables — measured at 18k calls / 523s of database time on prod.
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  useEffect(() => {
    if (!skipTenantFilter && !currentTenantId) return undefined;

    // Scoped to this tenant. Previously subscribed with no filter at all, so
    // every write by every tenant in the database was replicated to every
    // client and triggered a full refetch here.
    // Realtime policy: see src/lib/realtime.js
    if (!realtimeEnabled('reports')) return;
    const channel = supabase
      .channel(`report_${table}_${currentTenantId || 'global'}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(skipTenantFilter || !currentTenantId
            ? {}
            : { filter: `tenant_id=eq.${currentTenantId}` }),
        },
        () => {
          // Silent revalidation — no loader, no layout shift.
          if (!document.hidden) fetchDataRef.current?.(true);
        }
      )
      .subscribe();

    // No polling fallback. Realtime covers live changes, and the shared
    // useRefetchOnFocus hook already refreshes on tab focus. The old 60s
    // interval re-ran every mounted report's full query every minute for as
    // long as the page stayed open.
    return () => { supabase.removeChannel(channel); };
  }, [table, currentTenantId, skipTenantFilter]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refetch: () => fetchData() // Explicit manual sync
  };
};

export default useReportData;
