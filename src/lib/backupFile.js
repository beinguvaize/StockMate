/**
 * A backup the shop owns, and a restore that puts it back exactly.
 * ==========================================================================
 *
 * There are two different backups and this is the second one.
 *
 *   The PLATFORM backup is the nightly pg_dump to R2 (.github/workflows/
 *   db-backup.yml). It covers every tenant, it is ours to run, and it has
 *   never once succeeded because its secrets were never added.
 *
 *   The SHOP's backup is this: the owner presses a button and gets a file of
 *   their own data. It does not depend on our secrets, our schedule or our
 *   continued existence, which is the whole point of letting somebody keep a
 *   copy of their books.
 *
 * FORMAT 2, AND WHY FORMAT 1 CANNOT BE RESTORED
 *
 * Format 1 carried a hand-kept list of 28 tables and planned to restore only
 * the "source" ones, letting database triggers rebuild the ledger. Checking
 * that against the live database showed it was wrong three ways:
 *
 *   - the shop has 91 tables, not 28: attendance, payroll, vehicle stock,
 *     budgets, recipes, the chart of accounts and invoice numbering were all
 *     missing, and wiping before a restore would have erased them;
 *   - 28 of one real shop's ledger rows (manual entries, transfers, edits,
 *     day-close variances) were never written by a trigger, so "rebuild the
 *     ledger" would have lost them;
 *   - re-firing today's triggers over old rows rewrites history with today's
 *     rules, which is not what a restore means.
 *
 * So format 2 takes EVERY shop table, the ledger and GL included, from the
 * server's own list (shop_backup_tables), and the server restores it exactly
 * with every re-deriving trigger standing aside. The table list is never kept
 * here: a list in code is how the first version came to cover 28 of 91.
 *
 * What lives in this file is the part that must be right without a database:
 * reading a file, deciding whether it can be trusted, and cutting it into the
 * chunks the server accepts.
 */

export const BACKUP_FORMAT = 2;

/** Rows per upload call. Matches the server's export page size. */
export const CHUNK_SIZE = 1000;

/**
 * A cheap, deterministic checksum over the row counts and ids.
 *
 * Not cryptography -- it is here to catch a file that was truncated by a
 * failed download or edited in a spreadsheet, which is what actually happens
 * to backup files. Deliberately not a hash of the whole payload: that would
 * change with key order and make an honest file look corrupt. A dropped row
 * changes the row count it includes, so tables with no `id` column
 * (invoice_counters) are covered too.
 */
export function checksum(tables = {}) {
  let h = 5381;
  for (const name of Object.keys(tables).sort()) {
    const rows = tables[name] || [];
    const piece = `${name}:${rows.length}:${rows.map((r) => r?.id ?? '').join(',')}`;
    for (let i = 0; i < piece.length; i += 1) {
      h = ((h << 5) + h + piece.charCodeAt(i)) >>> 0;
    }
  }
  return h.toString(16);
}

/**
 * Build the file contents. Pure, so what is verified is what is written.
 *
 * `manifest` is the server's own list of this shop's tables with the row
 * counts it reported at the start of the backup. It travels in the file so a
 * reader can tell "this table was empty" from "this table was never taken".
 */
export function buildBackup({ tenantId, tenantName, tables, manifest = [], appVersion = '' }) {
  const counts = {};
  for (const [name, rows] of Object.entries(tables)) counts[name] = (rows || []).length;
  return {
    format: BACKUP_FORMAT,
    takenAt: new Date().toISOString(),
    tenantId,
    tenantName,
    appVersion,
    manifest: manifest.map(({ table, mode }) => ({ table, mode })),
    counts,
    checksum: checksum(tables),
    tables,
  };
}

