import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * Backup and restore, through the real screen.
 *
 * The restore's correctness lives in the database and was proven there
 * (byte-identical round trips, every refusal leaving the shop untouched). What
 * these tests pin is the screen's half of the contract:
 *
 *   - the backup it writes is one it will accept back;
 *   - nothing is restored until the owner types the shop's name;
 *   - every table is uploaded, an empty one included;
 *   - a refusal says the shop is unchanged, in the server's own words;
 *   - a dropped connection is resolved by asking the server, never guessed.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

const SHOP = 'Test Co';
const MANIFEST = [
  { table: 'products', ord: 0, mode: 'RESTORE', count: 2 },
  { table: 'attendance', ord: 0, mode: 'RESTORE', count: 0 },
  { table: 'sales', ord: 1, mode: 'RESTORE', count: 1 },
];
const ROWS = {
  products: [{ id: 'P1', name: 'Salt' }, { id: 'P2', name: 'Butter' }],
  attendance: [],
  sales: [{ id: 'S1', totalAmount: 100 }],
};

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Mock the backup/restore RPCs. Returns a log of what the page called. */
async function mockRestoreApi(page, { apply, last = null } = {}) {
  const calls = { stage: [], apply: 0, undo: 0, last: 0 };
  await page.route('**/rest/v1/rpc/shop_backup_manifest', (r) => json(r, MANIFEST));
  await page.route('**/rest/v1/rpc/export_shop_table', (r) => {
    const { p_table, p_offset } = r.request().postDataJSON();
    return json(r, p_offset === 0 ? ROWS[p_table] : []);
  });
  await page.route('**/rest/v1/rpc/restore_begin', (r) => json(r, 'job-1'));
  await page.route('**/rest/v1/rpc/restore_stage', (r) => {
    const b = r.request().postDataJSON();
    calls.stage.push({ table: b.p_table, chunk: b.p_chunk_no, n: b.p_rows.length });
    return json(r, b.p_rows.length);
  });
  await page.route('**/rest/v1/rpc/restore_apply', (r) => { calls.apply += 1; return apply(r); });
  await page.route('**/rest/v1/rpc/restore_last', (r) => {
    calls.last += 1;
    return json(r, typeof last === 'function' ? last(calls) : last);
  });
  await page.route('**/rest/v1/rpc/restore_undo', (r) => {
    calls.undo += 1;
    return json(r, { restored: { products: 2 }, job_id: 'job-undo' });
  });
  return calls;
}

async function openBackup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seedAppCache(page);
  await setupMocks(page);
  return errors;
}

