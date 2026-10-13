import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * The Tally file, through the real screen.
 *
 * tallyExport.test.js pins the XML and the double-entry. This pins that the
 * screen is wired to real sales and produces a file the accountant can open —
 * and, because it is the failure that costs a day, that the file parses as XML
 * at all rather than only looking like it does.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

test('the owner can export the year to Tally', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/${TENANT_SLUG}/data-tools`);

  await page.getByRole('button', { name: /Export to Tally/i }).click();
  await expect(page.getByText(/Gateway/i)).toBeVisible({ timeout: 10_000 });

  // Widen the window so the seeded sales are certainly inside it.
  await page.locator('input[type="date"]').first().fill('2000-01-01');
  await page.locator('input[type="date"]').nth(1).fill('2099-12-31');
  await page.waitForTimeout(400);

  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: /Download Tally XML/i }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^tally-.*\.xml$/);

  const to = path.join(__dirname, '.tmp-tally.xml');
  await file.saveAs(to);
  const xml = fs.readFileSync(to, 'utf8');

  // It must be well-formed: a file Tally cannot parse is reported to the
  // shopkeeper as "your data is corrupt" at a line number.
  const parsed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const err = doc.querySelector('parsererror');
    return {
      error: err ? err.textContent.slice(0, 200) : null,
      vouchers: doc.querySelectorAll('VOUCHER').length,
      ledgers: doc.querySelectorAll('LEDGER').length,
    };
  }, xml);

  expect(parsed.error, 'the XML does not parse').toBeNull();
  expect(parsed.vouchers).toBeGreaterThan(0);
  expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');

  fs.unlinkSync(to);
  expect(errors, 'page threw').toEqual([]);
});
