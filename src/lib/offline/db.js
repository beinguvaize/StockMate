/**
 * offline/db.js
 * Opens (and memoises) the IndexedDB database `stockmate-offline`.
 *
 * Schema v1 (kept, still used):
 *   records  — keyPath "_key" ("<table>:<id>"), index "by_table"
 *   outbox   — keyPath "opId"
 *   meta     — keyPath "key"  (e.g. "lastSync:<table>", "cursor:<table>")
 *
 * Schema v2 — the POS-hot tables get their own stores and real indexes.
 * ==========================================================================
 *
 * v1 put every table in one `records` store keyed "<table>:<id>" with a single
 * index on the table name. That shape can answer exactly one question: "give
 * me every row of table X". So a barcode lookup read the whole catalogue into
 * JS and scanned it, which is what the till does today and what stops working
 * at supermarket scale.
 *
 * v2 promotes the tables the counter touches on every sale. The cold tables --
 * around thirty of them -- stay in `records`, because an index nothing queries
 * is write cost for no read benefit.
 *
 * NO DATA IS MIGRATED IN THE UPGRADE, on purpose. An upgrade transaction
 * blocks every tab on the database, and copying 50,000 rows inside one is how
 * a till comes back from a deploy staring at a spinner. The new stores start
 * empty and the readers fall back to `records` until the next sync fills them
 * (see cache.js: getRows). That is the dual-read shim, and it is what makes
 * this a change nobody has to be present for.
 *
 * Index choices are justified one by one against the query that needs them;
 * see the table in each createIndex call. The rule applied throughout: a
 * tenant-scoped query gets a COMPOUND index starting with tenant_id, because
 * every read in this app is tenant-scoped and an index that is not would be
 * scanned and then filtered.
 */

import { openDB } from 'idb';

export const DB_NAME = 'stockmate-offline';
export const DB_VERSION = 2;

/**
 * Tables with their own store in v2. Everything else lives in `records`.
 * Exported so cache.js and the tests agree on the list by construction
 * rather than by two people remembering to edit both.
 */
export const INDEXED_STORES = [
  'products',
  'product_batches',
  'inventory_balances',
  'sales',
  'sale_items',
  'clients',
];

let _dbPromise = null;

/** Create the v2 stores. Split out so a test can build a schema without openDB. */
function createV2Stores(db) {
  if (!db.objectStoreNames.contains('products')) {
    const s = db.createObjectStore('products', { keyPath: 'id' });
    s.createIndex('by_tenant', 'tenant_id');
    // The scan path. multiEntry because one product answers to several codes:
    // the stored barcode and, for a numeric one, its zero-stripped form, so a
    // 12-digit UPC label finds a product entered as 13-digit EAN.
    s.createIndex('by_barcode', 'barcode_keys', { multiEntry: true });
    s.createIndex('by_sku', ['tenant_id', 'sku_norm']);
    // Search. multiEntry over the name's tokens, so "salt" finds "Tata Salt
    // 1kg" -- an index on the whole name could only answer prefix-of-the-name.
    s.createIndex('by_name_token', 'name_tokens', { multiEntry: true });
    s.createIndex('by_category', ['tenant_id', 'category']);
    // Delta pulls advance a cursor over this.
    s.createIndex('by_updated', 'updated_at');
  }

  if (!db.objectStoreNames.contains('product_batches')) {
    const s = db.createObjectStore('product_batches', { keyPath: 'id' });
    s.createIndex('by_tenant', 'tenant_id');
    // FEFO: oldest expiry first, per product. Replaces the query that sent
    // every product id in the catalogue into a URL filter after every sale.
    s.createIndex('fefo', ['tenant_id', 'product_id', 'expiry_date']);
  }

  if (!db.objectStoreNames.contains('inventory_balances')) {
    const s = db.createObjectStore('inventory_balances', { keyPath: 'id' });
    s.createIndex('by_tenant', 'tenant_id');
    s.createIndex('by_product', ['tenant_id', 'product_id']);
    s.createIndex('by_location', ['tenant_id', 'location_id']);
  }

  if (!db.objectStoreNames.contains('sales')) {
    const s = db.createObjectStore('sales', { keyPath: 'id' });
    s.createIndex('by_tenant', 'tenant_id');
    // The till list reads the newest N, not the whole table.
    s.createIndex('by_created', ['tenant_id', 'created_at']);
    // Which rows the server has not acknowledged yet. This is what lets a sale
    // rung offline appear in the list immediately and stop being special once
    // it syncs, instead of being rediscovered by cross-referencing the outbox.
    s.createIndex('by_sync_state', 'sync_state');
  }

  if (!db.objectStoreNames.contains('sale_items')) {
    const s = db.createObjectStore('sale_items', { keyPath: 'id' });
    s.createIndex('by_sale', 'sale_id');
  }

  if (!db.objectStoreNames.contains('clients')) {
    const s = db.createObjectStore('clients', { keyPath: 'id' });
    s.createIndex('by_tenant', 'tenant_id');
    s.createIndex('by_phone', ['tenant_id', 'phone']);
    s.createIndex('by_name_token', 'name_tokens', { multiEntry: true });
  }
}

export function getDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // --- v1 ---
      if (!db.objectStoreNames.contains('records')) {
        const recordsStore = db.createObjectStore('records', { keyPath: '_key' });
        recordsStore.createIndex('by_table', 'table', { unique: false });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'opId' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      // --- v2 ---
      if (oldVersion < 2) createV2Stores(db);
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

/** Drop the memoised handle. Tests reopen; the app does this on sign-out. */
export function resetDbHandle() {
  _dbPromise = null;
}

/**
 * Ask the browser not to evict this origin's storage.
 *
 * Without it IndexedDB is "best effort": under storage pressure the browser
 * may clear it, and an offline-first till that silently loses its catalogue is
 * worse than one that never had it -- it fails at the counter, mid-queue,
 * rather than at setup. Returns false rather than throwing where the API is
 * missing (Safari, older WebViews), because a refusal is informative and an
 * exception here would take the caller down.
 */
export async function persistStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch (err) {
    console.warn('[offline/db] storage.persist() unavailable:', err?.message || err);
    return false;
  }
}
