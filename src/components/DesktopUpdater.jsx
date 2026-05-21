/**
 * DesktopUpdater — shows update status for the Electron desktop app.
 * Renders nothing on the web build or when there is no update activity.
 *
 * Flow: launch (or Help → Check for Updates…) triggers a check; this
 * card surfaces progress and, when an update is downloaded, offers a
 * one-click "Restart & Update".
 */
import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle2, AlertTriangle, X } from 'lucide-react';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron;

const DesktopUpdater = () => {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!isElectron || !window.electron.updates) return;
    return window.electron.updates.onStatus(setStatus);
  }, []);

  // Auto-dismiss transient "up to date" / dev states.
  useEffect(() => {
    if (status?.state === 'none' || status?.state === 'dev') {
      const t = setTimeout(() => setStatus(null), 4500);
      return () => clearTimeout(t);
    }
  }, [status]);

  const restart = useCallback(() => {
    window.electron?.updates?.install();
  }, []);

  if (!isElectron || !status) return null;

  const { state, version, percent, message } = status;
  if (state === 'available') return null; // download starts immediately

  const dismissable = state === 'none' || state === 'error' || state === 'dev';

  let icon, title, body, accent;
  switch (state) {
    case 'checking':
      icon = <RefreshCw size={16} className="animate-spin" />;
      title = 'Checking for updates…';
      accent = 'text-gray-500';
      break;
    case 'downloading':
      icon = <Download size={16} />;
      title = `Downloading update… ${percent ?? 0}%`;
      accent = 'text-accent-signature';
      break;
    case 'downloaded':
      icon = <CheckCircle2 size={16} />;
      title = `Update ${version || ''} ready`.trim();
      body = 'Restart to apply the update.';
      accent = 'text-emerald-600';
      break;
    case 'none':
      icon = <CheckCircle2 size={16} />;
      title = 'You are on the latest version';
      accent = 'text-emerald-600';
      break;
    case 'dev':
      icon = <RefreshCw size={16} />;
      title = 'Updates are disabled in development';
      accent = 'text-gray-500';
      break;
    case 'error':
      icon = <AlertTriangle size={16} />;
      title = 'Update check failed';
      body = message;
      accent = 'text-red-500';
      break;
    default:
      return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-[200] w-80 bg-white rounded-2xl border border-black/8 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 ${accent}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-ink-primary">{title}</div>
          {body && <div className="text-[11px] text-gray-400 font-medium mt-0.5 break-words">{body}</div>}
        </div>
        {dismissable && (
          <button
            onClick={() => setStatus(null)}
            className="text-gray-300 hover:text-ink-primary transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {state === 'downloading' && (
        <div className="h-1.5 bg-canvas">
          <div
            className="h-full bg-accent-signature transition-all duration-300"
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      )}

      {state === 'downloaded' && (
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={restart}
            className="flex-1 h-10 rounded-xl bg-ink-primary text-white text-xs font-black hover:bg-ink-primary/90 transition-all"
          >
            Restart & Update
          </button>
          <button
            onClick={() => setStatus(null)}
            className="h-10 px-4 rounded-xl border border-black/10 text-xs font-bold text-gray-500 hover:bg-canvas transition-all"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
};

export default DesktopUpdater;
