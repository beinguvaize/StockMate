/**
 * offline/syncEngine.js
 * Sync engine: pushes the outbox to Supabase and pulls remote deltas into IndexedDB.
 *
 * Design:
 *  - Never throws — all errors are caught and logged.
 *  - Module-level `isSyncing` flag prevents concurrent runs.
 *  - startSync() / stopSync() manage the 5-min interval + online listener.
 */

import { supabase } from '../supabase.js';
import { allOps, removeOp, bumpAttempts } from './outbox.js';
import { putRecords, getMeta, setMeta } from './cache.js';

// ─── Config ──────────────────────────────────────────────────────────────────

export const SYNCED_TABLES = [
  'sales',
  'purchases',
  'clients',
  'products',
  'suppliers',
  'expenses',
  'invoices',
  'inventory_balances',
  'inventory_locations',
  'routes',
  'vehicles',
  'employees',
  'day_book',
];

// Manual-only sync. Auto background interval disabled — user said "manual
// sync option to update when needed". Set to 0 to skip the setInterval.
const SYNC_INTERVAL_MS = 0;
const MAX_NON_NETWORK_ATTEMPTS = 5;

// ─── State ───────────────────────────────────────────────────────────────────

let isSyncing = false;
let _intervalId = null;
let _onlineHandler = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNetworkError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch error') ||
    msg.includes('networkerror') ||
    !navigator.onLine
  );
}

// ─── Push outbox → Supabase ──────────────────────────────────────────────────

export async function pushOutbox() {
  if (!supabase) return;
  try {
    const ops = await allOps();
    for (const op of ops) {
      try {
        let result;
        if (op.type === 'rpc') {
          // op.table holds the RPC function name (e.g. "process_sale")
          result = await supabase.rpc(op.table, op.payload);
        } else if (op.type === 'insert') {
          result = await supabase.from(op.table).insert(op.payload);
        } else if (op.type === 'update') {
          result = await supabase.from(op.table).update(op.payload).eq('id', op.payload.id);
        } else if (op.type === 'delete') {
          result = await supabase
            .from(op.table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', op.payload.id);
        }

        if (result?.error) {
          throw result.error;
        }

        await removeOp(op.opId);
      } catch (err) {
        console.warn(`[offline/sync] push failed for op ${op.opId} (${op.type} ${op.table}):`, err);
        await bumpAttempts(op.opId);

        if (isNetworkError(err)) {
          // Stop processing — we'll retry when back online
          break;
        }

        // Non-network error: if too many attempts, skip this op and continue
        const updatedAttempts = (op.attempts || 0) + 1;
        if (updatedAttempts > MAX_NON_NETWORK_ATTEMPTS) {
          console.error(
            `[offline/sync] op ${op.opId} exceeded ${MAX_NON_NETWORK_ATTEMPTS} attempts, leaving in outbox but skipping.`
          );
          // continue loop — do NOT break
        }
        // else: leave in outbox, keep going
      }
    }
  } catch (err) {
    console.error('[offline/sync] pushOutbox threw unexpectedly:', err);
  }
}

// ─── Pull deltas ← Supabase ──────────────────────────────────────────────────

export async function pullDeltas() {
  if (!supabase) return;

  for (const table of SYNCED_TABLES) {
    try {
      const metaKey = `lastSync:${table}`;
      const lastSync = (await getMeta(metaKey)) || '1970-01-01T00:00:00.000Z';

      const { data, error } = await supabase
        .from(table)
        .select('*')
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true })
        .limit(1000);

      if (error) {
        // Table might not exist or RLS blocks it — log and continue
        console.warn(`[offline/sync] pullDeltas error for table "${table}":`, error.message);
        continue;
      }

      if (data && data.length > 0) {
        await putRecords(table, data);

        // Advance the watermark to the latest updated_at seen
        const maxTs = data.reduce(
          (max, row) => (row.updated_at > max ? row.updated_at : max),
          ''
        );
        if (maxTs) {
          await setMeta(metaKey, maxTs);
        }
      }
    } catch (err) {
      console.error(`[offline/sync] pullDeltas threw for table "${table}":`, err);
      // continue with next table
    }
  }
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Run a full sync cycle: push outbox, then pull deltas.
 * Guarded by `isSyncing` so concurrent calls are no-ops.
 * Returns the ISO timestamp of when this sync completed, or null if skipped.
 */
export async function syncNow() {
  if (isSyncing) return null;
  isSyncing = true;
  try {
    await pushOutbox();
    await pullDeltas();
    return new Date().toISOString();
  } catch (err) {
    console.error('[offline/sync] syncNow threw unexpectedly:', err);
    return null;
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the sync loop:
 *  1. Run syncNow() immediately.
 *  2. Schedule syncNow() every 5 minutes.
 *  3. Run syncNow() whenever the browser comes back online.
 *
 * Safe to call multiple times — clears any existing interval/listener first.
 *
 * @param {function} [onSyncComplete] - optional callback(isoTimestamp) after each successful sync
 */
export function startSync(onSyncComplete) {
  stopSync(); // clear any previous handles

  const run = async () => {
    const ts = await syncNow();
    if (ts && typeof onSyncComplete === 'function') {
      try { onSyncComplete(ts); } catch (_) {}
    }
  };

  // Immediate first sync (bootstrap cache).
  run();

  // Periodic auto-sync only if interval > 0 (disabled by default — manual).
  if (SYNC_INTERVAL_MS > 0) {
    _intervalId = setInterval(run, SYNC_INTERVAL_MS);
  }

  // Auto-sync when network restored (cheap, useful).
  _onlineHandler = () => run();
  window.addEventListener('online', _onlineHandler);
}

/**
 * Stop the sync loop (interval + online listener).
 */
export function stopSync() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  if (_onlineHandler !== null) {
    window.removeEventListener('online', _onlineHandler);
    _onlineHandler = null;
  }
}

/** Expose isSyncing for UI polling */
export function getSyncing() {
  return isSyncing;
}
