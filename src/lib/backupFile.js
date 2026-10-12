/**
 * A backup the shop owns, and a restore that cannot quietly double its books.
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
 * WHAT MAKES RESTORE DANGEROUS, AND WHAT THIS DOES ABOUT IT
 *
 * Writing a sale row back fires trg_sales_post_ledger and trg_gl_sales, which
 * post to account_transactions and gl_journals. A file that ALSO contains
 * those rows would therefore restore each payment twice: once as the saved
 * row, once as the trigger's reaction to the sale. The same is true of
 * products.stock and inventory_balances, which trg_sync_product_stock derives.
 *
 * So the split below is not organisational, it is the safety property:
 *
 *   SOURCE tables are the facts the shop entered. They are captured and they
 *   are restored.
 *
 *   DERIVED tables are what the database computes from those facts. They are
 *   captured -- a backup you cannot read every number out of is not a backup --
 *   and they are NEVER written back. The triggers rebuild them, which is the
 *   only way the rebuilt ledger agrees with the restored sales.
 */

export const BACKUP_FORMAT = 1;

/**
 * The facts the shop entered. Restored in this order: a row may reference one
 * above it (a sale needs its client; a sale line needs its sale), and a
 * foreign key violation half way through a restore is the worst possible
 * outcome -- half a shop, with no way to tell which half.
 */
export const SOURCE_TABLES = [
  'business_profile',
  'inventory_locations',
  'product_categories',
  'products',
  'product_batches',
  'clients',
  'suppliers',
  'employees',
  'accounts',
  'sales',
  'sale_items',
  'invoices',
  'sales_returns',
  'sales_return_items',
  'purchases',
  'purchase_returns',
  'expenses',
  'client_payments',
  'supplier_payments',
  'estimates',
  'orders',
  'day_book',
];

/**
 * What the database computes. Captured for the record, never written back.
 *
 * Each one has a named writer that would run again on restore:
 *   account_transactions  trg_sales_post_ledger, trg_purchases_post_ledger,
 *                         trg_expenses_post_ledger, and the payment triggers
 *   gl_journals/gl_lines  trg_gl_sales and its siblings
 *   inventory_balances    process_sale and adjust_inventory_atomic
 *   movement_log          written by every stock movement
 */
export const DERIVED_TABLES = [
  'account_transactions',
  'gl_journals',
  'gl_lines',
  'inventory_balances',
  'movement_log',
  'sale_batch_consumption',
];

export const ALL_BACKUP_TABLES = [...SOURCE_TABLES, ...DERIVED_TABLES];

export const isDerived = (table) => DERIVED_TABLES.includes(table);

/**
 * A cheap, deterministic checksum over the row counts and ids.
 *
 * Not cryptography -- it is here to catch a file that was truncated by a
 * failed download or edited in a spreadsheet, which is what actually happens
 * to backup files. Deliberately not a hash of the whole payload: that would
 * change with key order and make an honest file look corrupt.
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

/** Build the file contents. Pure, so what is verified is what is written. */
export function buildBackup({ tenantId, tenantName, tables, appVersion = '' }) {
  const counts = {};
  for (const [name, rows] of Object.entries(tables)) counts[name] = (rows || []).length;
  return {
    format: BACKUP_FORMAT,
    takenAt: new Date().toISOString(),
    tenantId,
    tenantName,
    appVersion,
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
 * Read a file back and decide whether it can be trusted.
 *
 * Returns { ok, errors, warnings, summary }. Errors stop a restore; warnings
 * are things the owner should know and may accept — restoring another shop's
 * file into this one is the obvious one, and it is a warning rather than an
 * error only because moving a shop between tenants is a real thing people do.
 */
export function inspectBackup(parsed, { tenantId } = {}) {
  const errors = [];
  const warnings = [];

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['That file is not a StockMate backup.'], warnings: [], summary: null };
  }
  if (parsed.format !== BACKUP_FORMAT) {
    errors.push(parsed.format
      ? `This file is format ${parsed.format}; this app reads format ${BACKUP_FORMAT}.`
      : 'That file is not a StockMate backup.');
  }
  if (!parsed.tables || typeof parsed.tables !== 'object') {
    errors.push('The file has no data in it.');
  }

  if (!errors.length) {
    const actual = checksum(parsed.tables);
    if (parsed.checksum && parsed.checksum !== actual) {
      // Truncated download or hand-edited file. Restoring from it would write
      // whatever survived, which is worse than refusing.
      errors.push('The file is damaged or was edited after it was made.');
    }
    if (tenantId && parsed.tenantId && parsed.tenantId !== tenantId) {
      warnings.push(`This backup was taken from a different shop (${parsed.tenantName || parsed.tenantId}).`);
    }
    const unknown = Object.keys(parsed.tables).filter((t) => !ALL_BACKUP_TABLES.includes(t));
    if (unknown.length) warnings.push(`Ignoring tables this version does not know: ${unknown.join(', ')}.`);
  }

  const summary = errors.length ? null : {
    takenAt: parsed.takenAt,
    tenantName: parsed.tenantName,
    rows: Object.values(parsed.counts || {}).reduce((a, b) => a + (Number(b) || 0), 0),
    counts: parsed.counts || {},
  };

  return { ok: errors.length === 0, errors, warnings, summary };
}

/**
 * What a restore would actually write, in order.
 *
 * Derived tables are dropped here rather than at the write site, so the rule
 * is visible in one place and testable without a database.
 */
export function restorePlan(parsed) {
  const steps = [];
  let skipped = 0;
  for (const table of SOURCE_TABLES) {
    const rows = parsed?.tables?.[table];
    if (Array.isArray(rows) && rows.length) steps.push({ table, rows });
  }
  for (const table of DERIVED_TABLES) {
    const rows = parsed?.tables?.[table];
    if (Array.isArray(rows)) skipped += rows.length;
  }
  return {
    steps,
    rowsToWrite: steps.reduce((a, s) => a + s.rows.length, 0),
    rowsRebuiltByDatabase: skipped,
  };
}

/**
 * Re-stamp every row with the tenant doing the restore.
 *
 * A row carrying its old tenant_id would be refused by RLS, and — worse — a
 * row that slipped through would belong to a shop that cannot see it.
 */
export function retenant(rows = [], tenantId) {
  return rows.map((r) => (r && typeof r === 'object' && 'tenant_id' in r ? { ...r, tenant_id: tenantId } : r));
}
