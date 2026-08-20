import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Reject a pending request after `ms` so a hung network call can never
// freeze the app on the loading screen.
const withTimeout = (promise, ms = 15000, label = 'request') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial Session check
    const initSession = async () => {
      try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(), 15000, 'getSession'
      );
      setSession(session);

      if (session?.user) {
        const userEmail = session.user.email?.toLowerCase();
        const isSuperUser = userEmail === 'uvaize@hotmail.com' || userEmail === 'gladmin@ledgrpro.ca';

        // Desktop-only offline support: cache profile + fall back to it
        // when network fails. Web/mobile keep the original behaviour.
        const isDesktop = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
        let profile = null;
        try {
          const res = await withTimeout(
            supabase.from('users').select('*').eq('id', session.user.id).maybeSingle(),
            15000, 'profile load'
          );
          profile = res?.data || null;
          if (profile && isDesktop) {
            try {
              const { setMeta } = await import('../lib/offline/cache.js');
              await setMeta(`cachedProfile:${session.user.id}`, profile);
            } catch (_) {/* ignore cache write fail */}
          }
        } catch (netErr) {
          if (isDesktop) {
            try {
              const { getMeta } = await import('../lib/offline/cache.js');
              profile = await getMeta(`cachedProfile:${session.user.id}`);
              if (profile) console.info('[auth] offline → using cached profile');
            } catch (_) {/* ignore cache read fail */}

            // Offline grace + subscription gate. If the bootstrap snapshot
            // is missing, stale, or marks the subscription as suspended, we
            // force the user back to the login screen instead of giving
            // unauthorised offline access to cached data.
            try {
              const { loadBootstrap, isGraceValid, isSubscriptionActive } =
                await import('../lib/offline/authGuard.js');
              const bootstrap = await loadBootstrap();
              const block =
                !bootstrap ||
                bootstrap.userId !== session.user.id ||
                !isGraceValid(bootstrap) ||
                !isSubscriptionActive(bootstrap);
              if (block) {
                console.warn('[auth] offline grace/subscription gate failed → signing out');
                await supabase.auth.signOut();
                profile = null;
              }
            } catch (_) {/* if guard fails, fall through with cached profile */}
          }
        }

        if (profile) {
          // Merge session email into profile to ensure bypass logic always has the data
          const enrichedProfile = { ...profile, email: session.user.email };

          // Desktop: the offline cache + outbox are keyed per app, NOT per
          // tenant. If a different tenant logs in, wipe both — otherwise the
          // UI serves the previous tenant's cached rows (numbers "flicker")
          // and, far worse, the previous tenant's queued writes would replay
          // under the new login.
          if (isDesktop && enrichedProfile.tenant_id) {
            try {
              const { getMeta, setMeta, clearAll } = await import('../lib/offline/cache.js');
              const prevTenant = await getMeta('cacheTenantId');
              if (prevTenant && prevTenant !== enrichedProfile.tenant_id) {
                console.info('[auth] tenant switch — clearing offline cache + outbox');
                const { clearOps } = await import('../lib/offline/outbox.js');
                await clearOps();
                await clearAll(); // wipes records + meta (incl. bulkSync flag → fresh download)
              }
              await setMeta('cacheTenantId', enrichedProfile.tenant_id);
            } catch (_) {/* cache guard is best-effort */}
          }

          // Ensure bootstrap admins always have their roles in state even if DB is out of sync
          if (isSuperUser && !enrichedProfile.roles?.includes('GLOBAL_ADMIN')) {
             enrichedProfile.roles = [...(enrichedProfile.roles || []), 'GLOBAL_ADMIN', 'OWNER'];
          }
          setCurrentUser(enrichedProfile);

          // Desktop: persist bootstrap snapshot (user + subscription) after
          // a successful ONLINE validation so subsequent launches can run
          // offline within the grace window. Fire-and-forget — never blocks UI.
          if (isDesktop && enrichedProfile.tenant_id) {
            (async () => {
              try {
                const { data: tenantRow } = await supabase
                  .from('tenants')
                  .select('plan, status')
                  .eq('id', enrichedProfile.tenant_id)
                  .maybeSingle();
                const { saveBootstrap } = await import('../lib/offline/authGuard.js');
                await saveBootstrap({
                  userId: session.user.id,
                  email: session.user.email,
                  tenantId: enrichedProfile.tenant_id,
                  subscription: {
                    plan: tenantRow?.plan || 'STARTER',
                    status: tenantRow?.status || 'ACTIVE',
                  },
                });
              } catch (_) {/* ignore — bootstrap is best-effort */}
            })();
          }
        } else if (isSuperUser) {
          // A bootstrap admin is provisioned for real -- the row is written, so
          // the database agrees with what is in state.
          const newUserProfile = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.email.split('@')[0],
            roles: ['GLOBAL_ADMIN', 'OWNER'],
            status: 'ACTIVE',
          };
          const { error: provErr } = await supabase.from('users').upsert(newUserProfile);
          if (provErr) {
            console.error('[auth] superuser provisioning failed:', provErr);
            setCurrentUser({ ...newUserProfile, roles: [], status: 'NO_PROFILE', profileMissing: true });
          } else {
            setCurrentUser(newUserProfile);
          }
        } else {
          // NO PROFILE ROW, and we are not allowed to create one.
          //
          // This used to invent a profile in memory -- roles STAFF, status
          // ACTIVE, no tenant -- and carry on as though the account were set up.
          // The app then rendered normally while the DATABASE had no record of
          // the user, so current_tenant_id() was null, is_global_admin() was
          // false, and every RLS policy denied. Reads still looked fine because
          // the cache served rows; writes matched nothing and did nothing.
          //
          // A signed-in account the database does not know about is not a
          // working account, and pretending otherwise is what made this take a
          // customer report and three fixes to find.
          console.error('[auth] signed in as %s but no users row exists — account not provisioned',
            session.user.email);
          setCurrentUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.email.split('@')[0],
            roles: [],
            status: 'NO_PROFILE',
            profileMissing: true,
          });
        }
      }
      } catch (err) {
        // Network/transient failure on first load — log and proceed so the
        // app never hangs on the loading screen. User lands on login if no
        // session could be restored.
        console.error('[auth] initSession failed:', err);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    // 2. Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);

      if (event === 'TOKEN_REFRESHED') {
        // JWT rotated but user identity unchanged — do NOT re-fetch profile.
        // Re-fetching would create a new currentUser object reference which
        // triggers TenantContext to setLoading(true) and show the loading screen.
        return;
      }

      if (event === 'SIGNED_IN') {
        if (session?.user) {
          const userEmail = session.user.email?.toLowerCase();
          const isSuperUser = userEmail === 'uvaize@hotmail.com' || userEmail === 'gladmin@ledgrpro.ca';
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            const enrichedProfile = { ...profile, email: session.user.email };
            if (isSuperUser && !enrichedProfile.roles?.includes('GLOBAL_ADMIN')) {
              enrichedProfile.roles = [...(enrichedProfile.roles || []), 'GLOBAL_ADMIN', 'OWNER'];
            }
            setCurrentUser(enrichedProfile);

            // Desktop: write bootstrap snapshot on every fresh SIGNED_IN so
            // grace timer resets and subscription status is current.
            const isDesktopEvt = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
            if (isDesktopEvt && enrichedProfile.tenant_id) {
              (async () => {
                try {
                  const { data: tenantRow } = await supabase
                    .from('tenants')
                    .select('plan, status')
                    .eq('id', enrichedProfile.tenant_id)
                    .maybeSingle();
                  const { saveBootstrap } = await import('../lib/offline/authGuard.js');
                  await saveBootstrap({
                    userId: session.user.id,
                    email: session.user.email,
                    tenantId: enrichedProfile.tenant_id,
                    subscription: {
                      plan: tenantRow?.plan || 'STARTER',
                      status: tenantRow?.status || 'ACTIVE',
                    },
                  });
                } catch (_) {/* best-effort */}
              })();
            }
          } else {
            setCurrentUser({
              id: session.user.id,
              email: session.user.email,
              name: session.user.email.split('@')[0],
              roles: isSuperUser ? ['GLOBAL_ADMIN', 'OWNER'] : ['STAFF'],
              status: 'ACTIVE'
            });
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime: watch own profile row for role/permission changes made by admin
  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel(`user-profile-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${currentUser.id}`,
      }, async () => {
        // Re-fetch fresh profile on any update
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();
        if (profile) {
          const { data: { session } } = await supabase.auth.getSession();
          const userEmail = session?.user?.email?.toLowerCase();
          const isSuperUser = userEmail === 'uvaize@hotmail.com' || userEmail === 'gladmin@ledgrpro.ca';
          const enriched = { ...profile, email: session?.user?.email || currentUser.email };
          if (isSuperUser && !enriched.roles?.includes('GLOBAL_ADMIN')) {
            enriched.roles = [...(enriched.roles || []), 'GLOBAL_ADMIN', 'OWNER'];
          }
          setCurrentUser(enriched);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [currentUser?.id]);

  const updateAvatar = async (avatarUrl) => {
    if (!currentUser?.id) return { error: 'Not logged in' };
    const { error } = await supabase
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', currentUser.id);
    if (!error) setCurrentUser(prev => ({ ...prev, avatar_url: avatarUrl }));
    return { error: error?.message || null };
  };

  const login = async (email, password) => {
    // Fresh sign-in always starts clean: drop any impersonation left in this
    // tab's sessionStorage — otherwise a global admin who impersonated a
    // tenant earlier gets silently dumped back into that tenant (possibly a
    // suspended one) instead of Nexus HQ.
    try {
      sessionStorage.removeItem('nexus_impersonating');
      sessionStorage.removeItem('nexus_impersonated_tenant');
    } catch (_) {/* storage unavailable — ignore */}

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    // Subscription gate: any sign-in (web, desktop, mobile) must hit the
    // server. If the tenant is SUSPENDED / CANCELLED / EXPIRED, sign the
    // user back out so an offline cached session can't bypass billing.
    try {
      const userId = data.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from('users')
          .select('tenant_id, roles')
          .eq('id', userId)
          .maybeSingle();

        const isGlobalAdmin = (profile?.roles || []).includes('GLOBAL_ADMIN');
        const tenantId = profile?.tenant_id;
        if (tenantId && !isGlobalAdmin) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('status, plan')
            .eq('id', tenantId)
            .maybeSingle();
          const status = String(tenant?.status || 'ACTIVE').toUpperCase();
          if (['SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(status)) {
            await supabase.auth.signOut();
            return {
              success: false,
              error: `Account ${status.toLowerCase()}. Contact support to reactivate.`,
            };
          }
        }
      }
    } catch (gateErr) {
      // Don't lock anyone out on a transient lookup failure — RootRedirect
      // will route them and the offline guard will catch SUSPENDED state
      // on the next online launch via the bootstrap snapshot.
      console.warn('[auth] subscription gate skipped:', gateErr?.message || gateErr);
    }

    return { success: true, user: data.user };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    // Impersonation must not outlive the session that started it.
    try {
      sessionStorage.removeItem('nexus_impersonating');
      sessionStorage.removeItem('nexus_impersonated_tenant');
    } catch (_) {/* ignore */}
    // Clear desktop offline bootstrap so next launch requires online sign-in
    try {
      const { clearBootstrap, isElectron } = await import('../lib/offline/authGuard.js');
      if (isElectron()) await clearBootstrap();
    } catch (_) {/* ignore */}
  };

  const hasPermission = (moduleKey, action = 'view') => {
    if (!currentUser) return false;
    const roles = currentUser.roles || [];
    if (roles.includes('GLOBAL_ADMIN')) return true;
    if (roles.includes('OWNER')) return true;
    if (roles.includes('STAFF')) {
      if (action === 'view') return true;
      return ['sales', 'clients', 'daybook'].includes(moduleKey);
    }
    // SALES template — no dashboard (privacy)
    if (roles.includes('SALES')) {
      const salesModules = ['sales', 'clients', 'daybook'];
      return salesModules.includes(moduleKey);
    }
    // INVENTORY template — no dashboard (privacy)
    if (roles.includes('INVENTORY')) {
      const invModules = ['inventory', 'purchases', 'suppliers'];
      return invModules.includes(moduleKey);
    }
    // DRIVER — van sales + operations only
    if (roles.includes('DRIVER')) {
      const driverModules = ['vehicles', 'sales'];
      return driverModules.includes(moduleKey);
    }
    // CUSTOM role (and any other): respect granular permissions object
    const perms = currentUser.permissions;
    if (perms && typeof perms === 'object') {
      const mod = perms[moduleKey];
      if (mod && typeof mod === 'object') return !!mod[action];
    }
    return false;
  };

  const hasRole = (role) => {
    if (!currentUser) return false;
    const roles = currentUser.roles || [];
    if (roles.includes('GLOBAL_ADMIN')) return true;
    return roles.includes(role);
  };

  const value = {
    currentUser,
    session,
    loading,
    login,
    logout,
    updateAvatar,
    hasPermission,
    hasRole,
    isAdmin: currentUser?.roles?.includes('GLOBAL_ADMIN'),
    isOwner: currentUser?.roles?.includes('OWNER') || currentUser?.roles?.includes('GLOBAL_ADMIN'),
    isSyncComplete: !loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
