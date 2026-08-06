import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Offline reads.
 *
 * The desktop app queues WRITES offline in almost every hook, which made it
 * look finished. The reads were the gap: several hooks fetched straight from
 * Supabase, so with no network they returned nothing and the screen rendered
 * zeros over a cache that had the data all along. `useAccounts` was the one
 * that surfaced -- the desktop app showed "Cash Balance ₹0" and then hung on
 * "Loading accounts…" forever.
 *
 * Queueing a write is the easy half and it is the half that gets remembered.
 * This test holds the other half: a hook listed here must read through the
 * cache, so the next hook that queues writes and forgets reads fails here
 * rather than on a customer's machine with no network.
 *
 * fetchWithCache and readCacheThenRevalidate are both no-ops on web, so
 * satisfying this changes nothing in the browser.
 */

const HOOKS_DIR = join(process.cwd(), 'src', 'hooks');

// Hooks whose screens must work with no network. Money and stock first.
const OFFLINE_READY = [
  'useAccounts.js',   // cash & bank balances
  'useSales.js',
  'useInventory.js',
  'usePurchases.js',
  'usePeople.js',     // clients, suppliers, receipts
  'useFinance.js',
  'useEstimates.js',
];

// Known to read online-only. Listed so the gap is visible and countable rather
// than rediscovered from a screenshot. Moving one up to OFFLINE_READY is the
// fix; this list should only ever shrink.
const KNOWN_ONLINE_ONLY = [
  'useDayBookData.js', 'usePayroll.js', 'useOrders.js', 'useOperations.js',
  'useManufacturing.js', 'useTables.js', 'useKOT.js', 'useAppointments.js',
  'useBugReports.js', 'useBilling.js', 'usePlanLimits.js',
];

const CACHED_READ = /fetchWithCache|readCacheThenRevalidate/;

const read = (f) => {
  const p = join(HOOKS_DIR, f);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

describe('offline reads', () => {
  it.each(OFFLINE_READY)('%s reads through the cache', (file) => {
    const src = read(file);
    expect(src, `${file} is missing — update OFFLINE_READY`).not.toBeNull();
    expect(
      CACHED_READ.test(src),
      `${file} queues writes offline but fetches straight from Supabase. ` +
      `With no network those queries return nothing and the screen renders ` +
      `zeros over a cache that already holds the data. Wrap its reads in ` +
      `fetchWithCache (a no-op on web).`
    ).toBe(true);
  });

  it('every listed hook actually exists', () => {
    const missing = [...OFFLINE_READY, ...KNOWN_ONLINE_ONLY].filter(f => read(f) === null);
    expect(missing, 'renamed or deleted hooks still listed here').toEqual([]);
  });

  it('a hook is not claimed as both ready and online-only', () => {
    const both = OFFLINE_READY.filter(f => KNOWN_ONLINE_ONLY.includes(f));
    expect(both).toEqual([]);
  });

  it('useAccounts loads its balances from the cache, not just its writes', () => {
    // The specific regression: reads were raw while writes were queued, so the
    // desktop app reported no money at all.
    const src = read('useAccounts.js');
    expect(src).toMatch(/fetchWithCache\(\s*'accounts'/);
    expect(src).toMatch(/fetchWithCache\(\s*'account_transactions'/);
  });

  it('useAccounts always clears its loading flag', () => {
    // Without a finally, a rejected fetch left loading true and the page sat on
    // "Loading accounts…" indefinitely -- the failure looked like slowness.
    const src = read('useAccounts.js');
    expect(src).toMatch(/finally\s*\{[\s\S]*setLoading\(false\)/);
  });
});

describe('offline cache covers what the app reads', () => {
  it('caches the tables the money screens depend on', () => {
    const engine = readFileSync(
      join(process.cwd(), 'src', 'lib', 'offline', 'syncEngine.js'), 'utf8');
    for (const t of ['accounts', 'account_transactions', 'sales', 'purchases',
                     'expenses', 'clients', 'suppliers', 'products',
                     'client_payments', 'supplier_payments']) {
      expect(engine, `${t} is read by a money screen but never cached`)
        .toMatch(new RegExp(`'${t}'`));
    }
  });
});
