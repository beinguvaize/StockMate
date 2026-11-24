/**
 * offline/cache.js
 * Read / write helpers for the `records` and `meta` object stores.
 *
 * Key format: "<table>:<id>"
 * All functions are defensive — they catch and log any IndexedDB errors
 * and return safe empty values so the React app never crashes.
 */

import { getDb, INDEXED_STORES } from './db.js';
import { productKeys, nameTokens } from './normalise.js';

/**
 * Rows per write transaction.
 *
 * putRecords used to open ONE transaction and await a put per row. At a few
 * hundred rows that is invisible; at 50,000 it is the slowest part of the
 * first sync and it holds the store the whole time. Batching bounds how long
 * any single transaction is open, which is what lets a bulk load be
 * interrupted and resumed rather than restarted.
 */
export const WRITE_BATCH = 2000;

/** Does this table have its own v2 store, or does it live in `records`? */
export const hasOwnStore = (table) => INDEXED_STORES.includes(table);

/**
 * The derived lookup keys for a row, by table.
 *
 * Computed on write because IndexedDB cannot compare case-insensitively at
 * read time. Only the two tables that are searched carry them.
 */
function decorate(table, row) {
  if (table === 'products') return { ...row, ...productKeys(row) };
  if (table === 'clients') return { ...row, name_tokens: nameTokens(row?.name) };
  return row;
}

// ─── row stores ──────────────────────────────────────────────────────────────

/**
 * Bulk-upsert rows for a table, into its own store when it has one.
 * @param {string} table
 * @param {Array<Object>} rows — each row must have an `id` field
 */
export async function putRecords(table, rows) {
  try {
    if (!rows || rows.length === 0) return;
    const db = await getDb();
    if (!db) return;

    const own = hasOwnStore(table) && db.objectStoreNames.contains(table);

    for (let i = 0; i < rows.length; i += WRITE_BATCH) {
      const slice = rows.slice(i, i + WRITE_BATCH);
      const tx = db.transaction(own ? table : 'records', 'readwrite');
      await Promise.all(
        slice.map((row) => (own
          ? tx.store.put(decorate(table, row))
          : tx.store.put({
            _key: `${table}:${row.id}`, table, id: row.id, data: row, updated_at: row.updated_at,
          }))),
      );
      await tx.done;
    }
  } catch (err) {
    console.error('[offline/cache] putRecords error:', err);
  }
}

/**
 * Return all non-deleted rows for a table.
 *
 * DUAL READ. A table promoted to its own store in v2 is read from there, but
 * an install upgrading from v1 has an empty new store and a full `records`
 * store until the next sync -- the upgrade deliberately copies nothing (see
 * db.js). So an empty own-store falls back to `records` rather than reporting
 * an empty catalogue, which at the till would look exactly like a shop with no
 * products in it.
 *
 * "Deleted" = deleted_at is non-null. Kept as a read-time filter as well as a
 * pull-time one: belt and braces on the one thing that must never be sold.
 */
export async function getRecords(table) {
  try {
    const db = await getDb();
    if (!db) return [];

    if (hasOwnStore(table) && db.objectStoreNames.contains(table)) {
      const rows = await db.getAll(table);
      if (rows.length) return rows.filter((r) => r && !r.deleted_at);
      // fall through to the v1 store
    }

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
    // Both places: a row cached before the v2 upgrade still sits in `records`,
    // and a tombstone that only clears one of them leaves the row readable
    // through the dual read above.
    if (hasOwnStore(table) && db.objectStoreNames.contains(table)) {
      await db.delete(table, id);
    }
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
    // Every row store, not just `records`. This runs on logout and tenant
    // switch, so a store left behind is one tenant's catalogue visible to the
    // next person to sign in on that machine.
    const stores = ['records', 'meta', ...INDEXED_STORES.filter((t) => db.objectStoreNames.contains(t))];
    const tx = db.transaction(stores, 'readwrite');
    await Promise.all(stores.map((name) => tx.objectStore(name).clear()));
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
