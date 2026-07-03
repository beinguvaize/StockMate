/**
 * offline/syncEngine.js
 * Sync engine: pushes the outbox to Supabase and pulls remote deltas into IndexedDB.
 *
 * Design:
 *  - Never throws — all errors are caught and logged.
 *  - Module-level `isSyncing` flag prevents concurrent runs.
 *  - startSync() / stopSync() manage the 5-min interval + online listener.
 */

import { supabase, restRpc, restInsert, restUpdate } from '../supabase.js';
import { allOps, removeOp, bumpAttempts } from './outbox.js';
import { putRecords, getMeta, setMeta } from './cache.js';

// Hard ceiling per network call during sync. supabase-js's auth queue can
// deadlock on a stuck token refresh and hang a .from()/.rpc() call forever —
// which froze isSyncing=true, greyed out Sync Now, and left the outbox
// pending count stuck. Every sync call is either a timeout-guarded rest*
// helper or wrapped in this.
const SYNC_CALL_TIMEOUT_MS = 15000;
const withTimeout = (promise, ms = SYNC_CALL_TIMEOUT_MS, label = 'sync call') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

// ─── Config ──────────────────────────────────────────────────────────────────

export const SYNCED_TABLES = [
  'sales',
  'purchases',
  'clients',
  'products',
  'product_categories',
  'suppliers',
  'expenses',
  'invoices',
  'inventory_balances',
  'inventory_locations',
  'product_batches',
  'sale_batch_consumption',
  'movement_log',
  'routes',
  'route_stops',
  'vehicles',
  'employees',
  'users',
  'day_book',
  'client_payments',
  'purchase_returns',
  'business_profile',
  'accounts',
  'account_transactions',
  'estimates',
  'payroll',
  'attendance',
  'supplier_payments',
  'sales_returns',
];

