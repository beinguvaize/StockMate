/**
 * hookAdapter.js
 * Thin helpers used by data hooks (useInventory / useSales / usePeople /
 * usePurchases) so they degrade gracefully when supabase is unreachable.
 *
 * Pattern:
 *   const rows = await fetchWithCache('products', () =>
 *     supabase.from('products').select('*').eq('tenant_id', tid).is('deleted_at', null)
 *   );
 *
 * Behaviour:
 *   - Try the network query.
 *   - On success → cache rows + return them.
 *   - On failure → return the cached rows for that table (last good snapshot).
 *
 * Outbox helper:
 *   await queueMutation({ table, type, payload }) — for writes that should
 *   replay when the user taps "Sync Now".
 */

import { putRecords, getRecords } from './cache.js';
import { enqueue } from './outbox.js';

/**
 * Run a supabase select that returns { data, error }. Caches successful
 * results into IndexedDB. Falls back to the cached snapshot on any error
 * (network, timeout, RLS, etc).
 */
export async function fetchWithCache(table, queryFn) {
  try {
    const res = await queryFn();
    if (res?.error) throw res.error;
    const rows = Array.isArray(res?.data) ? res.data : [];
    if (rows.length) {
      try { await putRecords(table, rows); } catch (_) {/* ignore cache write fail */}
    }
    return { data: rows, fromCache: false, error: null };
  } catch (err) {
    try {
      const cached = await getRecords(table);
      return { data: cached, fromCache: true, error: err };
    } catch (_) {
      return { data: [], fromCache: true, error: err };
    }
  }
}

/**
 * Enqueue a write for later replay by the sync engine.
 * Returns the outbox opId.
 */
export async function queueMutation({ table, type = 'insert', payload }) {
  return enqueue({ table, type, payload });
}

/**
 * Convenience: detect whether an error is a network/offline error vs
 * a real domain error (RLS, constraint, etc).
 */
export function isOfflineError(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timed out') ||
    msg.includes('abort') ||
    (typeof navigator !== 'undefined' && !navigator.onLine)
  );
}
