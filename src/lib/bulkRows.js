/**
 * Pure helpers for the Bulk add grid and the Excel importer (web redesign).
 * No writes here: both pages keep their own payloads and inserts.
 */

/** GSTIN part-hidden for the screen: it carries the PAN. Never used for a write. */
export function maskGstin(v) {
  const s = String(v ?? '');
  if (s.length <= 5) return s;
  return `${s.slice(0, 2)}${'•'.repeat(s.length - 5)}${s.slice(-3)}`;
}

/** Sentence-case column label without the required star: "Cost Price*" -> "Cost price". */
export function plainLabel(label) {
  const s = String(label || '').replace(/\*$/, '').trim();
  return s.replace(/(\s)([A-Z])([a-z])/g, (m, sp, a, b) => `${sp}${a.toLowerCase()}${b}`)
    .replace(/\bgst\b/gi, 'GST').replace(/\bhsn\b/gi, 'HSN');
}

/**
 * Per-cell checks for one grid row. Same rules the grid always had (required,
 * numeric, the column's own validator); only the words are the mockup's.
 * Returns { [key]: message }.
 */
export function rowErrors(row, cols) {
  const errs = {};
  cols.forEach((c) => {
    const v = String(row[c.key] ?? '').trim();
    const name = plainLabel(c.label);
    if (c.required && !v) errs[c.key] = `${name} is required`;
    else if (c.num && v && isNaN(Number(v))) errs[c.key] = `${name} must be a number`;
    else if (c.validate) {
      const r = c.validate(v);
      if (r !== true && v) errs[c.key] = r;
    }
  });
  return errs;
}

/**
 * Row outcome after a save, from what the server said.
 *   saved   - the insert came back OK
 *   failed  - the server answered no (reason = its own words)
 *   unsure  - the answer never arrived; the row may have saved
 */
export function rowOutcome(error, { firstTryDropped = false, isTransport } = {}) {
  if (!error) return { state: 'saved' };
  const reason = String(typeof error === 'object' && 'message' in error ? (error.message ?? '') : error).trim();
  if (isTransport?.(error)) return { state: 'unsure', reason: reason || 'The connection dropped before the shop answered.' };
  // The chunk's answer was lost, then this row's own id came back as a
  // duplicate: the lost attempt most likely wrote it.
  if (firstTryDropped && (error.code === '23505' || /duplicate key/i.test(reason)) && /pkey/i.test(reason)) {
    return { state: 'unsure', reason: `The first try lost its answer and this row is already in the shop, so it most likely saved (${reason}).` };
  }
  return { state: 'failed', reason: reason || 'The shop refused it and gave no reason.' };
}

/** Counts for the summary tiles. statuses: array of { state, note? }. */
export function summarize(statuses) {
  const s = { sent: 0, saved: 0, noted: 0, failed: 0, unsure: 0 };
  for (const st of statuses) {
    if (!st || st.state === 'skipped' || st.state === 'waiting' || st.state === 'saving') continue;
    s.sent += 1;
    if (st.state === 'saved') { s.saved += 1; if (st.note) s.noted += 1; }
    else if (st.state === 'failed') s.failed += 1;
    else if (st.state === 'unsure') s.unsure += 1;
  }
  return s;
}

/** Does this status belong under "Needs a look"? */
export const needsLook = (st) => !!st && (st.state === 'failed' || st.state === 'unsure' || (st.state === 'saved' && !!st.note));
