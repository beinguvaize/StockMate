import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { isModuleAvailable, effectivePlan, trialNotice } from '../lib/tenancy';
import { normalizeType, resolveModules, isModuleEnabled, term } from '../lib/verticals';
import { cacheClear as libCacheClear } from '../lib/cache';
import { setAppTZ } from '../lib/utils';
import { goHref } from '../lib/nav';

// Reject a pending request after `ms` so a hung network call can never
// freeze the app on the loading screen.
const withTimeout = (promise, ms = 15000, label = 'request') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);

const applyTZFromProfile = (profile) => {
  if (!profile) return;
  setAppTZ({
    timezone: profile.timezone,
    locale: profile.locale,
    country: profile.country,
  });
};

const TenantContext = createContext();

export const useTenant = () => useContext(TenantContext);

export const TenantProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [currentTenant, setCurrentTenant] = useState(null);
  const [businessProfile, setBusinessProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMaintenance, setIsMaintenance] = useState(false);
  // Track which user ID we last completed a load for.
  // isSyncComplete is false until resolvedForUserId === currentUser?.id
  // This prevents GuestRoute from seeing loading=false before the first
  // initTenant has had a chance to run for the new user.
  const [resolvedForUserId, setResolvedForUserId] = useState(undefined);
  // Keep a ref to the latest currentUser so initTenant can read it
  // without being listed as an effect dependency (avoids re-trigger on
  // same-user object reference changes e.g. after TOKEN_REFRESHED).
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const currentTenantId = currentTenant?.id || null;

  // Depend only on user ID — not the full object — so that TOKEN_REFRESHED
  // (which creates a new currentUser reference with same ID) does not trigger
  // a full tenant re-load and loading screen flash.
  const currentUserId = currentUser?.id ?? null;

  useEffect(() => {
    const cu = currentUserRef.current;
    const initTenant = async () => {
      setLoading(true);
      try {
        // 1. Priority: Impersonation — gated to verified GLOBAL_ADMIN only.
        // Without this check, anyone who set sessionStorage manually
        // (devtools, browser extension, replay attack) would have the UI
        // flip into another tenant's chrome on next page load.
        const impersonated = sessionStorage.getItem('nexus_impersonated_tenant');
        const callerIsGlobalAdmin = !!cu?.roles?.includes?.('GLOBAL_ADMIN');
        if (impersonated && !callerIsGlobalAdmin) {
          // Stale or tampered impersonation flag — clear it.
          sessionStorage.removeItem('nexus_impersonating');
          sessionStorage.removeItem('nexus_impersonated_tenant');
        }
        if (impersonated && callerIsGlobalAdmin) {
          const tenant = JSON.parse(impersonated);
          setCurrentTenant(tenant);
          const { data: profile } = await withTimeout(
            supabase.from('business_profile').select('*').eq('tenant_id', tenant.id).maybeSingle(),
            15000, 'business profile'
          );
          if (profile) { setBusinessProfile(profile); applyTZFromProfile(profile); }
          else setBusinessProfile({ currencySymbol: '$' });
          return;
        }

        // 2. Load tenant by tenant_id, or fallback to membership lookup
        const resolvedTenantId = cu?.tenant_id;

        if (resolvedTenantId) {
          const isDesktop = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
          let tenant = null;
          let profile = null;
          try {
            const res = await withTimeout(Promise.all([
              supabase.from('tenants').select('*').eq('id', resolvedTenantId).maybeSingle(),
              supabase.from('business_profile').select('*').eq('tenant_id', resolvedTenantId).maybeSingle(),
            ]), 15000, 'tenant load');
            tenant  = res[0]?.data || null;
            profile = res[1]?.data || null;
            if (isDesktop) {
              try {
                const { setMeta } = await import('../lib/offline/cache.js');
                if (tenant)  await setMeta(`cachedTenant:${resolvedTenantId}`, tenant);
                if (profile) await setMeta(`cachedBusinessProfile:${resolvedTenantId}`, profile);
              } catch (_) {/* ignore cache write fail */}
            }
          } catch (netErr) {
            if (isDesktop) {
              try {
                const { getMeta } = await import('../lib/offline/cache.js');
                tenant  = await getMeta(`cachedTenant:${resolvedTenantId}`);
                profile = await getMeta(`cachedBusinessProfile:${resolvedTenantId}`);
                if (tenant) console.info('[tenant] offline → using cached tenant');
              } catch (_) {/* ignore cache read fail */}
            }
          }
          if (tenant) setCurrentTenant(tenant);
          if (profile) { setBusinessProfile(profile); applyTZFromProfile(profile); }
        } else {
          // tenant_id missing from profile — use tenant_member_read RLS policy
          const { data: tenants } = await withTimeout(
            supabase.from('tenants').select('*').limit(1), 15000, 'tenant lookup'
          );
          const tenant = tenants?.[0] || null;
          if (tenant) {
            setCurrentTenant(tenant);
            const { data: profile } = await withTimeout(
              supabase.from('business_profile').select('*').eq('tenant_id', tenant.id).maybeSingle(),
              15000, 'business profile'
            );
            if (profile) { setBusinessProfile(profile); applyTZFromProfile(profile); }
            else setBusinessProfile({ currencySymbol: '$' });
          }
        }
      } catch (err) {
        // Network/transient failure — log and proceed so the app never
        // hangs on the loading screen.
        console.error('[tenant] initTenant failed:', err);
      } finally {
        setResolvedForUserId(cu?.id ?? null);
        setLoading(false);
      }
    };

    if (cu) {
      initTenant();
    } else {
      setCurrentTenant(null);
      setResolvedForUserId(null);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const resolveTenantBySlug = async (slug) => {
    if (!slug) return null;
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (tenant) {
      setCurrentTenant(tenant);
      const { data: profile } = await supabase.from('business_profile').select('*').eq('tenant_id', tenant.id).maybeSingle();
      if (profile) { setBusinessProfile(profile); applyTZFromProfile(profile); }
      else setBusinessProfile({ currencySymbol: '$' });
      return tenant;
    }
    return null;
  };

  const impersonateTenant = (tenant) => {
    // Hard gate. Even with the RLS helpers now reading roles strictly
    // from public.users (so a non-admin can't actually exfiltrate data
    // via JWT spoofing), we still refuse to flip the UI into another
    // tenant's chrome unless the caller is a verified GLOBAL_ADMIN.
    // Without this, anyone who set sessionStorage in devtools would
    // see another workspace's branding + URL even though the queries
    // returned zero rows — confusing and noisy in audit logs.
    if (!currentUser?.roles?.includes('GLOBAL_ADMIN')) {
      // eslint-disable-next-line no-console
      console.warn('[security] impersonateTenant blocked — caller is not GLOBAL_ADMIN');
      return;
    }
    setCurrentTenant(tenant);
    sessionStorage.setItem('nexus_impersonating', 'true');
    sessionStorage.setItem('nexus_impersonated_tenant', JSON.stringify(tenant));
    goHref('/dashboard');
  };

  const stopImpersonating = () => {
    sessionStorage.removeItem('nexus_impersonating');
    sessionStorage.removeItem('nexus_impersonated_tenant');
    goHref('/nexus-hq');
  };

    // Trial state, exposed so the shell can warn before access changes rather
  // than letting a shop discover it mid-sale.
  const trial = currentTenant ? trialNotice(currentTenant) : null;
  const planInEffect = currentTenant ? effectivePlan(currentTenant) : null;

const isModuleAllowed = (moduleKey) => {
    if (currentUser?.roles?.includes('GLOBAL_ADMIN')) return true;
    if (!currentTenant) return true;
    // The EFFECTIVE plan, not the stored one: a running trial grants more than
    // the row says, and a lapsed one grants less. See tenancy.effectivePlan.
    return isModuleAvailable(effectivePlan(currentTenant), moduleKey);
  };

  // ── Vertical layer (Stage A) ──────────────────────────────────────────────
  // Separate axis from plan gating above: business_type selects the default
  // module set + terminology; tenant.modules overrides. A feature shows only if
  // it is on for the vertical AND allowed by the plan.
  const businessType = normalizeType(currentTenant?.business_type);
  const tenantModules = resolveModules(currentTenant);
  const isModuleOn = (key) => isModuleEnabled(tenantModules, key);
  const t = (key) => term(businessType, key);

  const updateBusinessProfile = async (data) => {
    if (!currentTenantId) return { success: false, error: new Error('No tenant') };
    try {
      // Ensure id is always present — required NOT NULL column.
      // Reuse existing row id if known, otherwise generate a stable UUID.
      const id = businessProfile?.id || crypto.randomUUID();
      // Use upsert so it works even if no row exists yet (e.g. fresh tenant setup)
      const { data: rows, error } = await supabase
        .from('business_profile')
        .upsert({ ...data, id, tenant_id: currentTenantId }, { onConflict: 'tenant_id' })
        .select();
      if (error) return { success: false, error };
      const saved = rows?.[0] || data;
      setBusinessProfile(prev => {
        const next = { ...prev, ...saved };
        applyTZFromProfile(next);
        return next;
      });
      return { success: true, data: saved };
    } catch (err) {
      console.error('updateBusinessProfile threw:', err);
      return { success: false, error: err };
    }
  };

  const updateTenant = async (data) => {
    if (!currentTenantId) return { success: false };
    const { error } = await supabase.from('tenants').update(data).eq('id', currentTenantId);
    if (!error) setCurrentTenant(prev => ({ ...prev, ...data }));
    return { success: !error, error };
  };

  // isSyncComplete is true only when:
  // - no user (login screen) OR
  // - tenant load has completed for the current user
  // This prevents GuestRoute from redirecting to /no-access during the
  // render cycle between setCurrentUser() and the initTenant() effect.
  const isSyncComplete = !loading && resolvedForUserId === currentUserId;

  const value = {
    currentTenant,
    currentTenantId,
    businessProfile,
    loading,
    resolveTenantBySlug,
    impersonateTenant,
    stopImpersonating,
    isModuleAllowed,
    trial,
    planInEffect,
    businessType,
    tenantModules,
    isModuleOn,
    t,
    updateBusinessProfile,
    updateTenant,
    isMaintenance,
    setIsMaintenance,
    cacheClear: libCacheClear,
    isSyncComplete,
    // Only treat the flag as real when the caller is a verified
    // GLOBAL_ADMIN. Stops the impersonation banner / TenantResolver
    // slug-bypass from firing when a non-admin sets the flag manually.
    isImpersonating:
      sessionStorage.getItem('nexus_impersonating') === 'true' &&
      !!currentUser?.roles?.includes?.('GLOBAL_ADMIN'),
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};
