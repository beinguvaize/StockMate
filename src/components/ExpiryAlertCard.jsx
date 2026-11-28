import React, { useEffect, useState } from 'react';
import { TimerReset } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';

// Dashboard alert: batches expired or expiring within 30 days.
// Hidden entirely when nothing is at risk (or no dated batches exist).
const ExpiryAlertCard = () => {
  const { currentTenantId } = useTenant();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!currentTenantId) { setStats(null); return; }
    let cancelled = false;

    (async () => {
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      // Filter by tenant explicitly. The RLS policy on product_batches reads
      // `is_global_admin() OR tenant_id = current_tenant_id()`, so relying on it
      // alone made a global admin — including one impersonating a tenant — count
      // every tenant's batches into one total.
      const { data, error } = await supabase
        .from('product_batches')
        .select('expiry_date, qty_remaining, unit_cost')
        .eq('tenant_id', currentTenantId)
        .not('expiry_date', 'is', null)
        .gt('qty_remaining', 0)
        .lte('expiry_date', in30);

      if (cancelled) return;
      if (error) { console.error('[expiry] alert query failed:', error.message, error); return; }

      // Clear on an empty result rather than returning early: the card must
      // disappear once the last at-risk batch is sold or written off, not
      // linger until the next full reload.
      if (!data?.length) { setStats(null); return; }

      const today = new Date().toISOString().slice(0, 10);
      const expired = data.filter(b => b.expiry_date < today).length;
      const soon = data.length - expired;
      const value = data.reduce((s, b) => s + Number(b.qty_remaining) * Number(b.unit_cost || 0), 0);
      setStats({ expired, soon, value });
    })();

    return () => { cancelled = true; };
  }, [currentTenantId]);

  if (!stats) return null;

  // Web redesign: an amber row beside the announcement, with "Review".
  // Same figures and the same destination (Reports, Expiry Tracking).
  const sym = '₹';
  return (
    <button
      type="button"
      data-card
      // In-app navigation. goHref() sets window.location and reloads the whole
      // SPA, which is right for an impersonation switch but heavy for a card.
      onClick={() => navigate('/reports')}
      title="Open Reports, Expiry Tracking"
      className="m-press w-full min-w-0 text-left flex items-center gap-3 rounded-xl bg-amber-soft py-[11px] pl-3.5 pr-3 text-[13.5px]"
    >
      <span className="grid place-items-center size-7 shrink-0 rounded-lg bg-surface text-amber-text">
        <TimerReset size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        {stats.expired > 0 && <b className="font-tight font-semibold text-ink">{stats.expired} batch{stats.expired === 1 ? '' : 'es'} expired</b>}
        {stats.expired > 0 && stats.soon > 0 && ' and '}
        {stats.soon > 0 && (stats.expired > 0
          ? `${stats.soon} expire within 30 days`
          : <b className="font-tight font-semibold text-ink">{stats.soon} expiring within 30 days</b>)}
        <span className="text-body">, {sym}{Math.round(stats.value).toLocaleString('en-IN')} of stock at risk</span>
      </span>
      <span className="shrink-0 font-tight text-[13px] font-semibold text-amber-text">Review</span>
    </button>
  );
};

export default ExpiryAlertCard;
