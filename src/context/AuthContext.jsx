import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial Session check
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session?.user) {
        const userEmail = session.user.email?.toLowerCase();
        const isSuperUser = userEmail === 'uvaize@hotmail.com' || userEmail === 'gladmin@ledgrpro.ca';
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
          
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
      setLoading(false);
    };

    initSession();

    // 2. Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          const userEmail = session.user.email?.toLowerCase();
        const isSuperUser = userEmail === 'uvaize@hotmail.com' || userEmail === 'gladmin@ledgrpro.ca';
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
            
          if (profile) {
            // Merge session email to guarantee bypass logic functionality
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
    // Dashboard always visible to any authenticated user
    if (moduleKey === 'dashboard') return true;
    if (roles.includes('STAFF')) {
      if (action === 'view') return true;
      return ['sales', 'clients', 'daybook'].includes(moduleKey);
    }
    // SALES template
    if (roles.includes('SALES')) {
      const salesModules = ['sales', 'clients', 'daybook'];
      if (action === 'view') return salesModules.includes(moduleKey);
      return salesModules.includes(moduleKey);
    }
    // INVENTORY template
    if (roles.includes('INVENTORY')) {
      const invModules = ['inventory', 'purchases', 'suppliers'];
      if (action === 'view') return invModules.includes(moduleKey);
      return invModules.includes(moduleKey);
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
    hasPermission,
    hasRole,
    isAdmin: currentUser?.roles?.includes('GLOBAL_ADMIN'),
    isOwner: currentUser?.roles?.includes('OWNER') || currentUser?.roles?.includes('GLOBAL_ADMIN'),
    isSyncComplete: !loading
  };

  if (!loading) {
    console.log('AuthContext State:', { user: currentUser?.email, roles: currentUser?.roles, isAdmin: value.isAdmin });
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