// Default off. UI toggles auto-sync via startSync({ intervalMs }).
const DEFAULT_AUTO_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
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
        // rest* helpers hit PostgREST directly with their own timeout guard —
        // never the supabase-js auth queue (which can deadlock and hang sync).
        let result;
        if (op.type === 'rpc') {
          // op.table holds the RPC function name (e.g. "process_sale")
          result = await withTimeout(restRpc(op.table, op.payload), SYNC_CALL_TIMEOUT_MS, `rpc ${op.table}`);
        } else if (op.type === 'insert') {
          result = await withTimeout(restInsert(op.table, op.payload), SYNC_CALL_TIMEOUT_MS, `insert ${op.table}`);
        } else if (op.type === 'update') {
          result = await withTimeout(restUpdate(op.table, op.payload, { id: op.payload.id }), SYNC_CALL_TIMEOUT_MS, `update ${op.table}`);
        } else if (op.type === 'delete') {
          result = await withTimeout(
            restUpdate(op.table, { deleted_at: new Date().toISOString() }, { id: op.payload.id }),
            SYNC_CALL_TIMEOUT_MS, `delete ${op.table}`);
        }

        if (result?.error) {
          throw result.error;
        }

        await removeOp(op.opId);
      } catch (err) {
        console.warn(`[offline/sync] push failed for op ${op.opId} (${op.type} ${op.table}):`, err);

        if (isNetworkError(err)) {
          // Don't burn an attempt for transient network failures — we'll
          // retry when back online. Just mark PROCESSING with the error.
          await bumpAttempts(op.opId, {
            lastError: String(err.message || err),
            status: 'PENDING',
          });
          break;
        }

        // Non-network error: bump attempts, mark FAILED if we've hit the
        // ceiling so the UI can surface it for manual intervention.
        const updatedAttempts = (op.attempts || 0) + 1;
        const failed = updatedAttempts > MAX_NON_NETWORK_ATTEMPTS;
        await bumpAttempts(op.opId, {
          lastError: String(err.message || err.details || err),
          status: failed ? 'FAILED' : 'PENDING',
        });
        if (failed) {
          console.error(
            `[offline/sync] op ${op.opId} exceeded ${MAX_NON_NETWORK_ATTEMPTS} attempts → FAILED.`
          );
        }
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

      const { data, error } = await withTimeout(
        supabase
          .from(table)
          .select('*')
          .gt('updated_at', lastSync)
          .order('updated_at', { ascending: true })
          .limit(1000),
        SYNC_CALL_TIMEOUT_MS, `pull ${table}`);

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

// ─── Bulk pull-down (one-shot after first online sign-in) ────────────────────
//
// `bulkSync` walks every tenant table in SYNCED_TABLES and copies the full
// row set into IndexedDB. Runs ONCE after a fresh sign-in so subsequent
// launches can render every tab from cache without a single network call.
// Subsequent runs of `pullDeltas` keep the cache fresh.
//
// onProgress({ table, done, total }) — UI hook for the splash screen.

const PAGE_SIZE = 1000;

export async function bulkSync(tenantId, onProgress) {
  if (!supabase || !tenantId) return { ok: false, error: 'missing tenant' };

  const tables = SYNCED_TABLES;
  let done = 0;
  const errors = [];

  for (const table of tables) {
    try {
      let from = 0;
      // Page through to handle tenants with many invoices/sales/etc.
      // Some tables (business_profile, users) may not have tenant_id; we
      // try with the filter first and fall back to unfiltered if rejected.
      while (true) {
        let q = supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
        // tenant filter where applicable
        try {
          const { data, error } = await withTimeout(q.eq('tenant_id', tenantId), SYNC_CALL_TIMEOUT_MS, `bulk ${table}`);
          if (error) throw error;
          if (data && data.length) {
            await putRecords(table, data);
            // advance watermark to newest updated_at if column exists
            const maxTs = data.reduce(
              (m, r) => (r?.updated_at && r.updated_at > m ? r.updated_at : m), ''
            );
            if (maxTs) await setMeta(`lastSync:${table}`, maxTs);
            if (data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
          } else break;
        } catch (filterErr) {
          // Retry without tenant filter (e.g. users for global admin)
          if (String(filterErr.message || '').includes('column') && from === 0) {
            const { data, error } = await supabase
              .from(table)
              .select('*')
              .range(0, PAGE_SIZE - 1);
            if (!error && data?.length) await putRecords(table, data);
          }
          break;
        }
      }
    } catch (err) {
      errors.push({ table, error: String(err.message || err) });
      console.warn(`[bulkSync] ${table} failed:`, err);
    } finally {
      done += 1;
      if (typeof onProgress === 'function') {
        try { onProgress({ table, done, total: tables.length }); } catch (_) {}
      }
    }
  }

  // Mark as complete — used by the splash to skip on subsequent launches.
  await setMeta('bulkSyncCompletedAt', new Date().toISOString());
  return { ok: true, errors };
}

export async function isBulkSyncDone() {
  const ts = await getMeta('bulkSyncCompletedAt');
  return !!ts;
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
export function startSync(onSyncComplete, opts = {}) {
  stopSync(); // clear any previous handles

  const run = async () => {
    const ts = await syncNow();
    if (ts && typeof onSyncComplete === 'function') {
      try { onSyncComplete(ts); } catch (_) {}
    }
  };

  // Immediate first sync (bootstrap cache).
  run();

  // Auto-sync interval (opts.intervalMs > 0 to enable). Caller decides
  // — UI persists user toggle in localStorage and passes 10 min when on.
  const intervalMs = Number(opts.intervalMs) || 0;
  if (intervalMs > 0) {
    _intervalId = setInterval(run, intervalMs);
  }

  // Auto-sync when network restored (cheap, useful).
  _onlineHandler = () => run();
  window.addEventListener('online', _onlineHandler);
}

export const AUTO_SYNC_INTERVAL_MS = DEFAULT_AUTO_INTERVAL_MS;

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
