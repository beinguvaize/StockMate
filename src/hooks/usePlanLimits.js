/**
 * usePlanLimits — plan enforcement hook
 * ----------------------------------------
 * Tracks current month invoice count and active user count against
 * the tenant's plan limits (STARTER / PRO / ENTERPRISE).
 *
 * Returns:
 *   invoiceCount    number   invoices created this calendar month
 *   userCount       number   active users on this tenant
 *   maxInvoices     number   plan cap (-1 = unlimited)
 *   maxUsers        number   plan cap (-1 = unlimited)
 *   canCreateInvoice()  bool
 *   canAddUser()        bool
 *   invoiceUsagePct     0–100 (null if unlimited)
 *   userUsagePct        0–100 (null if unlimited)
 *   planLabel       string  e.g. "Starter"
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getPlanLimits, PLANS } from '../lib/tenancy';
import { monthBounds } from '../lib/reportPeriods';
import { useTenant } from '../context/TenantContext';

export const usePlanLimits = () => {
  const { currentTenant, currentTenantId } = useTenant();
  const plan     = currentTenant?.plan || 'STARTER';
  const limits   = getPlanLimits(plan);
  const planMeta = PLANS[plan] || PLANS.STARTER;

  const [invoiceCount, setInvoiceCount] = useState(0);
  const [userCount,    setUserCount]    = useState(0);
  const [loading,      setLoading]      = useState(true);

  const fetchCounts = useCallback(async () => {
    if (!currentTenantId) { setLoading(false); return; }

    const now    = new Date();
    const { from: monthStart, to: monthEnd } = monthBounds(now);

    const [
      { count: inv },
      { count: usr },
    ] = await Promise.all([
      // Count invoices (sales) this month
      supabase
        .from('sales')
        .select('id', { count: 'exact', head: true }).is('deleted_at', null)
        .eq('tenant_id', currentTenantId)
        .gte('date', monthStart)
        .lte('date', monthEnd),
      // Count active users on this tenant
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', currentTenantId),
    ]);

    setInvoiceCount(inv || 0);
    setUserCount(usr || 0);
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const canCreateInvoice = () => {
    if (limits.maxInvoices === -1) return true;
    return invoiceCount < limits.maxInvoices;
  };

  const canAddUser = () => {
    if (limits.maxUsers === -1) return true;
    return userCount < limits.maxUsers;
  };

  const pct = (used, max) => (max === -1 ? null : Math.min(100, Math.round((used / max) * 100)));

  return {
    loading,
    plan,
    planLabel:       planMeta.label,
    planPrice:       planMeta.price,
    maxInvoices:     limits.maxInvoices,
    maxUsers:        limits.maxUsers,
    invoiceCount,
    userCount,
    canCreateInvoice,
    canAddUser,
    invoiceUsagePct: pct(invoiceCount, limits.maxInvoices),
    userUsagePct:    pct(userCount,    limits.maxUsers),
    refetch:         fetchCounts,
  };
};
