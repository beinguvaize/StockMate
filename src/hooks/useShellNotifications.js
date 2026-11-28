import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useDashboardKpis } from './useDashboardKpis';
import useRefetchOnFocus from './useRefetchOnFocus';
import { deriveNotifications } from '../lib/shellNotifications';
import { formatCurrency } from '../lib/utils';

/**
 * The bell's lines (lib/shellNotifications) and the reads behind them.
 *
 *   - get_dashboard_kpis, shared with the Dashboard (useDashboardKpis)
 *   - two count-only reads for the expiry line, with exactly the
 *     Dashboard expiry alert's definition (ExpiryAlertCard): this shop's
 *     batches with stock left and an expiry date on or before 30 days from
 *     now; "expired" is the part dated before today. Count-only (head), so
 *     no rows come back however many batches a shop has.
 *
 * Read again when the tab comes back after a while and when the panel is
 * opened (`refresh`). Errors are kept, never turned into "nothing".
 */
export function useShellNotifications({ tenantId, gates, basePath = '' }) {
  const kpis = useDashboardKpis(tenantId, { enabled: !!gates?.kpis });
  const wantExpiry = !!tenantId && !!gates?.notify?.expiry;
  const [expiry, setExpiry] = useState({ data: null, error: null, at: null });
  const seq = useRef(0);

  const loadExpiry = useCallback(async () => {
    if (!wantExpiry) { setExpiry({ data: null, error: null, at: null }); return; }
    const mine = ++seq.current;
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const base = () => supabase.from('product_batches')
      .select('expiry_date', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('expiry_date', 'is', null)
      .gt('qty_remaining', 0);
    try {
      const [atRisk, gone] = await Promise.all([
        base().lte('expiry_date', in30),
        base().lt('expiry_date', today),
      ]);
      if (atRisk.error) throw atRisk.error;
      if (gone.error) throw gone.error;
      if (mine !== seq.current) return;
      const expired = gone.count ?? 0;
      setExpiry({ data: { expired, soon: Math.max(0, (atRisk.count ?? 0) - expired) }, error: null, at: new Date() });
    } catch (err) {
      console.error('[notifications] expiry count failed:', err?.message || err, err);
      if (mine !== seq.current) return;
      setExpiry(prev => ({ ...prev, error: err?.message || 'Read failed' }));
    }
  }, [tenantId, wantExpiry]);

  useEffect(() => { loadExpiry(); }, [loadExpiry]);

  const { refetch: refetchKpis } = kpis;
  const refresh = useCallback(() => { refetchKpis(); loadExpiry(); }, [refetchKpis, loadExpiry]);
  useRefetchOnFocus(refresh, 30_000);

  const list = useMemo(() => deriveNotifications({
    kpi: kpis.data,
    expiry: expiry.data,
    gates: gates?.notify || {},
    basePath,
    money: (n) => formatCurrency(Math.round(n)).replace(/\.00$/, ''),
  }), [kpis.data, expiry.data, gates, basePath]);

  // A source that failed and has no earlier answer: its lines are unknown.
  const failed = [
    gates?.kpis && kpis.error && !kpis.data ? 'shop figures' : null,
    wantExpiry && expiry.error && !expiry.data ? 'expiring stock' : null,
  ].filter(Boolean);
  const loading = (gates?.kpis && kpis.loading && !kpis.data) || (wantExpiry && !expiry.data && !expiry.error);

  const times = [expiry.at, kpis.fetchedAt].filter(Boolean).map(d => d.getTime());
  const checkedAt = times.length ? new Date(Math.max(...times)) : null;

  return { list, failed, loading, refresh, checkedAt };
}

export default useShellNotifications;