async function go(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${TENANT_SLUG}/backup`);
  await page.getByRole('heading', { name: /Backup/i }).waitFor({ timeout: 15_000 });
}

/** Take a backup through the button and return the saved file's path. */
async function takeBackup(page) {
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: /Download backup/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^stockmate-.*\.json$/);
  // The OS temp directory, not the repo: a test that fails before its cleanup
  // must not leave a backup file behind in the working tree.
  const to = path.join(os.tmpdir(), `stockmate-backup-test-${Date.now()}.json`);
  await file.saveAs(to);
  return to;
}

async function loadFile(page, to) {
  await page.setInputFiles('[data-testid="backup-file"]', to);
  await expect(page.getByTestId('backup-ok')).toBeVisible({ timeout: 10_000 });
}

test('a backup holds every table the server lists, and the app accepts it back', async ({ page }) => {
  const errors = await openBackup(page);
  await mockRestoreApi(page, { apply: (r) => json(r, {}) });
  await go(page);

  const to = await takeBackup(page);
  const parsed = JSON.parse(fs.readFileSync(to, 'utf8'));
  expect(parsed.format).toBe(2);
  // Every table the server named, an empty one included.
  expect(Object.keys(parsed.tables).sort()).toEqual(['attendance', 'products', 'sales']);
  expect(parsed.tables.attendance).toEqual([]);
  expect(parsed.manifest.map((m) => m.table)).toContain('attendance');

  await loadFile(page, to);
  await expect(page.getByTestId('backup-ok')).toContainText('3 rows in 3 tables');
  fs.unlinkSync(to);
  expect(errors, 'page threw').toEqual([]);
});

test("nothing is restored until the owner types the shop's name, then every table is uploaded", async ({ page }) => {
  await openBackup(page);
  const calls = await mockRestoreApi(page, {
    apply: (r) => json(r, { restored: { products: 2, sales: 1 }, job_id: 'job-1' }),
  });
  await go(page);
  const to = await takeBackup(page);
  await loadFile(page, to);

  const go_ = page.getByTestId('restore-go');
  await expect(go_).toBeDisabled();
  await page.getByTestId('restore-confirm').fill('Test');      // not the full name
  await expect(go_).toBeDisabled();
  await page.getByTestId('restore-confirm').fill(SHOP.toLowerCase());
  await expect(go_).toBeEnabled();

  await go_.click();
  await expect(page.getByTestId('restore-outcome')).toContainText('Restored');
  await expect(page.getByTestId('restore-outcome')).toContainText('3 rows written');

  // The empty table went up too, as one empty chunk: the server refuses a
  // restore that lacks a table, because its wipe would leave it empty.
  expect(calls.stage).toContainEqual({ table: 'attendance', chunk: 0, n: 0 });
  expect(new Set(calls.stage.map((c) => c.table))).toEqual(new Set(['products', 'attendance', 'sales']));
  expect(calls.apply).toBe(1);
  fs.unlinkSync(to);
});

test("a refusal shows the server's reason and says the shop is unchanged", async ({ page }) => {
  await openBackup(page);
  await mockRestoreApi(page, {
    apply: (r) => json(r, {
      code: 'P0001',
      message: 'RESTORE_REFUSED: 1 e-invoice(s) registered with the GST portal after this backup would be erased. Restore a later backup.',
    }, 400),
  });
  await go(page);
  const to = await takeBackup(page);
  await loadFile(page, to);
  await page.getByTestId('restore-confirm').fill(SHOP);
  await page.getByTestId('restore-go').click();

  const out = page.getByTestId('restore-outcome');
  await expect(out).toContainText('This backup cannot be restored');
  await expect(out).toContainText('registered with the GST portal');
  await expect(out).toContainText('Nothing in the shop was changed.');
  await expect(out).not.toContainText('RESTORE_REFUSED');
  fs.unlinkSync(to);
});

test('a dropped connection is settled by asking the server: it finished', async ({ page }) => {
  await openBackup(page);
  const calls = await mockRestoreApi(page, {
    apply: (r) => r.abort('failed'),
    // Before the restore: nothing applied. After the drop: the server shows job-1.
    last: (c) => (c.apply > 0 ? { id: 'job-1', applied_at: new Date().toISOString(), rows: 3, source: 'FILE' } : null),
  });
  await go(page);
  const to = await takeBackup(page);
  await loadFile(page, to);
  await page.getByTestId('restore-confirm').fill(SHOP);
  await page.getByTestId('restore-go').click();

  await expect(page.getByTestId('restore-outcome')).toContainText('server confirms the restore finished');
  expect(calls.last).toBeGreaterThan(1);   // asked, rather than assumed
  fs.unlinkSync(to);
});

test('a dropped connection is settled by asking the server: it did not run', async ({ page }) => {
  await openBackup(page);
  await mockRestoreApi(page, { apply: (r) => r.abort('failed'), last: null });
  await go(page);
  const to = await takeBackup(page);
  await loadFile(page, to);
  await page.getByTestId('restore-confirm').fill(SHOP);
  await page.getByTestId('restore-go').click();

  const out = page.getByTestId('restore-outcome');
  await expect(out).toContainText('The restore did not finish');
  await expect(out).toContainText('nothing was changed');
  fs.unlinkSync(to);
});

test('the last restore can be undone', async ({ page }) => {
  await openBackup(page);
  const calls = await mockRestoreApi(page, {
    apply: (r) => json(r, {}),
    last: { id: 'job-1', applied_at: new Date().toISOString(), rows: 3, source: 'FILE' },
  });
  await go(page);

  await expect(page.getByTestId('last-restore')).toContainText('Last restore');
  await expect(page.getByTestId('last-restore')).toContainText('Anything entered since');
  await page.getByTestId('restore-undo').click();
  await expect(page.getByTestId('restore-outcome')).toContainText('Restore undone');
  expect(calls.undo).toBe(1);
});
