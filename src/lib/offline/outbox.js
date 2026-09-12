/**
 * offline/outbox.js
 * Persistent write outbox backed by IndexedDB.
 *
 * Each entry: { opId, table, type, payload, createdAt, attempts }
 *   type: 'insert' | 'update' | 'delete'
 *
 * All functions are defensive — they catch and log errors so the app never crashes.
 */

import { getDb } from './db.js';

/**
 * Add an operation to the outbox.
 * @param {{ table: string, type: 'insert'|'update'|'delete', payload: Object }} op
 * @returns {Promise<string>} opId
 */
export async function enqueue({ table, type, payload }) {
  const opId = crypto.randomUUID();
  try {
    const db = await getDb();
    if (!db) return opId;
    await db.add('outbox', {
      opId,
      table,
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
  } catch (err) {
    console.error('[offline/outbox] enqueue error:', err);
  }
  return opId;
}

/**
 * Return all pending operations, oldest first.
 * @returns {Promise<Array>}
 */
export async function allOps() {
  try {
    const db = await getDb();
    if (!db) return [];
    const all = await db.getAll('outbox');
    return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  } catch (err) {
    console.error('[offline/outbox] allOps error:', err);
    return [];
  }
}

/**
 * Remove an operation from the outbox (after successful apply).
 * @param {string} opId
 */
export async function removeOp(opId) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete('outbox', opId);
  } catch (err) {
    console.error('[offline/outbox] removeOp error:', err);
  }
}

/**
 * Increment the `attempts` counter for an operation and, optionally,
 * persist the most recent error message + an explicit status so the
 * Sync Diagnostics screen can show why a job is stuck.
 *
 * @param {string} opId
 * @param {object} [meta] - { lastError, status }
 */
export async function bumpAttempts(opId, meta = {}) {
  try {
    const db = await getDb();
    if (!db) return;
    const op = await db.get('outbox', opId);
    if (!op) return;
    await db.put('outbox', {
      ...op,
      attempts: (op.attempts || 0) + 1,
      lastAttemptAt: new Date().toISOString(),
      lastError: meta.lastError ?? op.lastError ?? null,
      status:    meta.status    ?? op.status    ?? 'PENDING',
    });
  } catch (err) {
    console.error('[offline/outbox] bumpAttempts error:', err);
  }
}

/**
 * Mark every FAILED op back to PENDING with a fresh attempt count of 0,
 * used by the Sync Diagnostics "Retry All" button.
 */
export async function resetFailed() {
  try {
    const db = await getDb();
    if (!db) return 0;
    const all = await db.getAll('outbox');
    let reset = 0;
    const tx = db.transaction('outbox', 'readwrite');
    for (const op of all) {
      if (op.status === 'FAILED') {
        await tx.store.put({
          ...op,
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          lastAttemptAt: null,
        });
        reset += 1;
      }
    }
    await tx.done;
    return reset;
  } catch (err) {
    console.error('[offline/outbox] resetFailed error:', err);
    return 0;
  }
}

/**
 * Wipe every queued op. Called on tenant switch — replaying another
 * tenant's queued writes under a new login would cross-post data.
 */
export async function clearOps() {
  try {
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction('outbox', 'readwrite');
    await tx.objectStore('outbox').clear();
    await tx.done;
  } catch (err) {
    console.error('[offline/outbox] clearOps error:', err);
  }
}

/**
 * Count pending operations.
 * @returns {Promise<number>}
 */
export async function pendingCount() {
  try {
    const db = await getDb();
    if (!db) return 0;
    return await db.count('outbox');
  } catch (err) {
    console.error('[offline/outbox] pendingCount error:', err);
    return 0;
  }
}
