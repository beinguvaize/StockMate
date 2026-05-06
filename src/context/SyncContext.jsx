import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cacheSet, cacheGet } from '../lib/cache';

const SyncContext = createContext();

export const useSync = () => useContext(SyncContext);

export const SyncProvider = ({ children }) => {
  const [syncStatus, setSyncStatus] = useState('SYNCED'); // 'SYNCED', 'SYNCING', 'ERROR', 'OFFLINE'
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSyncedAt, setLastSyncedAt] = useState(new Date().toISOString());
  
  const initializingRef = useRef(false);
  const appInitialized = useRef(false);

  // Connectivity Monitor
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus(prev => prev === 'OFFLINE' ? 'SYNCED' : prev);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('OFFLINE');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Heartbeat check for Supabase connectivity
  useEffect(() => {
    if (!isSupabaseConfigured || !isOnline) return;

    const interval = setInterval(async () => {
      try {
        const { error } = await supabase.from('settings').select('key').limit(1);
        if (error) throw error;
        setSyncStatus(prev => (prev === 'ERROR' ? 'SYNCED' : prev));
      } catch (err) {
        console.warn('Supabase heartbeat failed:', err);
        setSyncStatus('ERROR');
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isOnline]);

  const value = {
    syncStatus,
    setSyncStatus,
    isOnline,
    lastSyncedAt,
    setLastSyncedAt,
    initializingRef,
    appInitialized
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};
