/**
 * The importer's "Match your columns" step, as pure functions.
 *
 * resolveHeaders (importSheet.js) decides the first guess, exactly as before.
 * Its alias tables can name fields the importer does not read (sku, mrp,
 * cess_rate, gst_no, hsn_code...): those were always dropped on the floor,
 * so they start as "Do not import" here, and the screen now says so.
 */

/** { header: key | '' } for every file header, keys limited to `cols`. */
export function defaultMapping(headers, headerToKey, cols) {
  const keys = new Set(cols.map((c) => c.key));
  const out = {};
  for (const h of headers) {
    const k = headerToKey[h];
    out[h] = k && keys.has(k) ? k : '';
  }
  return out;
}

/** Sheet rows -> importer rows, reading only the mapped columns. */
export function applyMapping(raw, mapping) {
  return raw.map((r) => {
    const out = {};
    Object.entries(r).forEach(([k, v]) => {
      const mapped = mapping[k];
      if (mapped) out[mapped] = v;
    });
    return out;
  });
}

/** Labels of required fields no column feeds. */
export function mappingProblems(mapping, cols) {
  const fed = new Set(Object.values(mapping).filter(Boolean));
  return cols.filter((c) => c.required && !fed.has(c.key)).map((c) => c.label);
}