/** A filename a person can find again in a folder of fifty. */
export function backupFileName(tenantName = 'shop', at = new Date()) {
  const slug = String(tenantName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `stockmate-${slug}-${stamp}.json`;
}

/**
 * Read a file back and decide whether it can be restored.
 *
 * Returns { ok, errors, warnings, summary }. Errors stop a restore. The
 * server checks the same things again -- a file is user-supplied and the page
 * is not the authority -- but saying so here, before anything is uploaded,
 * is the difference between "that file is no good" and a failed restore.
 */
export function inspectBackup(parsed, { tenantId } = {}) {
  const errors = [];
  const warnings = [];
  const fail = (msg) => ({ ok: false, errors: [msg], warnings: [], summary: null });

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail('That file is not a StockMate backup.');
  }
  if (parsed.format === 1) {
    // Restoring one would wipe every table it never held. The server
    // refuses it too; saying so here saves the upload.
    return fail('This backup was made before backups covered the whole shop, so it cannot be restored safely. Take a new backup and keep that one.');
  }
  if (parsed.format !== BACKUP_FORMAT) {
    return fail(parsed.format
      ? `This file is format ${parsed.format}; this app reads format ${BACKUP_FORMAT}.`
      : 'That file is not a StockMate backup.');
  }
  if (!parsed.tables || typeof parsed.tables !== 'object') {
    return fail('The file has no data in it.');
  }

  const actual = checksum(parsed.tables);
  if (parsed.checksum && parsed.checksum !== actual) {
    // Truncated download or hand-edited file. Restoring from it would write
    // whatever survived, which is worse than refusing.
    errors.push('The file is damaged or was edited after it was made.');
  }

  // Every table the server listed must be in the file, even if empty. One
  // that is missing would be wiped and left empty by a restore.
  const missing = (parsed.manifest || [])
    .filter((m) => m.mode !== 'PRESERVE' && !Array.isArray(parsed.tables[m.table]))
    .map((m) => m.table);
  if (missing.length) {
    errors.push(`The file is missing ${missing.length} table${missing.length === 1 ? '' : 's'} (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}).`);
  }

  if (tenantId && parsed.tenantId && parsed.tenantId !== tenantId) {
    // Moving one shop into another is a different, larger job: the rows carry
    // ids the original shop still uses. Refused rather than half-attempted.
    errors.push(`This backup belongs to a different shop (${parsed.tenantName || parsed.tenantId}). A backup can only be restored into the shop it came from.`);
  }

  const known = new Set((parsed.manifest || []).map((m) => m.table));
  const unknown = Object.keys(parsed.tables).filter((t) => known.size && !known.has(t));
  if (unknown.length) warnings.push(`Ignoring tables this version does not know: ${unknown.join(', ')}.`);

  const counts = parsed.counts || {};
  const summary = errors.length ? null : {
    takenAt: parsed.takenAt,
    tenantName: parsed.tenantName,
    tables: Object.keys(parsed.tables).length,
    rows: Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0),
    counts,
  };

  return { ok: errors.length === 0, errors, warnings, summary };
}

/**
 * The upload, cut into calls the server accepts.
 *
 * Every table gets at least one chunk -- an EMPTY table is sent as one empty
 * chunk. The server refuses a restore that lacks a table, because the wipe
 * would leave it empty; "present and empty" has to arrive as exactly that.
 */
export function uploadPlan(parsed, size = CHUNK_SIZE) {
  const plan = [];
  const names = Object.keys(parsed?.tables || {}).sort();
  for (const table of names) {
    const rows = Array.isArray(parsed.tables[table]) ? parsed.tables[table] : [];
    if (rows.length === 0) {
      plan.push({ table, chunkNo: 0, rows: [] });
      continue;
    }
    for (let i = 0, n = 0; i < rows.length; i += size, n += 1) {
      plan.push({ table, chunkNo: n, rows: rows.slice(i, i + size) });
    }
  }
  return plan;
}

/**
 * What the owner is told when the server refuses or fails a restore.
 *
 * The markers come from the database (RESTORE_REFUSED, RESTORE_FORBIDDEN …).
 * Every one of them means the shop is unchanged -- the restore runs in one
 * transaction -- so every message says so. A timeout is the same: the
 * transaction was cancelled before it committed.
 */
export const RESTORE_MARKERS = [
  ['RESTORE_REFUSED', 'This backup cannot be restored'],
  ['RESTORE_FORBIDDEN', 'Only the owner can restore'],
  ['RESTORE_FAILED', 'The restore was stopped'],
  ['RESTORE_INVALID', 'The restore could not start'],
  ['BACKUP_INVALID', 'The backup could not be read'],
];

/**
 * `unchanged` is the field that matters. ANY answer from the server -- a
 * marker, a bad value, a broken foreign key, a timeout -- means the restore's
 * single transaction rolled back, so the shop is exactly as it was. Only a
 * connection that dropped before the server answered is unknown, and that is
 * decided by writeOutcome.isTransportFailure, not here: the page asks the
 * server what happened instead of guessing.
 */
export function describeRestoreError(error) {
  const raw = String(error?.message || error || '').trim();
  for (const [marker, title] of RESTORE_MARKERS) {
    const at = raw.indexOf(`${marker}:`);
    if (at !== -1) {
      return { title, detail: raw.slice(at + marker.length + 1).trim(), unchanged: true };
    }
  }
  if (/statement timeout|canceling statement/i.test(raw)) {
    return {
      title: 'This backup is too large to restore from the app',
      detail: 'The restore ran out of time and was cancelled, so nothing was changed. Contact support to restore it for you.',
      unchanged: true,
    };
  }
  return {
    title: 'The restore was stopped',
    // The database's own words: a value it would not accept, a reference it
    // could not resolve. They are what support will need.
    detail: raw || 'The server refused the restore without saying why.',
    unchanged: true,
  };
}
