import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';

/**
 * The local catalogue: schema, upgrade, and the lookups the till depends on.
 * ==========================================================================
 *
 * Runs under vitest's `environment: 'node'` -- fake-indexeddb supplies the
 * whole API, so no jsdom and no browser. That matters because the thing most
 * likely to break here is the UPGRADE from v1, and an upgrade is only testable
 * against a database that already has v1 data in it.
 */

import { barcodeKeys, skuNorm, nameTokens, prefixRange } from './normalise.js';
import { tierOf, POS_CRITICAL, CACHED_WINDOW, ONLINE_ONLY, CACHED_TABLES } from './tiers.js';

const DB_NAME = 'stockmate-offline';

/** Build a v1 database with rows in it, exactly as a shipped install has. */
async function seedV1(rows) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(d) {
      const r = d.createObjectStore('records', { keyPath: '_key' });
      r.createIndex('by_table', 'table', { unique: false });
      d.createObjectStore('outbox', { keyPath: 'opId' });
      d.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  const tx = db.transaction('records', 'readwrite');
  for (const row of rows) {
    await tx.store.put({ _key: `products:${row.id}`, table: 'products', id: row.id, data: row });
  }
  await tx.done;
  db.close();
}



/**
 * Every opened connection, so it can be closed before the next test deletes
 * the database. An open handle makes deleteDatabase fire `blocked` and hang --
 * which it did, as a 10s hook timeout on six tests, until these were tracked.
 */
let open = [];

const freshModules = async () => {
  vi.resetModules();
  const dbMod = await import('./db.js');
  const cache = await import('./cache.js');
  dbMod.resetDbHandle();
  const handle = await dbMod.getDb();
  if (handle) open.push(handle);
  return { ...dbMod, ...cache };
};

const wipe = () => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase(DB_NAME);
  req.onsuccess = req.onerror = req.onblocked = () => resolve();
});

afterEach(async () => {
  for (const h of open) { try { h.close(); } catch { /* already closed */ } }
  open = [];
  await wipe();
});

beforeEach(async () => {
  await wipe();
  vi.resetModules();
});

describe('normalising lookup keys', () => {
  it('matches a barcode whatever case and spacing it arrives in', () => {
    expect(barcodeKeys(' 89012345 ')).toContain('89012345');
    expect(barcodeKeys('AbC123')).toContain('abc123');
  });

  it('matches a 12-digit UPC label against a 13-digit EAN product', () => {
    // The label says 012345678905; the product was entered as the EAN form.
    // Both must resolve, or the item "is not in the system" while on the shelf.
    const stored = barcodeKeys('0012345678905');
    expect(stored).toContain('0012345678905');
    expect(stored).toContain('12345678905');
  });

  it('never reduces an all-zero code to the empty string', () => {
    // '' in a multiEntry index would match on every empty lookup.
    expect(barcodeKeys('0000')).toEqual(['0000']);
    expect(barcodeKeys('')).toEqual([]);
    expect(barcodeKeys(null)).toEqual([]);
  });

  it('keeps SKU comparison whole and case-insensitive', () => {
    expect(skuNorm(' SKU-001 ')).toBe('sku-001');
  });

  it('tokenises a name the way a cashier searches it', () => {
    expect(nameTokens('Tata Salt 1kg')).toEqual(['1kg', 'salt', 'tata']);
    // Single characters match a large share of the catalogue and are dropped.
    expect(nameTokens('A B Rice')).toEqual(['rice']);
    expect(nameTokens('')).toEqual([]);
  });

  it('builds a prefix range that stops at the prefix', () => {
    const r = prefixRange('sal', IDBKeyRange);
    expect(r.lower).toBe('sal');
    expect(r.upper).toBe('sal￿');
    expect(prefixRange('', IDBKeyRange)).toBeNull();
  });
});

describe('tiers', () => {
  it('puts every table in exactly one tier', () => {
    const all = [...POS_CRITICAL, ...CACHED_WINDOW, ...ONLINE_ONLY];
    expect(new Set(all).size, 'a table appears in two tiers').toBe(all.length);
  });

  it('covers every table the sync engine downloads', async () => {
    const { SYNCED_TABLES } = await import('./syncEngine.js');
    const unclassified = SYNCED_TABLES.filter((t) => tierOf(t) === null);
    expect(
      unclassified,
      'these are synced but belong to no tier — decide what the till needs them for',
    ).toEqual([]);
  });

  it('keeps the ledger out of the cache', () => {
    // Every balance is a sum over account_transactions, so a partial copy is a
    // confident wrong number rather than a short list.
    expect(tierOf('account_transactions')).toBe('online');
    expect(CACHED_TABLES).not.toContain('account_transactions');
  });

  it('puts the billing tables in the complete tier', () => {
    for (const t of ['products', 'clients', 'inventory_balances', 'product_batches']) {
      expect(tierOf(t)).toBe('critical');
    }
  });
});

