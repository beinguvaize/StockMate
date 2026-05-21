/**
 * offline/db.js
 * Opens (and memoises) the IndexedDB database `stockmate-offline` via the `idb` wrapper.
 * Exports a single promise `dbPromise` that resolves to the open IDBPDatabase instance.
 *
 * Schema v1:
 *   records  — keyPath "_key" ("<table>:<id>"), index "by_table" on "table"
 *   outbox   — keyPath "opId" (uuid), stores pending writes
 *   meta     — keyPath "key", simple key/value (e.g. "lastSync:<table>")
 */

import { openDB } from 'idb';

let _dbPromise = null;

export function getDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = openDB('stockmate-offline', 1, {
    upgrade(db) {
      // --- records store ---
      if (!db.objectStoreNames.contains('records')) {
        const recordsStore = db.createObjectStore('records', { keyPath: '_key' });
        recordsStore.createIndex('by_table', 'table', { unique: false });
      }

      // --- outbox store ---
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'opId' });
      }

      // --- meta store ---
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
    blocked() {
      console.warn('[offline/db] Database upgrade blocked by another tab.');
    },
    blocking() {
      console.warn('[offline/db] This tab is blocking a database upgrade in another tab.');
    },
    terminated() {
      console.error('[offline/db] Database connection terminated unexpectedly.');
      _dbPromise = null; // allow retry
    },
  }).catch((err) => {
    console.error('[offline/db] Failed to open IndexedDB:', err);
    _dbPromise = null;
    return null;
  });

  return _dbPromise;
}
