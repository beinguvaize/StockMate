/**
 * SyncStatusButton — header widget that exposes offline / sync state and
 * a manual "Sync Now" trigger. Renders only on desktop (Electron) where
 * offline-first matters most; on the web it stays hidden so the header
 * doesn't clutter for cashier-style use.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, WifiOff, CheckCircle2, AlertCircle, ChevronDown, Zap, Activity } from 'lucide-react';
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

  const { online, syncing, lastSyncAt, pendingCount, syncNow, autoSync, setAutoSync } = useOffline();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  let StatusIcon = CheckCircle2;
  let statusColor = 'text-emerald-500';
  let statusBg = 'bg-emerald-50 border-emerald-200';
  let label = 'Synced';

  if (!online) {
    StatusIcon = WifiOff;
    statusColor = 'text-muted-foreground';
    statusBg = 'bg-muted border-border';
    label = 'Offline';
  } else if (pendingCount > 0) {
    StatusIcon = AlertCircle;
    statusColor = 'text-accent-signature';
    statusBg = 'bg-accent-signature/10 border-accent-signature/25';
    label = `${pendingCount} pending`;
  } else if (syncing) {
    StatusIcon = RefreshCw;
    statusColor = 'text-accent-signature';
    statusBg = 'bg-accent-signature/10 border-accent-signature/25';
    label = 'Syncing';
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => online && !syncing && syncNow()}
          disabled={!online || syncing}
          title={`Last sync: ${fmtRelative(lastSyncAt)}${online ? '' : ' · No internet'}`}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-l-xl border text-[11px] font-black uppercase tracking-widest transition-all hover:shadow-sm disabled:cursor-not-allowed ${statusBg} ${statusColor}`}
        >
          <StatusIcon size={13} className={syncing ? 'animate-spin' : ''} />
          <span className="hidden md:inline">{label}</span>
          {online && !syncing && (
            <span className="hidden lg:inline text-muted-foreground font-medium normal-case text-[10px] ml-1">
              {fmtRelative(lastSyncAt)}
            </span>
          )}
        </button>
        <button type="button" onClick={() => setMenuOpen(o => !o)}
          className={`px-1.5 rounded-r-xl border border-l-0 ${statusBg} ${statusColor} hover:shadow-sm`}>
          <ChevronDown size={12} className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white rounded-2xl border border-black/8 shadow-xl p-3 text-ink-primary">
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1">Sync Settings</div>

          <div className="flex items-center justify-between px-1 py-2 rounded-lg hover:bg-canvas/40">
            <div className="flex items-start gap-2.5">
              <Zap size={14} className="text-accent-signature shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider">Auto sync</div>
                <div className="text-[10px] text-muted-foreground font-medium">Every 10 minutes</div>
              </div>
            </div>
            <button type="button" onClick={() => setAutoSync(!autoSync)}
              className={`relative w-9 h-5 rounded-full transition-colors ${autoSync ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoSync ? 'translate-x-4' : ''}`} />
            </button>
          </div>

          <div className="px-1 py-2 text-[10px] font-bold text-muted-foreground">
            <div>Status: {online ? 'Online' : 'Offline'}</div>
            <div>Pending: {pendingCount}</div>
            <div>Last sync: {fmtRelative(lastSyncAt)}</div>
          </div>

          <button type="button"
            onClick={() => { setMenuOpen(false); online && !syncing && syncNow(); }}
            disabled={!online || syncing}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-ink-primary text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-40">
            Sync Now
          </button>

          <button type="button"
            onClick={() => {
              setMenuOpen(false);
              navigate(tenantSlug ? `/${tenantSlug}/sync-diagnostics` : '/sync-diagnostics');
            }}
            className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-black/10 text-[11px] font-black uppercase tracking-widest hover:bg-canvas/40">
            <Activity size={12} /> View Diagnostics
          </button>
        </div>
      )}
    </div>
  );
};

export default SyncStatusButton;
