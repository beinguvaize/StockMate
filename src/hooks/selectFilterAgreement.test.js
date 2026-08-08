import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * A client-side filter may only test columns the query actually fetched.
 *
 * Reading through the offline cache means reading whole tables, so each hook
 * narrows the result back down itself — typically `r.tenant_id === tenantId`.
 * That is correct only if tenant_id was in the select list. When it is not,
 * every row compares undefined, every row is discarded, and the screen goes
 * blank while looking like it simply has no data.
 *
 * It happened twice in one change:
 *
 *  · useDayBookData — 7 Aug 2026 held 2 sales worth ₹1,130 and 3 supplier
 *    payments worth ₹14,400 and rendered completely empty, every figure zero
 *  · useOperations — the pending-delivery list could never contain anything
 *
 * Neither half looked wrong on its own. The query was right, the filter was
 * right, and they were wrong only together, which is why reading the diff did
 * not catch it. This test checks the two against each other across every hook,
 * rather than once where the bug happened to be found.
 *
 * `select('*')` fetches everything and is always fine.
 */

const HOOKS = join(process.cwd(), 'src', 'hooks');

// Columns a hook filters on client-side → the select must fetch them.
const FILTERED_COLUMNS = ['tenant_id', 'deleted_at'];

const files = readdirSync(HOOKS).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));

/**
 * Selects whose rows go through the cache — those are the ones the hook
 * narrows itself, so those are the ones that must carry the filter columns.
 *
 * Keying off fetchWithCache rather than "any select" matters: a hook also runs
 * lookup queries inside write paths (probing for an id) whose results are never
 * filtered. An earlier version of this test skipped any select carrying none of
 * the filtered columns, to avoid those — and so skipped useOperations, which
 * carried none precisely because it was broken.
 */
function cachedSelects(src) {
  const out = [];
  const constants = {};
  for (const m of src.matchAll(/const\s+(SEL_[A-Z_]+)\s*=\s*'([^']+)'/g)) {
    constants[m[1]] = m[2].split(',').map(c => c.trim());
  }

  for (const m of src.matchAll(/fetchWithCache\s*\(/g)) {
    // Take the call's text: from the opening paren to a balanced close.
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    const call = src.slice(m.index, i);

    const lit = call.match(/\.select\(\s*'([^']*)'/);
    if (lit) {
      const cols = lit[1].trim();
      if (cols && cols !== '*') out.push(cols.split(',').map(c => c.trim()));
      continue;
    }
    const named = call.match(/\.select\(\s*(SEL_[A-Z_]+)\s*\)/);
    if (named && constants[named[1]]) out.push(constants[named[1]]);
  }
  return out;
}

/** Which columns this hook narrows on after fetching. */
function filteredOn(src) {
  return FILTERED_COLUMNS.filter(col =>
    new RegExp(`r\\.${col}\\s*===|\\.${col}\\s*===\\s*tenantId|!r\\.${col}`).test(src)
  );
}

describe('every hook fetches the columns it later filters on', () => {
  const offenders = [];

  for (const file of files) {
    const src = readFileSync(join(HOOKS, file), 'utf8');
    const needs = filteredOn(src);
    if (!needs.length) continue;

    for (const cols of cachedSelects(src)) {
      for (const col of needs) {
        if (!cols.includes(col)) {
          offenders.push(`${file}: cached select(${cols.slice(0, 3).join(', ')}…) omits ${col}`);
        }
      }
    }
  }

  it('no hook filters on a column its query did not fetch', () => {
    expect(
      offenders,
      'These would discard every row and render an empty screen:\n  ' +
      offenders.join('\n  ')
    ).toEqual([]);
  });

  it('actually inspected some hooks, so a pass means something', () => {
    const withFilters = files.filter(f =>
      filteredOn(readFileSync(join(HOOKS, f), 'utf8')).length > 0);
    expect(withFilters.length).toBeGreaterThan(0);
  });

  it('the two hooks that broke are among those checked', () => {
    for (const f of ['useDayBookData.js', 'useOperations.js']) {
      const src = readFileSync(join(HOOKS, f), 'utf8');
      expect(filteredOn(src).length, `${f} no longer filters client-side`).toBeGreaterThan(0);
    }
  });
});
