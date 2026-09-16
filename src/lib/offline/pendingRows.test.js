import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A sale rung up offline must not vanish from history when the connection
 * comes back but before the outbox has synced.
 *
 * The bug: readCacheThenRevalidate handed onRefresh the SERVER's rows verbatim.
 * The server has not seen the queued sale yet, so the hook's state dropped it
 * and the bill disappeared from the list. It came back only after a sync —
 * which to the person who rang it up is indistinguishable from losing it.
 */

const cacheRows = [];
const outboxOps = [];

vi.mock('./cache.js', () => ({
  getRecords: vi.fn(async () => cacheRows),
  putRecords: vi.fn(async () => {}),
}));
vi.mock('./outbox.js', () => ({
  enqueue: vi.fn(async () => 'op-1'),
  allOps: vi.fn(async () => outboxOps),
}));
vi.mock('./syncEngine.js', () => ({ syncNow: vi.fn(), SYNCED_TABLES: [] }), { virtual: true });

const OFFLINE_SALE = { id: 'SAL-OFFLINE-1', totalAmount: 250 };
const SERVER_SALE  = { id: 'SAL-SYNCED-9',  totalAmount: 100 };

beforeEach(() => {
  cacheRows.length = 0;
  outboxOps.length = 0;
  // Desktop: the offline layer is desktop-only.
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Electron/30.0', onLine: true },
    configurable: true,
  });
});

const load = async () => (await import('./hookAdapter.js')).readCacheThenRevalidate;

describe('a sale waiting in the outbox survives a revalidate', () => {
  it('keeps the queued sale when the server has not got it yet', async () => {
    cacheRows.push(OFFLINE_SALE, SERVER_SALE);
    // process_sale carries the sale id as p_id, not id.
    outboxOps.push({ table: 'process_sale', type: 'rpc', payload: { p_id: 'SAL-OFFLINE-1' } });

    const readCacheThenRevalidate = await load();
    let refreshed = null;
    await readCacheThenRevalidate(
      'sales',
      async () => ({ data: [SERVER_SALE], error: null }),   // server, mid-sync
      (rows) => { refreshed = rows; },
    );
    await new Promise((r) => setTimeout(r, 0));   // revalidate is fire-and-forget

    const ids = (refreshed || []).map((r) => r.id);
    expect(ids).toContain('SAL-OFFLINE-1');
    expect(ids).toContain('SAL-SYNCED-9');
  });

  it('does NOT resurrect a row the server really deleted', async () => {
    // Nothing pending for it, so the server's absence is authoritative.
    cacheRows.push({ id: 'SAL-DELETED-7' }, SERVER_SALE);

    const readCacheThenRevalidate = await load();
    let refreshed = null;
    await readCacheThenRevalidate(
      'sales',
      async () => ({ data: [SERVER_SALE], error: null }),
      (rows) => { refreshed = rows; },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect((refreshed || []).map((r) => r.id)).toEqual(['SAL-SYNCED-9']);
  });

  it('does not duplicate a row once it has synced', async () => {
    // The op can still be in the outbox in the moment after the push succeeds.
    cacheRows.push(SERVER_SALE);
    outboxOps.push({ table: 'process_sale', type: 'rpc', payload: { p_id: 'SAL-SYNCED-9' } });

    const readCacheThenRevalidate = await load();
    let refreshed = null;
    await readCacheThenRevalidate(
      'sales',
      async () => ({ data: [SERVER_SALE], error: null }),
      (rows) => { refreshed = rows; },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect((refreshed || []).filter((r) => r.id === 'SAL-SYNCED-9')).toHaveLength(1);
  });
});
