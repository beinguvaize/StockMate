// Postgres `numeric` columns arrive as strings through supabase-js (it keeps
// full precision because JS has no equivalent native type). When those strings
// flow into arithmetic the result is silently wrong: `0 + "100"` is `"0100"`
// via string concat, not `100`. `.toFixed` on a string throws outright. Call
// sites that forget to coerce produce broken totals or crashes (e.g. the
// inventory page hit the ErrorBoundary from `product.costPrice.toFixed`).
//
// Fix at the fetch boundary: coerce known numeric columns once when rows
// arrive from Supabase, so every consumer downstream sees a real `number`.

export const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeNumericRow = (row, cols) => {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const col of cols) {
    if (out[col] != null) out[col] = Number(out[col]);
  }
  return out;
};

export const normalizeNumericRows = (rows, cols) =>
  (rows || []).map(r => normalizeNumericRow(r, cols));
