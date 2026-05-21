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
 * Increment the `attempts` counter for an operation.
 * @param {string} opId
 */
export async function bumpAttempts(opId) {
  try {
    const db = await getDb();
    if (!db) return;
    const op = await db.get('outbox', opId);
    if (!op) return;
    await db.put('outbox', { ...op, attempts: (op.attempts || 0) + 1 });
  } catch (err) {
    console.error('[offline/outbox] bumpAttempts error:', err);
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
