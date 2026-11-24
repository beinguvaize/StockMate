import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * Inclusive vs exclusive, on the document screen.
 * ==========================================================================
 *
 * The maths is pinned in src/lib/taxLine.test.js. This pins that the control
 * is WIRED: that choosing "Tax included" changes what the customer is asked to
 * pay, and that a sales invoice -- whose tax the server decides -- does not
 * offer a choice it cannot honour.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

async function openDoc(page, tabName) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/${TENANT_SLUG}/documents/new`);
  await page.getByText('Taxable value').waitFor({ state: 'visible', timeout: 15_000 });
  // Pick the document type the way a user does. The ?type= query param did
  // not survive the route, which is worth knowing but is not what this tests.
  if (tabName) {
    await page.getByRole('button', { name: tabName, exact: true }).click();
    await page.waitForTimeout(400);
  }
}

/** One line: qty 1, rate 125, 8% tax — the bill from the screenshot. */
async function addLine(page) {
  await page.getByRole('button', { name: /Add item/i }).click();
  await page.getByPlaceholder('Item name').first().fill('13*16 BLACK KING');
  // qty, rate, disc, tax — in grid order. The later number inputs on the page
  // (additional charges, bill discount) come after these.
  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill('1');
  await nums.nth(1).fill('125');
  await nums.nth(2).fill('0');
  await nums.nth(3).fill('8');
  await page.waitForTimeout(400);
}

test('a manual bill can be billed tax-inclusive', async ({ page }) => {
  await openDoc(page, 'Manual bill');
  await addLine(page);

  // Exclusive: 125 + 8% = 135, which is what this screen could only ever do.
  await expect(page.getByText('₹135.00').first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Tax included' }).click();
  await page.waitForTimeout(400);

  // Inclusive: the customer pays the printed 125, and the tax comes out of it.
  await expect(page.getByText('₹125.00').first()).toBeVisible();
  await expect(page.getByText('₹135.00')).toHaveCount(0);
});

test('a sales invoice shows the mode but does not offer to change it', async ({ page }) => {
  // process_sale resolves the mode from business_profile server-side, so a
  // toggle here would be overruled on save. A control that does nothing is
  // worse than a label that tells the truth.
  await openDoc(page, null);
  await expect(page.getByText(/taxed server-side/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tax included' })).toHaveCount(0);
});
