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
  AUTO_SYNC_INTERVAL_MS,
} from '../lib/offline/syncEngine.js';
import { probeConnectivity } from '../lib/supabase.js';
import { pendingCount as outboxPendingCount } from '../lib/offline/outbox.js';
import { isElectron } from '../lib/offline/hookAdapter.js';

const AUTO_SYNC_LS_KEY = 'ledgr.autoSync';

// ─── Context ─────────────────────────────────────────────────────────────────

const OfflineContext = createContext({
  online: true,
  syncing: false,
  lastSyncAt: null,
  pendingCount: 0,
  syncNow: async () => {},
  autoSync: false,
  setAutoSync: () => {},
  autoSyncIntervalMs: AUTO_SYNC_INTERVAL_MS,
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

  // Auto-sync preference persisted in localStorage. Desktop is offline-first
  // so auto-sync defaults ON there (every 10 min); web default stays OFF.
  // A saved user choice always wins.
  const [autoSync, setAutoSyncState] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTO_SYNC_LS_KEY);
      if (saved === '1') return true;
      if (saved === '0') return false;
      return isElectron();
    } catch (_) { return false; }
  });
  const setAutoSync = useCallback((v) => {
    setAutoSyncState(!!v);
    try { localStorage.setItem(AUTO_SYNC_LS_KEY, v ? '1' : '0'); } catch (_) {}
  }, []);

  // Ref to avoid stale closures in the syncNow callback
  const syncingRef = useRef(false);

  // ── Connectivity tracking (probe-based) ──
  // navigator.onLine alone is unreliable — it false-negatives on transient
  // blips and can stick "offline" while the network is fine, which scared
  // users into thinking saves were blocked. Instead, treat the browser
  // online/offline events as triggers and confirm with a real reachability
  // probe. Require two consecutive probe failures before showing offline so
  // a single hiccup doesn't flip the badge; recover immediately on success.
  useEffect(() => {
    let cancelled = false;
    let fails = 0;
    let inflight = false;

    const check = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const reachable = await probeConnectivity();
        if (cancelled) return;
        if (reachable) {
          fails = 0;
          setOnline(true);
        } else {
          fails += 1;
          if (fails >= 2) setOnline(false);
        }
      } catch (_) {
        /* probe never throws, but guard anyway */
      } finally {
        inflight = false;
      }
    };

    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(check, 25000);

    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      document.removeEventListener('visibilitychange', onVis);
    };
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

  // ── Start / stop the sync engine — desktop only ──
  // Restarts whenever the autoSync toggle changes so the new interval
  // (or its absence) takes effect immediately.
  useEffect(() => {
    const isDesktop =
      typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
    if (!isDesktop) return;

    try {
      startSync(onSyncComplete, { intervalMs: autoSync ? AUTO_SYNC_INTERVAL_MS : 0 });
    } catch (err) {
      console.error('[OfflineContext] startSync error:', err);
    }
    return () => {
      try { stopSync(); }
      catch (err) { console.error('[OfflineContext] stopSync error:', err); }
    };
  }, [onSyncComplete, autoSync]);

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
    autoSync,
    setAutoSync,
    autoSyncIntervalMs: AUTO_SYNC_INTERVAL_MS,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
