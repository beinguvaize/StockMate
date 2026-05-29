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

// Offline scaffolding is desktop-only. Web users get the original
// supabase-direct behaviour — no cache writes, no outbox.
export const isElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent) || !!(typeof window !== 'undefined' && window.electron);
};

/**
 * Run a supabase select that returns { data, error }. Caches successful
 * results into IndexedDB. Falls back to the cached snapshot on any error
 * (network, timeout, RLS, etc).
 */
// Hard ceiling on every desktop network read. If supabase doesn't respond
// in this window we abandon it and fall back to the IDB cache. Without this,
// an offline / unreachable PostgREST hangs the loading screen indefinitely.
const NETWORK_TIMEOUT_MS = 3000;

const withTimeout = (promise, ms, label = 'request') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

export async function fetchWithCache(table, queryFn) {
  // Web → pass through, no caching. Keeps web hooks 1:1 with previous
  // behaviour so nothing on the cashier surface changes.
  if (!isElectron()) {
    const res = await queryFn();
    if (res?.error) throw res.error;
    return { data: Array.isArray(res?.data) ? res.data : [], fromCache: false, error: null };
  }

  // Offline short-circuit: skip the network probe entirely when the OS
  // says we're offline. Saves the 3s timeout + avoids spinner thrash.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    try {
      const cached = await getRecords(table);
      return { data: cached, fromCache: true, error: new Error('offline') };
    } catch (_) {
      return { data: [], fromCache: true, error: new Error('offline') };
    }
  }

  try {
    const res = await withTimeout(queryFn(), NETWORK_TIMEOUT_MS, `${table} fetch`);
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
  // Outbox queue only meaningful on desktop. Web hooks should never call
  // this — if they do, no-op so we don't grow web's IDB silently.
  if (!isElectron()) return null;
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

/**
 * Optimistic local cache mutation — used when a write was queued to the
 * outbox so the UI reflects the change immediately without a sync.
 * Desktop-only; web no-ops.
 *
 *   - upsertCachedRow('expenses', newExpense)
 *   - decrementCachedStock([{ id, quantity }])
 */
export async function upsertCachedRow(table, row) {
  if (!isElectron() || !row || !row.id) return;
  try { await putRecords(table, [row]); } catch (_) {}
}

export async function decrementCachedStock(items = []) {
  if (!isElectron() || !items.length) return;
  try {
    const cached = await getRecords('products');
    if (!cached.length) return;
    const decBy = new Map();
    for (const it of items) {
      const pid = it.id || it.productId;
      const qty = Number(it.quantity || 0);
      if (!pid || qty <= 0) continue;
      decBy.set(pid, (decBy.get(pid) || 0) + qty);
    }
    if (!decBy.size) return;
    const updated = cached
      .filter(p => decBy.has(p.id))
      .map(p => ({ ...p, stock: Math.max(0, Number(p.stock || 0) - decBy.get(p.id)) }));
    if (updated.length) await putRecords('products', updated);
  } catch (_) {/* ignore — cache is best-effort */}
}