describe('the v1 to v2 upgrade', () => {
  it('does not lose a catalogue that was cached before the upgrade', async () => {
    // THE failure mode worth a test: the upgrade copies nothing, so if the
    // readers did not fall back the till would open on an empty catalogue.
    await seedV1([
      { id: 'P1', tenant_id: 'T1', name: 'Tata Salt 1kg', barcode: '8901234567890', sku: 'SKU-1' },
      { id: 'P2', tenant_id: 'T1', name: 'Amul Butter', barcode: '8900000000017', sku: 'SKU-2' },
    ]);

    const { getRecords, getDb } = await freshModules();
    const db = await getDb();
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['products', 'sale_items']));

    const rows = await getRecords('products');
    expect(rows.map((r) => r.id).sort()).toEqual(['P1', 'P2']);
  });

  it('prefers the new store once the next sync has filled it', async () => {
    await seedV1([{ id: 'OLD', tenant_id: 'T1', name: 'Stale row', barcode: '111' }]);
    const { putRecords, getRecords } = await freshModules();

    await putRecords('products', [{ id: 'NEW', tenant_id: 'T1', name: 'Fresh row', barcode: '222' }]);
    const rows = await getRecords('products');
    expect(rows.map((r) => r.id)).toEqual(['NEW']);
  });
});

describe('the indexes the till actually uses', () => {
  const catalogue = [
    { id: 'P1', tenant_id: 'T1', name: 'Tata Salt 1kg', barcode: '0012345678905', sku: 'SKU-1', category: 'Grocery' },
    { id: 'P2', tenant_id: 'T1', name: 'Amul Salted Butter', barcode: '8900000000017', sku: 'SKU-2', category: 'Dairy' },
    { id: 'P3', tenant_id: 'T2', name: 'Other tenant salt', barcode: '7000000000001', sku: 'SKU-3', category: 'Grocery' },
  ];

  it('resolves a scan with one index lookup, including the UPC form', async () => {
    const { putRecords, getDb } = await freshModules();
    await putRecords('products', catalogue);
    const db = await getDb();

    expect((await db.getFromIndex('products', 'by_barcode', '0012345678905'))?.id).toBe('P1');
    // the same product, scanned from a 12-digit label
    expect((await db.getFromIndex('products', 'by_barcode', '12345678905'))?.id).toBe('P1');
    expect(await db.getFromIndex('products', 'by_barcode', 'nosuchcode')).toBeUndefined();
  });

  it('resolves a SKU within the tenant, not across tenants', async () => {
    const { putRecords, getDb } = await freshModules();
    await putRecords('products', catalogue);
    const db = await getDb();

    expect((await db.getFromIndex('products', 'by_sku', ['T1', 'sku-1']))?.id).toBe('P1');
    expect(await db.getFromIndex('products', 'by_sku', ['T1', 'sku-3'])).toBeUndefined();
  });

  it('finds a product by a word in the middle of its name', async () => {
    const { putRecords, getDb } = await freshModules();
    await putRecords('products', catalogue);
    const db = await getDb();

    const hits = await db.getAllFromIndex('products', 'by_name_token', 'salt');
    expect(hits.map((r) => r.id).sort()).toEqual(['P1', 'P3']);
  });

  it('answers a prefix search without reading the catalogue', async () => {
    const { putRecords, getDb } = await freshModules();
    await putRecords('products', catalogue);
    const db = await getDb();

    const hits = await db.getAllFromIndex('products', 'by_name_token', prefixRange('sal', IDBKeyRange));
    expect(hits.map((r) => r.id).sort()).toEqual(['P1', 'P2', 'P3']);
  });

  it('reads one product batch set by FEFO rather than every batch', async () => {
    const { putRecords, getDb } = await freshModules();
    await putRecords('product_batches', [
      { id: 'B1', tenant_id: 'T1', product_id: 'P1', expiry_date: '2026-12-01', qty_remaining: 5 },
      { id: 'B2', tenant_id: 'T1', product_id: 'P1', expiry_date: '2026-06-01', qty_remaining: 3 },
      { id: 'B3', tenant_id: 'T1', product_id: 'P2', expiry_date: '2026-01-01', qty_remaining: 9 },
    ]);
    const db = await getDb();

    const forP1 = await db.getAllFromIndex('product_batches', 'fefo',
      IDBKeyRange.bound(['T1', 'P1', ''], ['T1', 'P1', '￿']));
    // Index order IS expiry order, so FEFO needs no sort in JS.
    expect(forP1.map((b) => b.id)).toEqual(['B2', 'B1']);
  });
});

describe('writing at scale', () => {
  it('batches a 50k catalogue instead of one long transaction', async () => {
    const { putRecords, getRecords, WRITE_BATCH } = await freshModules();
    expect(WRITE_BATCH).toBeLessThanOrEqual(5000);

    const big = Array.from({ length: 50_000 }, (_, i) => ({
      id: `P${i}`, tenant_id: 'T1', name: `Product ${i}`,
      barcode: String(8900000000000 + i), sku: `SKU-${i}`,
    }));
    await putRecords('products', big);

    const rows = await getRecords('products');
    expect(rows.length).toBe(50_000);
  }, 120_000);
});

describe('clearing on sign-out', () => {
  it('empties the new stores too, not just records', async () => {
    const { putRecords, clearAll, getRecords } = await freshModules();
    await putRecords('products', [{ id: 'P1', tenant_id: 'T1', name: 'Salt' }]);
    await putRecords('suppliers', [{ id: 'S1', tenant_id: 'T1', name: 'A supplier' }]);

    await clearAll();

    // A store left behind is one tenant's catalogue visible to whoever signs
    // in next on that machine.
    expect(await getRecords('products')).toEqual([]);
    expect(await getRecords('suppliers')).toEqual([]);
  });
});
