import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * useReportData - Custom hook for premium report data fetching with Database Sync (Realtime)
 * 
 * @param {Object} options 
 * @param {string} options.table - The Supabase table name
 * @param {string} options.select - The select string (inc. joins)
 * @param {Object} options.filters - Current filter state { dateRange, client, status, etc. }
 * @param {string} options.dateColumn - The column name for date filtering
 */
const useReportData = ({ 
  table, 
  select = '*', 
  filters = {}, 
  dateColumn = 'date',
  params = {} // Additional static params
}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Ref to track if component is mounted to prevent state updates on unmount
  const isMounted = useRef(true);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    if (isMounted.current) setError(null);

    try {
      let query = supabase.from(table).select(select);

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
  }, [table, select, JSON.stringify(filters), dateColumn, JSON.stringify(params)]);

  // Initial Fetch on Perspective Change
  useEffect(() => {
    isMounted.current = true;
    fetchData();
    
    return () => {
      isMounted.current = false;
    };
  }, [table, select, JSON.stringify(filters), JSON.stringify(params)]);

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
