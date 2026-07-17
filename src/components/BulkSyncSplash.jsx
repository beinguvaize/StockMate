/**
 * BulkSyncSplash — one-time "setting up offline access" overlay.
 *
 * Renders after a fresh online sign-in on desktop (Electron) only. While
 * visible, `bulkSync()` walks every tenant table and copies it into
 * IndexedDB so subsequent launches can run entirely from cache.
 *
 * Auto-dismisses when bulkSync completes; on error, surfaces a message
 * and a "Continue offline" escape hatch so the user is never trapped.
 */
import React, { useEffect, useState } from 'react';
import { Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { bulkSync, isBulkSyncDone } from '../lib/offline/syncEngine.js';

const isElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent) || !!window?.electron;
};

const BulkSyncSplash = ({ tenantId, onDone }) => {
  const [progress, setProgress] = useState({ table: '', done: 0, total: 0 });
  const [errors, setErrors]     = useState([]);
  const [phase, setPhase]       = useState('checking'); // checking | running | done | error

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isElectron() || !tenantId) {
        onDone?.();
        return;
      }
      const already = await isBulkSyncDone();
      if (already) { onDone?.(); return; }

      setPhase('running');
      const result = await bulkSync(tenantId, (p) => {
        if (!cancelled) setProgress(p);
      });
      if (cancelled) return;

      if (result?.errors?.length) setErrors(result.errors);
      setPhase('done');
      // Auto-dismiss after a beat so users see the green check.
      setTimeout(() => { if (!cancelled) onDone?.(); }, 600);
    };
    run();
    return () => { cancelled = true; };
  }, [tenantId, onDone]);

  if (!isElectron() || phase === 'checking') return null;

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0f1f17]/95 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[420px] bg-white rounded-3xl shadow-2xl p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-signature/15 flex items-center justify-center mb-4">
            {phase === 'running' && <Loader2 size={28} className="text-[#0f1f17] animate-spin" />}
            {phase === 'done'    && <CheckCircle2 size={28} className="text-emerald-500" />}
            {phase === 'error'   && <AlertTriangle size={28} className="text-red-500" />}
          </div>

          <h2 className="text-xl font-black text-ink-primary tracking-tight mb-1">
            {phase === 'running' ? 'Setting up offline access' :
             phase === 'done'    ? 'You\'re ready' :
                                   'Sync incomplete'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {phase === 'running'
              ? 'Downloading your tenant data so every tab works without internet.'
              : phase === 'done'
                ? 'All tabs will now load instantly from your device.'
                : 'Some tables failed to download. You can continue and retry later.'}
          </p>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-accent-signature transition-all duration-300"
              style={{ width: `${phase === 'done' ? 100 : pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between w-full text-[11px] font-mono text-gray-500">
            <span className="flex items-center gap-1.5">
              <Download size={12} />
              {progress.table || '…'}
            </span>
            <span>{progress.done}/{progress.total || '?'} tables</span>
          </div>

          {errors.length > 0 && (
            <div className="mt-4 w-full px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 text-left">
              {errors.length} table{errors.length === 1 ? '' : 's'} couldn't be cached. They'll retry next time you sync.
            </div>
          )}

          {phase === 'running' && (
            <button onClick={onDone}
              className="mt-6 text-[11px] font-bold text-gray-400 hover:text-ink-primary underline underline-offset-4">
              Skip — I'll work online for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkSyncSplash;
