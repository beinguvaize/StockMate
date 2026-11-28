import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { hydrateSales } from '../lib/saleLines';
import { rankTopSelling } from '../lib/topSelling';

// Only what the ranking reads: the void flags and the lines (from the
// sale_items table, with the blob as the fallback hydrateSale already uses).
const SELECT = 'id, date, status, "paymentStatus", voided_at, items, '
  + 'sale_items(line_no, product_id, product_name, quantity, rate)';

/**
 * The period's sales lines, for the top-selling ranking (lib/topSelling.js).
 * Read-only. `range` is { start, end } business dates, or null for all time.
 *
 * Returns { sales, loading, error, refetch }. A failed read keeps `error` so
 * the card says it could not load, rather than "No items sold".
 */
export default function useTopSellingSales(tenantId, range) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const start = range?.start || null;
  const end = range?.end || null;

  const load = useCallback(async () => {
    if (!tenantId) return;
    const mine = ++seq.current;
    setLoading(true);
    const res = await fetchAllPages(() => {
      let q = supabase.from('sales').select(SELECT)
        .eq('tenant_id', tenantId).is('deleted_at', null);
      if (start) q = q.gte('date', start);
      if (end) q = q.lte('date', end);
      return q.order('date', { ascending: false });
    }, { label: 'sales (top selling)' }).catch(err => ({ data: [], error: err }));
    if (mine !== seq.current) return;   // a newer period was asked for
    if (res.error) {
      console.error('[topSelling] sales read failed:', res.error?.message || res.error, res.error);
      setError(res.error?.message || 'Read failed');
    } else {
      setError(null);
      setSales(hydrateSales(res.data || []));
    }
    setLoading(false);
  }, [tenantId, start, end]);

  useEffect(() => { load(); }, [load]);
  return { sales, loading, error, refetch: load };
}

/** The ranking for a period, ready to draw. */
export function useTopSellingItems(tenantId, range, opts) {
  const q = useTopSellingSales(tenantId, range);
  const by = opts?.by, limit = opts?.limit;
  const ranked = useMemo(() => rankTopSelling(q.error ? [] : q.sales, { by, limit }), [q.sales, q.error, by, limit]);
  return { ...q, ...ranked };
}
