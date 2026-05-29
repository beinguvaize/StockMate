/**
 * SyncDiagnostics — desktop-only screen.
 *
 * Lists every job currently in the IndexedDB outbox with its last error,
 * lets the operator manually retry, replay one-by-one, or export the queue
 * as a JSON file so an admin can replay server-side. Mirrors the mobile
 * Sync Diagnostics screen so support flows are the same on both surfaces.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Download, ArrowLeft, AlertTriangle, CheckCircle2, Loader2, Play } from 'lucide-react';
import { allOps, removeOp, resetFailed } from '../lib/offline/outbox.js';
import { syncNow } from '../lib/offline/syncEngine.js';
import { supabase } from '../lib/supabase';

const isElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent) || !!window?.electron;
};

const statusStyle = (s) => {
  switch (s) {
    case 'FAILED':     return 'bg-red-50 text-red-700 border-red-200';
    case 'PROCESSING': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'PENDING':
    default:           return 'bg-amber-50 text-amber-700 border-amber-200';
  }
};

const SyncDiagnostics = () => {
  const navigate = useNavigate();
  const [jobs, setJobs]       = useState([]);
  const [busy, setBusy]       = useState(false);
  const [status, setStatus]   = useState(null);
  const [replaying, setReplaying] = useState({}); // opId -> bool

  const refresh = useCallback(async () => {
    const all = await allOps();
    setJobs(all);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!isElectron()) {
    return (
      <div className="p-10">
        <p className="text-sm text-gray-600">Sync Diagnostics is desktop-only.</p>
      </div>
    );
  }

  const onRetryAll = async () => {
    setBusy(true); setStatus(null);
    try {
      const reset = await resetFailed();
      const ts = await syncNow();
      setStatus(`Retried ${reset} failed job${reset === 1 ? '' : 's'}. Sync ${ts ? 'completed' : 'skipped'}.`);
      await refresh();
    } catch (err) {
      setStatus(`Retry error: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const onExport = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      count: jobs.length,
      jobs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync_queue_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Exported ${jobs.length} job${jobs.length === 1 ? '' : 's'}.`);
  };

  // Replay a single job directly against supabase, bypassing the sync engine.
  // Used when a job is stuck and the operator wants to confirm what the server
  // says. On success the op is removed from the outbox.
  const onReplay = async (op) => {
    setReplaying((m) => ({ ...m, [op.opId]: true }));
    try {
      let res;
      if (op.type === 'rpc') {
        res = await supabase.rpc(op.table, op.payload);
      } else if (op.type === 'insert') {
        res = await supabase.from(op.table).insert(op.payload);
      } else if (op.type === 'update') {
        res = await supabase.from(op.table).update(op.payload).eq('id', op.payload.id);
      } else if (op.type === 'delete') {
        res = await supabase.from(op.table).update({ deleted_at: new Date().toISOString() }).eq('id', op.payload.id);
      }
      if (res?.error) throw res.error;
      await removeOp(op.opId);
      setStatus(`Job ${op.opId.slice(0, 8)} replayed OK and removed.`);
      await refresh();
    } catch (err) {
      setStatus(`Replay error for ${op.opId.slice(0, 8)}: ${err.message || err}`);
    } finally {
      setReplaying((m) => ({ ...m, [op.opId]: false }));
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-600 mb-6 hover:text-ink-primary">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-ink-primary tracking-tight">Sync Diagnostics</h1>
          <p className="text-sm text-gray-500 mt-1">
            {jobs.length} job{jobs.length === 1 ? '' : 's'} in the outbox.
            Retry, replay individual jobs, or export the queue.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={busy}
            className="px-3 py-2 rounded-lg border border-black/10 text-sm font-bold hover:bg-canvas/40 disabled:opacity-40">
            Refresh
          </button>
          <button onClick={onExport} disabled={!jobs.length}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-black/10 text-sm font-bold hover:bg-canvas/40 disabled:opacity-40">
            <Download size={14} /> Export JSON
          </button>
          <button onClick={onRetryAll} disabled={busy || !jobs.length}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-primary text-white text-sm font-bold disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Retry All
          </button>
        </div>
      </div>

      {status && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-canvas/60 text-sm text-ink-primary">
          {status}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
          <p className="text-sm font-bold text-ink-primary">Outbox is empty</p>
          <p className="text-xs text-gray-500 mt-1">All writes have been synced to Supabase.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((op) => {
            const s = op.status || 'PENDING';
            return (
              <div key={op.opId} className="bg-white rounded-xl border border-black/8 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest border ${statusStyle(s)}`}>
                      {s}
                    </span>
                    <span className="text-xs font-mono text-gray-400">#{op.opId.slice(0, 8)}</span>
                    <span className="text-xs text-gray-500">
                      {op.attempts || 0} attempt{op.attempts === 1 ? '' : 's'}
                    </span>
                  </div>
                  <button onClick={() => onReplay(op)} disabled={!!replaying[op.opId]}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-bold border border-black/10 hover:bg-canvas/40 disabled:opacity-40">
                    {replaying[op.opId] ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    Replay
                  </button>
                </div>

                <div className="text-sm font-bold text-ink-primary">
                  {op.type === 'rpc' ? `RPC: ${op.table}` : `${op.type.toUpperCase()} ${op.table}`}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Created {op.createdAt ? new Date(op.createdAt).toLocaleString() : 'unknown'}
                  {op.lastAttemptAt && <> · Last attempt {new Date(op.lastAttemptAt).toLocaleString()}</>}
                </div>

                {op.lastError && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
                      <div className="text-[11px] font-mono text-red-700 break-all">
                        {op.lastError}
                      </div>
                    </div>
                  </div>
                )}

                <details className="mt-2">
                  <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-ink-primary">
                    payload
                  </summary>
                  <pre className="mt-2 px-3 py-2 rounded-lg bg-canvas/40 text-[10px] font-mono text-gray-700 overflow-x-auto">
                    {JSON.stringify(op.payload, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SyncDiagnostics;
