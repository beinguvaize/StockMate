import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { isModuleAvailable } from '../lib/tenancy';
import { cacheClear as libCacheClear } from '../lib/cache';
import { setAppTZ } from '../lib/utils';

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

  const currentTenantId = currentTenant?.id || null;

  useEffect(() => {
    const initTenant = async () => {
      setLoading(true);
      // 1. Priority: Impersonation
      const impersonated = sessionStorage.getItem('nexus_impersonated_tenant');
      if (impersonated) {
        const tenant = JSON.parse(impersonated);
        setCurrentTenant(tenant);
        const { data: profile } = await supabase.from('business_profile').select('*').eq('tenant_id', tenant.id).maybeSingle();
        if (profile) { setBusinessProfile(profile); applyTZFromProfile(profile); }
        else setBusinessProfile({ currencySymbol: '$' });
        setResolvedForUserId(currentUser?.id || null);
        setLoading(false);
        return;
      }

      // 2. Load tenant by tenant_id, or fallback to membership lookup
      const resolvedTenantId = currentUser?.tenant_id;

      if (resolvedTenantId) {
        const [
          { data: tenant },
          { data: profile }
        ] = await Promise.all([
          supabase.from('tenants').select('*').eq('id', resolvedTenantId).maybeSingle(),
          supabase.from('business_profile').select('*').eq('tenant_id', resolvedTenantId).maybeSingle()
        ]);
        if (tenant) setCurrentTenant(tenant);
        if (profile) { setBusinessProfile(profile); applyTZFromProfile(profile); }
      } else {
        // tenant_id missing from profile — use tenant_member_read RLS policy
        const { data: tenants } = await supabase.from('tenants').select('*').limit(1);
        const tenant = tenants?.[0] || null;
        if (tenant) {
          setCurrentTenant(tenant);
          const { data: profile } = await supabase.from('business_profile').select('*').eq('tenant_id', tenant.id).maybeSingle();
          if (profile) { setBusinessProfile(profile); applyTZFromProfile(profile); }
          else setBusinessProfile({ currencySymbol: '$' });
        }
      }

      setResolvedForUserId(currentUser?.id || null);
      setLoading(false);
    };

    if (currentUser) {
      initTenant();
    } else {
      setCurrentTenant(null);
      setResolvedForUserId(null);
      setLoading(false);
    }
  }, [currentUser]);

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
    setCurrentTenant(tenant);
    sessionStorage.setItem('nexus_impersonating', 'true');
    sessionStorage.setItem('nexus_impersonated_tenant', JSON.stringify(tenant));
    window.location.href = `/${tenant.slug}/dashboard`;
  };

  const stopImpersonating = () => {
    sessionStorage.removeItem('nexus_impersonating');
    sessionStorage.removeItem('nexus_impersonated_tenant');
    window.location.href = '/nexus-hq';
  };

  const isModuleAllowed = (moduleKey) => {
    if (currentUser?.roles?.includes('GLOBAL_ADMIN')) return true;
    if (!currentTenant) return true;
    return isModuleAvailable(currentTenant.plan || 'STARTER', moduleKey);
  };

  const updateBusinessProfile = async (data) => {
    if (!currentTenantId) return { success: false, error: new Error('No tenant') };
    const { data: rows, error } = await supabase
      .from('business_profile')
      .update(data)
      .eq('tenant_id', currentTenantId)
      .select();
    if (error) return { success: false, error };
    if (!rows || rows.length === 0) {
      return { success: false, error: new Error('Update blocked (RLS / no row matched)') };
    }
    setBusinessProfile(prev => {
      const next = { ...prev, ...rows[0] };
      applyTZFromProfile(next);
      return next;
    });
    return { success: true, data: rows[0] };
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
  const currentUserId = currentUser?.id || null;
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
    updateBusinessProfile,
    updateTenant,
    isMaintenance,
    setIsMaintenance,
    cacheClear: libCacheClear,
    isSyncComplete,
    isImpersonating: sessionStorage.getItem('nexus_impersonating') === 'true'
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};
