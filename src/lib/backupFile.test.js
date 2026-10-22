import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildBackup, inspectBackup, uploadPlan, checksum, backupFileName, describeRestoreError,
  BACKUP_FORMAT, CHUNK_SIZE,
} from './backupFile.js';

/**
 * The shop's own backup, format 2.
 * ==========================================================================
 *
 * The restore itself runs in the database and is proven there: a changed
 * shop restored to every table byte-identical (92 of 92 on dev, 91 of 91 on
 * production's demo shop), Undo returned it exactly, and every refusal left it
 * untouched (supabase/tests/restore_test.sql, and the migration
 * 20261022_restore_a_shop_exactly.sql). What lives here is the part that has to
 * be right before anything is uploaded:
 *
 *   1. a file that cannot be restored safely is refused HERE, with a reason
 *      the owner can act on -- an old format, a damaged file, a missing table,
 *      another shop's file;
 *   2. the upload sends EVERY table, an empty one as an empty chunk, because
 *      the server wipes every table and refuses a file that lacks one;
 *   3. an error from the server is never reported as "the shop changed".
 */

const manifest = [
  { table: 'products', mode: 'RESTORE' },
  { table: 'clients', mode: 'RESTORE' },
  { table: 'sales', mode: 'RESTORE' },
  { table: 'account_transactions', mode: 'RESTORE' },
  { table: 'invoice_counters', mode: 'RESTORE' },
  { table: 'attendance', mode: 'RESTORE' },
  { table: 'e_invoice_irn', mode: 'PRESERVE' },
];

const tables = () => ({
  products: [{ id: 'P1', tenant_id: 'T1', name: 'Salt' }, { id: 'P2', tenant_id: 'T1', name: 'Butter' }],
  clients: [{ id: 'C1', tenant_id: 'T1', name: 'Acme' }],
  sales: [{ id: 'S1', tenant_id: 'T1', totalAmount: 100 }],
  // The ledger travels in the file and is restored as saved: 28 of one real
  // shop's ledger rows were never written by a trigger.
  account_transactions: [{ id: 'AT1', tenant_id: 'T1', amount: 100, ref_type: 'MANUAL' }],
  // Keyed by tenant/series/year, no `id` column.
  invoice_counters: [{ tenant_id: 'T1', series: 'INV', fy: '2026-27', last_number: 27 }],
  // Empty, and must still be in the file.
  attendance: [],
});

const file = (over = {}) => buildBackup({ tenantId: 'T1', tenantName: 'Demo', tables: tables(), manifest, ...over });

describe('a file that can be restored', () => {
  it('is accepted', () => {
    const res = inspectBackup(file(), { tenantId: 'T1' });
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.summary.rows).toBe(6);   // 2 products, 1 client, 1 sale, 1 ledger row, 1 counter, 0 attendance
    expect(res.summary.tables).toBe(6);
  });

  it('carries the ledger, not just what the ledger was computed from', () => {
    expect(file().tables.account_transactions).toHaveLength(1);
  });

  it('records which tables the server said the shop has', () => {
    expect(file().manifest.map((m) => m.table)).toContain('attendance');
  });
});

describe('a file that cannot be restored is refused before anything is uploaded', () => {
  it('refuses the first format, and says what to do instead', () => {
    // Format 1 held 28 of 91 tables. Restoring it would wipe the other 63.
    const res = inspectBackup({ ...file(), format: 1 }, { tenantId: 'T1' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/before backups covered the whole shop/);
    expect(res.errors.join(' ')).toMatch(/Take a new backup/);
  });

  it('refuses a file that was truncated or edited', () => {
    const f = file();
    f.tables.products.pop();
    const res = inspectBackup(f, { tenantId: 'T1' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/damaged or was edited/);
  });

  it('notices a dropped row even in a table with no id column', () => {
    const f = file();
    f.tables.invoice_counters = [];
    expect(inspectBackup(f, { tenantId: 'T1' }).ok).toBe(false);
  });

  it('refuses a file missing a table the shop has', () => {
    // A restore wipes every table; one the file lacks would be left empty.
    const f = file();
    delete f.tables.attendance;
    f.checksum = checksum(f.tables);   // an honest file, just incomplete
    const res = inspectBackup(f, { tenantId: 'T1' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/missing 1 table \(attendance\)/);
  });

  it('does not require the IRN table, which a restore never overwrites', () => {
    // e_invoice_irn is PRESERVE: the GST portal's record does not roll back.
    expect(file().tables.e_invoice_irn).toBeUndefined();
    expect(inspectBackup(file(), { tenantId: 'T1' }).ok).toBe(true);
  });

  it("refuses another shop's file", () => {
    const res = inspectBackup(file({ tenantId: 'OTHER', tenantName: 'Other Shop' }), { tenantId: 'T1' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/different shop \(Other Shop\)/);
  });

  it('refuses something that is not a backup at all', () => {
    expect(inspectBackup(null).ok).toBe(false);
    expect(inspectBackup([]).ok).toBe(false);
    expect(inspectBackup({ hello: 'world' }).ok).toBe(false);
    expect(inspectBackup('{}').ok).toBe(false);
  });

  it('refuses a newer format rather than guessing', () => {
    const res = inspectBackup({ ...file(), format: 99 });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/format 99/);
  });

  it('warns about tables this version does not know, without refusing', () => {
    const f = buildBackup({ tenantId: 'T1', tables: { ...tables(), future_table: [{ id: 'X' }] }, manifest });
    const res = inspectBackup(f, { tenantId: 'T1' });
    expect(res.ok).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/future_table/);
  });
});

describe('the upload', () => {
  it('sends every table, an empty one as one empty chunk', () => {
    const plan = uploadPlan(file());
    const sent = new Set(plan.map((c) => c.table));
    for (const t of Object.keys(tables())) expect(sent, `${t} must be sent`).toContain(t);
    const att = plan.filter((c) => c.table === 'attendance');
    expect(att).toEqual([{ table: 'attendance', chunkNo: 0, rows: [] }]);
  });

  it('cuts a large table into numbered chunks that add back up', () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `M${i}` }));
    const plan = uploadPlan({ tables: { movement_log: rows } });
    expect(plan.map((c) => [c.chunkNo, c.rows.length])).toEqual([[0, 1000], [1, 1000], [2, 500]]);
    expect(plan.flatMap((c) => c.rows)).toEqual(rows);
  });

  it('uses the same chunk size as the server pages backups in', () => {
    expect(CHUNK_SIZE).toBe(1000);
  });
});

