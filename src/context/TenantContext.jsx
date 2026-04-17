import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isModuleAvailable } from '../lib/tenancy';
import { cacheClear } from '../lib/cache';

const TenantContext = createContext();

export const useTenant = () => useContext(TenantContext);

export const TenantProvider = ({ children }) => {
  const [currentTenant, setCurrentTenant] = useState(() => {
    try {
      const stored = sessionStorage.getItem('nexus_impersonated_tenant');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [isImpersonating, setIsImpersonating] = useState(sessionStorage.getItem('nexus_impersonating') === 'true');
  const currentTenantId = currentTenant?.id || null;

  const impersonateTenant = (tenant) => {
    cacheClear();
    setCurrentTenant(tenant);
    setIsImpersonating(true);
    sessionStorage.setItem('nexus_impersonating', 'true');
    sessionStorage.setItem('nexus_impersonated_tenant', JSON.stringify(tenant));
    window.location.href = `/${tenant.slug}/dashboard`;
  };

  const stopImpersonating = () => {
    setIsImpersonating(false);
    sessionStorage.removeItem('nexus_impersonating');
    sessionStorage.removeItem('nexus_impersonated_tenant');
    cacheClear();
    window.location.href = '/nexus-hq';
  };

  const resolveTenant = async (userProfile) => {
    if (!userProfile?.tenant_id) return;
    if (sessionStorage.getItem("nexus_impersonating") === "true") return;
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', userProfile.tenant_id)
        .maybeSingle();
      if (tenant) {
        setCurrentTenant(tenant);
        return tenant;
      }
    } catch (err) {
      console.error('Failed to resolve tenant:', err);
    }
    return null;
  };

  const resolveTenantBySlug = async (slug) => {
    if (!slug || !isSupabaseConfigured) return;
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      
      if (tenant) {
        setCurrentTenant(tenant);
        return tenant;
      }
    } catch (err) {
      console.error('Failed to resolve tenant by slug:', err);
    }
    return null;
  };

  const isModuleAllowed = (moduleKey) => {
    if (!currentTenant) return true;
    return isModuleAvailable(currentTenant.plan, moduleKey);
  };

  const value = {
    currentTenant,
    currentTenantId,
    setCurrentTenant,
    isImpersonating,
    impersonateTenant,
    stopImpersonating,
    resolveTenant,
    resolveTenantBySlug,
    isModuleAllowed
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};
