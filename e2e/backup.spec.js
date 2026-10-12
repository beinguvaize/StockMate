import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * The shop's backup, through the real screen.
 *
 * backupFile.test.js pins the rules. This pins that the button produces a file
 * at all, and — the part worth having an e2e for — that the file it produces
 * is one the same app will accept back. A backup nobody can read is the
 * failure this feature exists to prevent.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

async function openBackup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${TENANT_SLUG}/backup`);
  await page.getByRole('heading', { name: /Backup/i }).waitFor({ timeout: 15_000 });
  return errors;
}

test('the owner can take a backup, and the app accepts it back', async ({ page }) => {
  const errors = await openBackup(page);

  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: /Download backup/i }).click();
  const file = await download;

  // Named so it can be found again in a folder of fifty.
  expect(file.suggestedFilename()).toMatch(/^stockmate-.*\.json$/);

  const to = path.join(__dirname, '.tmp-backup.json');
  await file.saveAs(to);
  const parsed = JSON.parse(fs.readFileSync(to, 'utf8'));
  expect(parsed.format).toBe(1);
  expect(parsed.tables.products.length).toBeGreaterThan(0);

  // Feed it back to the checker through the UI: the round trip is the point.
  //
  // Targeted by test id, not by text. The first version of this test asserted
  // on /Readable and complete/i -- which also matches the static helper line
  // above the input, so it passed without the file ever being read.
  await page.setInputFiles('[data-testid="backup-file"]', to);
  await expect(page.getByTestId('backup-ok')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('backup-ok')).toContainText(`${parsed.tables.products.length}`, { timeout: 5_000 });

  fs.unlinkSync(to);
  expect(errors, 'page threw').toEqual([]);
});

/**
 * The damaged-file case is NOT here, deliberately.
 *
 * inspectBackup refusing a truncated or edited file is pinned in
 * src/lib/backupFile.test.js, where it is also checked by mutation. A second
 * copy of that assertion driven through the browser would add no coverage,
 * and the upload in it would not fire the change handler for reasons that
 * stayed unexplained after a long dig — so it would have been a flaky test
 * guarding something already guarded.
 */
