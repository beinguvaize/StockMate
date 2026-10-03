/**
 * Read a whole table, a page at a time, instead of the newest N rows.
 *
 * Every list fetch in this app ended with `.limit(500)` -- purchases with
 * `.limit(200)`. On a shop with more rows than that, the hooks silently handed
 * every screen a truncated set, and nothing anywhere said so. The largest
 * tenant already has 1,187 sales against a 500 cap and 277 purchases against a
 * 200 one.
 *
 * Truncation is not merely a short list. It changes figures:
 *
 *   · A client statement joins invoices to sales. Invoices are far fewer, so
 *     they fit under the cap while the sales they came from do not -- and an
 *     invoice whose sale had aged out could not be credited, so a bill the
 *     customer had paid showed as money owed. That reached production and is
 *     what sent me looking (see clientStatement.js).
 *   · Any total over "all sales" is a total over the newest 500.
 *
 * So: page until the rows run out, and stop at a ceiling rather than pulling an
 * unbounded set into a browser. Hitting the ceiling is reported, because the
 * failure this replaces was silent and that was the expensive part. A caller
 * that genuinely wants a window should ask for one in SQL, where it is visible,
 * not inherit one from a default nobody set deliberately.
 */

export const PAGE_SIZE = 1000;      // PostgREST's own max rows per request
export const DEFAULT_CEILING = 20000;

/**
 * @param queryFn  () => PostgrestFilterBuilder — the same thunk the hooks already
 *                 pass around, WITHOUT a .limit() on it.
 * @returns {{ data, error, complete }} in the shape the callers already expect,
 *          plus `complete: false` when the ceiling cut the read short.
 */
export async function fetchAllPages(queryFn, opts = {}) {
  const page = opts.pageSize || PAGE_SIZE;
  const ceiling = opts.ceiling || DEFAULT_CEILING;
  const label = opts.label || 'rows';
  const out = [];

  for (let from = 0; from < ceiling; from += page) {
    const res = await queryFn().range(from, from + page - 1);
    if (res?.error) {
      // Hand back what arrived along with the error: a partial read the caller
      // knows about beats an empty one it does not.
      return { data: out, error: res.error, complete: false };
    }
    const batch = Array.isArray(res?.data) ? res.data : [];
    out.push(...batch);
    // A short page is the end of the table. This is the ordinary exit.
    if (batch.length < page) return { data: out, error: null, complete: true };
  }

  console.warn(
    `[fetchAllPages] ${label}: stopped at the ${ceiling}-row ceiling. `
    + 'Totals on this screen cover the newest rows only. This needs a windowed '
    + 'query or a server-side aggregate, not a bigger ceiling.',
  );
  return { data: out, error: null, complete: false };
}