describe('what the owner is told when a restore does not happen', () => {
  it('strips the marker and says the shop is unchanged', () => {
    const d = describeRestoreError({
      message: 'RESTORE_REFUSED: 1 e-invoice(s) registered with the GST portal after this backup would be erased. Restore a later backup.',
    });
    expect(d.title).toBe('This backup cannot be restored');
    expect(d.detail).toMatch(/^1 e-invoice/);
    expect(d.detail).not.toMatch(/RESTORE_REFUSED/);
    expect(d.unchanged).toBe(true);
  });

  it('explains a timeout as too large, and still unchanged', () => {
    // The restore is one transaction: a cancelled one committed nothing.
    const d = describeRestoreError({ message: 'canceling statement due to statement timeout' });
    expect(d.title).toMatch(/too large/);
    expect(d.unchanged).toBe(true);
  });

  it("keeps the database's own words for an error with no marker", () => {
    const raw = 'invalid input syntax for type numeric: "not a number"';
    const d = describeRestoreError({ message: raw });
    expect(d.detail).toBe(raw);
    // A server answer, however odd, means the transaction rolled back.
    expect(d.unchanged).toBe(true);
  });
});

describe('the file itself', () => {
  it('is named so it can be found again', () => {
    expect(backupFileName('Demo Kirana Store', new Date('2026-10-12T09:30:00Z')))
      .toBe('stockmate-demo-kirana-store-2026-10-12-09-30.json');
  });

  it('records what it is, so a future version can read it', () => {
    const f = buildBackup({ tenantId: 'T1', tenantName: 'Demo', tables: tables(), manifest, appVersion: '1.2.3' });
    expect(f.format).toBe(BACKUP_FORMAT);
    expect(BACKUP_FORMAT).toBe(2);
    expect(f.appVersion).toBe('1.2.3');
    expect(f.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('has a checksum that ignores key order', () => {
    expect(checksum({ products: [{ id: 'P1', name: 'Salt' }] }))
      .toBe(checksum({ products: [{ name: 'Salt', id: 'P1' }] }));
  });
});

describe('the restore screen', () => {
  const PAGE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'BackupRestore.jsx'), 'utf8');

  it('asks the server what happened when the connection drops, rather than guessing', () => {
    // A dropped connection during restore_apply may or may not have
    // committed. Saying "failed" could send the owner to restore twice;
    // saying "done" could hide that it never ran.
    expect(PAGE).toMatch(/isTransportFailure\(err\) && jobId/);
    expect(PAGE).toMatch(/rpc\('restore_last'[\s\S]{0,120}data\?\.id === jobId/);
  });

  it("will not restore until the owner types the shop's name", () => {
    expect(PAGE).toMatch(/confirmText\.trim\(\)\.toLowerCase\(\) === shopName\.trim\(\)\.toLowerCase\(\)/);
    expect(PAGE).toMatch(/disabled=\{!canRestore \|\| !!busy\}/);
  });

  it('never clears the offline outbox', () => {
    // It holds sales made on this machine that never reached the server.
    expect(PAGE).not.toMatch(/clearOps/);
  });

  it('takes the table list from the server, never from a list in code', () => {
    // A list in code is how the first version covered 28 of 91 tables.
    expect(PAGE).toMatch(/rpc\('shop_backup_manifest'/);
    expect(PAGE).not.toMatch(/SOURCE_TABLES|DERIVED_TABLES|ALL_BACKUP_TABLES/);
  });
});
