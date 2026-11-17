/**
 * useOfflineGrace - desktop only. While offline, reports how long the machine
 * has been offline and how many grace days are left. Returns null otherwise.
 */
import { useEffect, useState } from 'react';
import { useOffline } from '../../context/OfflineContext.jsx';
import { isElectron, loadBootstrap, graceInfo } from './authGuard.js';

export function useOfflineGrace() {
  const { online, pendingCount } = useOffline();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (online || !isElectron()) { setInfo(null); return undefined; }
    let alive = true;
    const run = async () => {
      try {
        const b = await loadBootstrap();
        if (!alive || !b?.validatedAt) return;
        const now = Date.now();
        setInfo({
          ...graceInfo(b, now),
          daysOffline: Math.max(0, Math.floor((now - b.validatedAt) / 86400000)),
        });
      } catch (err) {
        console.warn('[useOfflineGrace] could not read bootstrap:', err);
      }
    };
    run();
    const id = setInterval(run, 60 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [online]);

  return info ? { ...info, pendingCount: pendingCount || 0 } : null;
}
