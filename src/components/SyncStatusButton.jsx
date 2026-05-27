/**
 * SyncStatusButton — header widget that exposes offline / sync state and
 * a manual "Sync Now" trigger. Renders only on desktop (Electron) where
 * offline-first matters most; on the web it stays hidden so the header
 * doesn't clutter for cashier-style use.
 */
import React from 'react';
import { RefreshCw, Wifi, WifiOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { useOffline } from '../context/OfflineContext';

const isElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent) || !!window?.electron;
};

const fmtRelative = (iso) => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)   return 'just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const SyncStatusButton = () => {
  if (!isElectron()) return null;

  const { online, syncing, lastSyncAt, pendingCount, syncNow } = useOffline();

  let StatusIcon = CheckCircle2;
  let statusColor = 'text-emerald-500';
  let statusBg = 'bg-emerald-50 border-emerald-200';
  let label = 'Synced';

  if (!online) {
    StatusIcon = WifiOff;
    statusColor = 'text-gray-500';
    statusBg = 'bg-gray-100 border-gray-200';
    label = 'Offline';
  } else if (pendingCount > 0) {
    StatusIcon = AlertCircle;
    statusColor = 'text-amber-600';
    statusBg = 'bg-amber-50 border-amber-200';
    label = `${pendingCount} pending`;
  } else if (syncing) {
    StatusIcon = RefreshCw;
    statusColor = 'text-indigo-500';
    statusBg = 'bg-indigo-50 border-indigo-200';
    label = 'Syncing';
  }

  return (
    <button
      type="button"
      onClick={() => online && !syncing && syncNow()}
      disabled={!online || syncing}
      title={`Last sync: ${fmtRelative(lastSyncAt)}${online ? '' : ' · No internet'}`}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all hover:shadow-sm disabled:cursor-not-allowed ${statusBg} ${statusColor}`}
    >
      <StatusIcon size={13} className={syncing ? 'animate-spin' : ''} />
      <span className="hidden md:inline">{label}</span>
      {online && !syncing && (
        <span className="hidden lg:inline text-gray-400 font-medium normal-case text-[10px] ml-1">
          {fmtRelative(lastSyncAt)}
        </span>
      )}
    </button>
  );
};

export default SyncStatusButton;
