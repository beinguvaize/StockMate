import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * The Dashboard's figures from the get_dashboard_kpis RPC, shared.
 *
 * The Dashboard has always read this RPC; the side menu's low-stock count and
 * the notifications now read the SAME answer, so the number beside Inventory
 * and the one on the Dashboard cannot disagree. One answer per tenant is kept
 * here, one request is in flight at a time however many screens ask, and
 * every subscriber is told when it lands.
 *
 * Behaviour the Dashboard relied on is kept exactly: the same RPC, the same
 * arguments (p_date is today's date as the Dashboard computed it), and a
 * failed read keeps the last good answer rather than blanking it. The error
 * is now also kept, so a caller can tell "unknown" from "nothing".
 */
const stores = new Map();   // tenantId -> { data, error, loading, inflight, listeners }

const storeFor = (tenantId) => {
  if (!stores.has(tenantId)) {
    stores.set(tenantId, { data: null, error: null, loading: false, fetchedAt: null, inflight: null, listeners: new Set() });
  }
  return stores.get(tenantId);
};

const snapshot = (s) => ({ data: s.data, error: s.error, loading: s.loading, fetchedAt: s.fetchedAt });
const notify = (s) => { s.listeners.forEach(fn => fn()); };
const EMPTY = { data: null, error: null, loading: false, fetchedAt: null };

export function fetchDashboardKpis(tenantId) {
  if (!tenantId) return Promise.resolve(null);
  const s = storeFor(tenantId);
  if (s.inflight) return s.inflight;
  s.loading = true;
  notify(s);
  const todayStr = new Date().toISOString().split('T')[0];
  s.inflight = Promise.resolve(supabase.rpc('get_dashboard_kpis', { p_tenant_id: tenantId, p_date: todayStr }))
    .then(({ data, error }) => {
      if (error) {
        console.error('[kpis] get_dashboard_kpis failed:', error.message, error);
        s.error = error.message || 'Read failed';
      } else if (data) {
        s.data = data;
        s.error = null;
        s.fetchedAt = new Date();
      }
      return s.data;
    })
    .catch((err) => {
      console.error('[kpis] get_dashboard_kpis threw:', err?.message || err, err);
      s.error = err?.message || 'Read failed';
      return s.data;
    })
    .finally(() => {
      s.loading = false;
      s.inflight = null;
      notify(s);
    });
  return s.inflight;
}

/**
 * { data, error, loading, refetch }. `enabled: false` neither reads nor
 * subscribes, so a user who may not see the figures never asks for them.
 * The first subscriber for a tenant with no answer yet starts the read.
 */
export function useDashboardKpis(tenantId, { enabled = true } = {}) {
  const on = !!tenantId && enabled;
  // A bump to re-read the store; the store itself holds the answer.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!on) return undefined;
    const s = storeFor(tenantId);
    const listener = () => setTick(n => n + 1);
    s.listeners.add(listener);
    if (!s.data && !s.inflight) fetchDashboardKpis(tenantId);
    return () => { s.listeners.delete(listener); };
  }, [tenantId, on]);

  const refetch = useCallback(() => (on ? fetchDashboardKpis(tenantId) : Promise.resolve(null)), [tenantId, on]);
  const snap = on ? snapshot(storeFor(tenantId)) : EMPTY;
  return { ...snap, refetch };
}

/** For tests only: forget every cached answer. */
export const __resetDashboardKpis = () => stores.clear();

export default useDashboardKpis;
