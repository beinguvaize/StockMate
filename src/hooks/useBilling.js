// Billing core (Phase 1) — read a tenant's subscription + derived state.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const DAY = 86400000;

export function useBilling(tenantId) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSub = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    const { data } = await supabase
      .from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle();
    setSubscription(data || null);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchSub(); }, [fetchSub]);

  const status = subscription?.status || 'TRIAL';
  const trialEnd = subscription?.trial_end ? new Date(subscription.trial_end) : null;
  const trialDaysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / DAY) : null;
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;

  // Effective gate: trial expired (past trial_end and not active) or status flags.
  const trialExpired = status === 'TRIAL' && trialEnd && trialEnd.getTime() < Date.now();
  const expired = status === 'EXPIRED' || status === 'CANCELLED' || trialExpired;
  const pastDue = status === 'PAST_DUE';
  const trialEndingSoon = status === 'TRIAL' && trialDaysLeft != null && trialDaysLeft <= 5 && trialDaysLeft >= 0;

  return {
    subscription, loading, refresh: fetchSub,
    status, trialDaysLeft, periodEnd,
    expired, pastDue, trialEndingSoon,
    // hard block only when fully expired/cancelled; past_due = grace (banner only).
    blocked: expired,
  };
}
