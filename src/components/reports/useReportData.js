import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';

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
  skipTenantFilter = false // Opt-out for global/admin reports
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

      const { data: result, error: fetchError } = await query;

      if (fetchError) throw fetchError;

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
  }, [table, select, JSON.stringify(filters), dateColumn, JSON.stringify(params), JSON.stringify(nullFilters), currentTenantId, skipTenantFilter]);

  // Initial Fetch on Perspective Change
  useEffect(() => {
    isMounted.current = true;
    fetchData();

    return () => {
      isMounted.current = false;
    };
  }, [table, select, JSON.stringify(filters), JSON.stringify(params), JSON.stringify(nullFilters), currentTenantId, skipTenantFilter]);

  // --- STRICT DATABASE SYNC (Realtime) ---
  useEffect(() => {
    // 1. Create a logical channel for this reporting node
    const channel = supabase
      .channel(`sync_${table}_node`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: table 
        },
        (payload) => {
          console.info(`[Matrix-Sync] Remote update detected in ${table}. Synchronizing...`);
          // Trigger silent revalidation to update the UI without showing a loader
          if (!document.hidden) {
            fetchData(true);
          }
        }
      )
      .subscribe();

    // 2. Background Revalidation Fallback (Safety Buffer)
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchData(true);
      }
    }, 60000); // 1-minute safety revalidation for non-realtime changes

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [table, fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refetch: () => fetchData() // Explicit manual sync
  };
};

export default useReportData;
