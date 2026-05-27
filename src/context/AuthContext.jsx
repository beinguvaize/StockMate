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
          }
        }

        if (profile) {
          // Merge session email into profile to ensure bypass logic always has the data
          const enrichedProfile = { ...profile, email: session.user.email };

          // Ensure bootstrap admins always have their roles in state even if DB is out of sync
          if (isSuperUser && !enrichedProfile.roles?.includes('GLOBAL_ADMIN')) {
             enrichedProfile.roles = [...(enrichedProfile.roles || []), 'GLOBAL_ADMIN', 'OWNER'];
          }
          setCurrentUser(enrichedProfile);
        } else {
          // Provision superuser if match
          const newUserProfile = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.email.split('@')[0],
            roles: isSuperUser ? ['GLOBAL_ADMIN', 'OWNER'] : ['STAFF'],
            status: 'ACTIVE'
          };
          setCurrentUser(newUserProfile);
          if (isSuperUser) {
            await supabase.from('users').upsert(newUserProfile);
          }
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true, user: data.user };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
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
