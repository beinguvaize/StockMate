import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';

/**
 * Period P&L straight from get_pl_ranged — the same figures the books use.
 *
 * Reports must not recompute this in the client. The RPC nets returns off both
 * revenue and COGS (return cost priced from products.costPrice), applies the
 * tenant's tax_mode when splitting GST, and honours expenses.exclude_from_pl.
 * Reimplementing that here would be a second, drifting definition of profit —
 * which is how a report can quietly disagree with the books.
 *
 * Returns { pl, loading }; pl is null until loaded, then:
 * { revenue_net, output_gst, cogs, returns_total, expenses, gross_profit, net_profit }
 */
export default function usePLRanged(from, to) {
  const { currentTenantId } = useTenant();
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenantId || !from || !to) return undefined;
    let dead = false;
    setLoading(true);
    supabase
      .rpc('get_pl_ranged', { p_tenant_id: currentTenantId, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (dead) return;
        // Surface the reason — a silent catch here would show an empty P&L
        // strip that looks like "no trade this period" rather than a failure.
        if (error) console.error('[usePLRanged] get_pl_ranged failed:', error.message, error);
        setPl(error ? null : (Array.isArray(data) ? data[0] : data));
        setLoading(false);
      });
    return () => { dead = true; };
  }, [currentTenantId, from, to]);

  return { pl, loading };
}
