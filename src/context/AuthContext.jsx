import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isLocked, recordFailure, recordSuccess, timeRemaining } from '../lib/loginThrottle';
import { cacheClear } from '../lib/cache';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// Bootstrap allowlist for first-login auto-provisioning.
const BOOTSTRAP_ADMIN_EMAILS = new Set(
  (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authSession, setAuthSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (email, password) => {
    if (isLocked(email)) {
      const remaining = timeRemaining(email);
      return { success: false, error: `Too many failed attempts. Try again in ${remaining}.` };
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        recordFailure(email);
        return { success: false, error: error.message };
      }

      recordSuccess(email);

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
        
      if (profile) {
        setCurrentUser(profile);
      } else {
        const metaRoles = data.user.user_metadata?.roles || [];
        if (metaRoles.length > 0) {
          const synthesizedUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.name || data.user.email.split('@')[0],
            roles: metaRoles,
            status: 'ACTIVE'
          };
          setCurrentUser(synthesizedUser);
          return { success: true, user: synthesizedUser };
        }
      }
      
      return { success: true, user: profile || data.user };
    }

    return {
      success: false,
      error: 'Authentication unavailable — Supabase is not configured. Contact your administrator.',
    };
  };

  const logout = async () => {
    try {
      setLoading(true);
      cacheClear();
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      setCurrentUser(null);
      setAuthSession(null);
      setLoading(false);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  };

  const isOwner = currentUser?.roles?.includes('OWNER') || currentUser?.roles?.includes('GLOBAL_ADMIN');
  const isStaff = currentUser?.roles?.includes('STAFF') || currentUser?.role?.toLowerCase() === 'staff';

  const value = {
    currentUser,
    setCurrentUser,
    session: authSession || currentUser,
    setAuthSession,
    isOwner,
    isStaff,
    login,
    logout,
    loading,
    BOOTSTRAP_ADMIN_EMAILS
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
