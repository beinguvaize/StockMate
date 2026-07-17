/**
 * components/SyncStatus.jsx
 * Compact sync-status indicator for the app header.
 *
 * Shows: colored online/offline dot, pending-writes badge, relative last-sync time,
 * and a manual "sync now" button that spins while syncing.
 *
 * Designed to sit in a flex container in the Navbar without breaking existing layout.
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useOffline } from '../context/OfflineContext.jsx';

function useRelativeTime(isoTs) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!isoTs) {
      setLabel('never');
      return;
    }

    const update = () => {
      const diffSec = Math.floor((Date.now() - new Date(isoTs).getTime()) / 1000);
      if (diffSec < 10) setLabel('just now');
      else if (diffSec < 60) setLabel(`${diffSec}s ago`);
      else if (diffSec < 3600) setLabel(`${Math.floor(diffSec / 60)}m ago`);
      else setLabel(`${Math.floor(diffSec / 3600)}h ago`);
    };

    update();
    const id = setInterval(update, 15_000);
    return () => clearInterval(id);
  }, [isoTs]);

  return label;
}

export default function SyncStatus() {
  const { online, syncing, lastSyncAt, pendingCount, syncNow } = useOffline();
  const relTime = useRelativeTime(lastSyncAt);

  const dotColor = online ? 'bg-emerald-500' : 'bg-gray-400';
  const ringColor = online ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-100 border-gray-200';
  const textColor = online ? 'text-emerald-600' : 'text-gray-500';

  return (
    <div className="flex items-center gap-2">
      {/* Status pill */}
      <div
        className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${ringColor} shadow-sm group cursor-default`}
        title={online ? 'Connected to cloud' : 'Working offline'}
      >
        {/* Dot */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor} ${syncing ? 'animate-pulse' : ''}`} />

        {/* Label */}
        <span className={`text-[10px] font-bold ${textColor} leading-none`}>
          {syncing ? 'Syncing…' : online ? 'Live' : 'Offline'}
        </span>

        {/* Pending badge */}
        {pendingCount > 0 && (
          <span className="ml-0.5 bg-accent-signature/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}

        {/* Tooltip */}
        <div className="absolute top-full right-0 mt-2 w-44 bg-surface rounded-lg border border-black/5 shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[130]">
          <div className="flex items-center gap-1.5 mb-2">
            {online
              ? <Wifi size={11} className="text-emerald-500" />
              : <WifiOff size={11} className="text-gray-400" />}
            <p className="text-[10px] font-bold text-gray-700">
              {online ? 'Online' : 'Offline'}
            </p>
          </div>
          {pendingCount > 0 && (
            <p className="text-[10px] text-accent-signature font-semibold mb-1">
              {pendingCount} pending write{pendingCount !== 1 ? 's' : ''}
            </p>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-black/5">
            <span className="text-[9px] text-gray-500">Last sync</span>
            <span className="text-[9px] font-bold text-ink-primary">{relTime}</span>
          </div>
        </div>
      </div>

      {/* Manual sync button */}
      <button
        onClick={syncNow}
        disabled={syncing}
        title="Sync now"
        className={`w-7 h-7 rounded-full flex items-center justify-center border border-black/5 shadow-sm transition-all
          ${syncing
            ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
            : 'bg-white text-gray-500 hover:text-ink-primary hover:shadow-md active:scale-95'
          }`}
      >
        <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
