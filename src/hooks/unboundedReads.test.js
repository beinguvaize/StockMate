import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * A whole-table read must be paged, or it is a truncated read that says nothing.
 * ==========================================================================
 *
 * PostgREST answers with at most 1000 rows per request whatever the query asks
 * for (src/lib/fetchAllPages.js). A select with no `.range()` therefore returns
 * the first 1000 rows and no error at all.
 *
 * That is not a short list, it is a wrong answer, and where it bites hardest is
 * the counter: `products` was read this way, so a shop with more than 1000 SKUs
 * cached the first 1000 and a scanned barcode for anything after that simply
 * did not resolve. The cashier is told the shop does not stock an item that is
 * on the shelf in front of them. `inventory_balances` crosses 1000 sooner still
 * — it holds one row per product PER LOCATION — and `account_transactions` is
 * worse again, because every balance on the Accounts screen is a sum over those
 * rows, so truncation produced a confidently wrong number rather than a short
 * list.
 *
 * This test is deliberately a source scan rather than a behavioural test, for
 * the same reason as offlineReads.test.js next door: the failure is a missing
 * wrapper at a call site, there is no runtime signal for it, and the next
 * person to add a hook gets told by a red test instead of by a supermarket.
 */

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * [file, table] pairs that read a whole tenant-scoped table and must page.
 *
 * A table is NOT listed here when the query deliberately windows itself in SQL
 * — a date range, a `.limit()` the caller chose. Those are visible windows; the
 * bug this guards is the invisible one.
 */
const MUST_PAGE = [
  ['useInventory.js', 'products'],
  ['useInventory.js', 'product_categories'],
  ['useInventory.js', 'inventory_balances'],
  ['useInventory.js', 'inventory_locations'],
  ['useSales.js', 'sales'],
  ['useSales.js', 'clients'],
  ['useSales.js', 'invoices'],
  ['useSales.js', 'sales_returns'],
  ['usePeople.js', 'clients'],
  ['usePeople.js', 'suppliers'],
  ['usePeople.js', 'employees'],
  ['usePeople.js', 'users'],
  ['useAccounts.js', 'accounts'],
  ['useAccounts.js', 'account_transactions'],
];

const read = (f) => {
  const p = join(HOOKS_DIR, f);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

describe('whole-table reads are paged', () => {
  it.each(MUST_PAGE)('%s pages %s', (file, table) => {
    const src = read(file);
    expect(src, `${file} is missing — update MUST_PAGE`).not.toBeNull();

    // Only the CACHED WHOLE-TABLE reads, which is what the two cache helpers
    // mark. Writes (`supabase.from('clients').update(...)`) and single-row
    // lookups are not what this is about, and matching every `.from()` in the
    // file caught those too.
    const opener = new RegExp(
      `(fetchWithCache|readCacheThenRevalidate)\\(\\s*\\n?\\s*'${table}'\\s*,`, 'g');
    const hits = [...src.matchAll(opener)];
    expect(
      hits.length,
      `${file} no longer reads ${table} through the cache — update MUST_PAGE`,
    ).toBeGreaterThan(0);

    // Look at exactly the text between the table name and that table's query,
    // not a fixed window after it. A fixed window was the first thing tried and
    // it silently passed on an unwrapped read, because the window ran past the
    // end of the call and into the NEXT sibling — which was paged. The span
    // between an opener and its own `.from('<table>')` cannot do that.
    const query = new RegExp(`supabase\\s*\\.?\\s*\\n?\\s*\\.from\\(\\s*'${table}'`);
    for (const hit of hits) {
      const rest = src.slice(hit.index + hit[0].length);
      const q = rest.search(query);
      expect(q, `${file}: no query follows the ${table} cache read`).toBeGreaterThan(-1);
      const between = rest.slice(0, q);
      expect(
        /fetchAllPages\(/.test(between),
        `${file} reads ${table} without fetchAllPages. PostgREST stops at 1000 `
        + `rows with no error, so this silently returns a partial table. Wrap `
        + `the thunk: fetchAllPages(() => supabase.from('${table}')…, { label: '${table}' }).`
      ).toBe(true);
    }
  });

  it('no listed hook has gone missing', () => {
    const missing = [...new Set(MUST_PAGE.map(([f]) => f))].filter((f) => read(f) === null);
    expect(missing, 'renamed or deleted hooks still listed in MUST_PAGE').toEqual([]);
  });

  it('the mobile products pull pages too', () => {
    // Same bug, same consequence, different language. mobile_app is outside
    // this test's directory, so reach for it explicitly rather than skipping
    // the surface that has the scanner on it.
    const p = join(HOOKS_DIR, '..', '..', 'mobile_app', 'lib', 'core', 'database', 'sync_service.dart');
    if (!existsSync(p)) return;              // web-only checkout, nothing to assert
    const src = readFileSync(p, 'utf8');
    expect(src).toMatch(/_pageAll\(\s*'products'/);
    // Range paging over an unordered query can repeat a row on one page and
    // skip it on the next, so the order is part of the fix, not decoration.
    expect(src).toMatch(/\.order\('id'\)\.range\(from, to\)/);
  });
});
