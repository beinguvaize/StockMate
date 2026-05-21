/**
 * offline/cache.js
 * Read / write helpers for the `records` and `meta` object stores.
 *
 * Key format: "<table>:<id>"
 * All functions are defensive — they catch and log any IndexedDB errors
 * and return safe empty values so the React app never crashes.
 */

import { getDb } from './db.js';

// ─── records store ───────────────────────────────────────────────────────────

/**
 * Bulk-upsert rows for a table.
 * @param {string} table
 * @param {Array<Object>} rows — each row must have an `id` field
 */
export async function putRecords(table, rows) {
  try {
    if (!rows || rows.length === 0) return;
    const db = await getDb();
    if (!db) return;

    const tx = db.transaction('records', 'readwrite');
    await Promise.all(
      rows.map((row) => {
        const _key = `${table}:${row.id}`;
        return tx.store.put({ _key, table, id: row.id, data: row, updated_at: row.updated_at });
      })
    );
    await tx.done;
  } catch (err) {
    console.error('[offline/cache] putRecords error:', err);
  }
}

/**
 * Return all non-deleted rows for a table.
 * "Deleted" = row.data.deleted_at is a non-null string.
 * @param {string} table
 * @returns {Promise<Array<Object>>}
 */
export async function getRecords(table) {
  try {
    const db = await getDb();
    if (!db) return [];

    const records = await db.getAllFromIndex('records', 'by_table', table);
    return records
      .filter((r) => r.data && !r.data.deleted_at)
      .map((r) => r.data);
  } catch (err) {
    console.error('[offline/cache] getRecords error:', err);
    return [];
  }
}

/**
 * Remove a single record by table + id.
 * @param {string} table
 * @param {string|number} id
 */
export async function removeRecord(table, id) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete('records', `${table}:${id}`);
  } catch (err) {
    console.error('[offline/cache] removeRecord error:', err);
  }
}

/**
 * Wipe the `records` and `meta` stores.
 * Call on logout or tenant switch to prevent cross-tenant data leakage.
 */
export async function clearAll() {
  try {
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction(['records', 'meta'], 'readwrite');
    await Promise.all([tx.objectStore('records').clear(), tx.objectStore('meta').clear()]);
    await tx.done;
  } catch (err) {
    console.error('[offline/cache] clearAll error:', err);
  }
}

// ─── meta store ──────────────────────────────────────────────────────────────

/**
 * Read a meta value.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getMeta(key) {
  try {
    const db = await getDb();
    if (!db) return undefined;
    const entry = await db.get('meta', key);
    return entry?.value;
  } catch (err) {
    console.error('[offline/cache] getMeta error:', err);
    return undefined;
  }
}

/**
 * Write a meta value.
 * @param {string} key
 * @param {any} value
 */
export async function setMeta(key, value) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put('meta', { key, value });
  } catch (err) {
    console.error('[offline/cache] setMeta error:', err);
  }
}
