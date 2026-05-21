/**
 * context/OfflineContext.jsx
 * Provides offline/sync state to the React tree via OfflineProvider + useOffline hook.
 *
 * Exposes: { online, syncing, lastSyncAt, pendingCount, syncNow }
 *
 * All effects are defensive — errors are caught and logged, never propagated.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  startSync,
  stopSync,
  syncNow as engineSyncNow,
  getSyncing,
} from '../lib/offline/syncEngine.js';
import { pendingCount as outboxPendingCount } from '../lib/offline/outbox.js';

// ─── Context ─────────────────────────────────────────────────────────────────

const OfflineContext = createContext({
  online: true,
  syncing: false,
  lastSyncAt: null,
  pendingCount: 0,
  syncNow: async () => {},
});

export function useOffline() {
  return useContext(OfflineContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Ref to avoid stale closures in the syncNow callback
  const syncingRef = useRef(false);

  // ── Online / offline events ──
  useEffect(() => {
    try {
      const handleOnline = () => setOnline(true);
      const handleOffline = () => setOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    } catch (err) {
      console.error('[OfflineContext] online/offline listener error:', err);
    }
  }, []);

  // ── Refresh pending count helper ──
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await outboxPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.error('[OfflineContext] refreshPendingCount error:', err);
    }
  }, []);

  // ── Sync completion callback passed to startSync ──
  const onSyncComplete = useCallback(
    (isoTs) => {
      try {
        setLastSyncAt(isoTs);
        setSyncing(false);
        syncingRef.current = false;
        refreshPendingCount();
      } catch (err) {
        console.error('[OfflineContext] onSyncComplete error:', err);
      }
    },
    [refreshPendingCount]
  );

  // ── Poll getSyncing() to track in-progress state ──
  useEffect(() => {
    const poll = setInterval(() => {
      try {
        const current = getSyncing();
        if (current !== syncingRef.current) {
          syncingRef.current = current;
          setSyncing(current);
        }
      } catch (_) {}
    }, 500);
    return () => clearInterval(poll);
  }, []);

  // ── Start / stop the sync engine ──
  useEffect(() => {
    try {
      startSync(onSyncComplete);
    } catch (err) {
      console.error('[OfflineContext] startSync error:', err);
    }
    return () => {
      try {
        stopSync();
      } catch (err) {
        console.error('[OfflineContext] stopSync error:', err);
      }
    };
  }, [onSyncComplete]);

  // ── Manual syncNow exposed to consumers ──
  const syncNow = useCallback(async () => {
    try {
      setSyncing(true);
      const ts = await engineSyncNow();
      if (ts) {
        setLastSyncAt(ts);
        await refreshPendingCount();
      }
    } catch (err) {
      console.error('[OfflineContext] manual syncNow error:', err);
    } finally {
      setSyncing(false);
    }
  }, [refreshPendingCount]);

  const value = {
    online,
    syncing,
    lastSyncAt,
    pendingCount,
    syncNow,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
