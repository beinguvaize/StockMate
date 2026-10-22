import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * A purchase that changes what an item costs says so before it is saved.
 *
 * Widget A costs Rs 30 and sells at Rs 50 (40 % margin). These tests buy it
 * at Rs 40 (up) and Rs 25 (down) and at Rs 30 (no change), and check:
 *   - the change is shown before anything is saved;
 *   - the selling price can be set there, and only the selling price is
 *     written to the product;
 *   - an unchanged price saves straight away, with no extra step.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

async function openForm(page) {
  await seedAppCache(page);
  await setupMocks(page);
  const calls = { purchases: 0, productPatches: [] };
  await page.route('**/rest/v1/rpc/process_purchase', (r) => {
    calls.purchases += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.route('**/rest/v1/products?*', (r) => {
    if (r.request().method() !== 'PATCH') return r.fallback();
    calls.productPatches.push(r.request().postDataJSON());
    return r.fulfill({ status: 204, body: '' });
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${TENANT_SLUG}/purchases`);
  await page.getByRole('button', { name: /New purchase/ }).click();
  await page.locator('#pf-supplier').selectOption({ label: 'Supplier X' });
  return calls;
}

async function buy(page, qty, total) {
  const product = page.getByLabel('Product', { exact: true }).first();
  await product.click();
  await product.fill('Widget A');
  await page.getByRole('button', { name: /^Widget A/ }).first().dispatchEvent('mousedown');
  await page.getByLabel('Quantity', { exact: true }).first().fill(String(qty));
  await page.getByLabel('Line total', { exact: true }).first().fill(String(total));
}

test('a dearer purchase stops for review, and only the selling price is written', async ({ page }) => {
  const calls = await openForm(page);
  await buy(page, 10, 400);                        // Rs 40 against Rs 30
  await expect(page.getByTestId('line-cost-change')).toContainText('▲ 33.3%');

  await page.getByRole('button', { name: /Save 1 Item/ }).click();
  const review = page.getByTestId('price-change-review');
  await expect(review).toBeVisible();
  expect(calls.purchases, 'nothing saved before the review').toBe(0);

  const row = review.getByTestId('price-change-row');
  await expect(row).toHaveAttribute('data-direction', 'UP');
  await expect(row).toContainText('Up 33.3%');
  await expect(row).toContainText('20.0%');        // margin at the old Rs 50

  // Rs 40 at the old 40 % margin = Rs 66.67, rounded up to Rs 67.
  await review.getByRole('button', { name: /keeps 40%/ }).click();
  await expect(row.getByRole('spinbutton')).toHaveValue('67.00');
  await expect(row).toContainText('40.3%');

  await page.getByTestId('price-change-confirm').click();
  await expect.poll(() => calls.productPatches.length).toBe(1);
  expect(calls.purchases).toBe(1);
  expect(calls.productPatches[0]).toEqual({ sellingPrice: 67 });
});

test('a cheaper purchase is shown too, and leaving the price keeps it', async ({ page }) => {
  const calls = await openForm(page);
  await buy(page, 10, 250);                        // Rs 25 against Rs 30
  await page.getByRole('button', { name: /Save 1 Item/ }).click();

  const row = page.getByTestId('price-change-row');
  await expect(row).toHaveAttribute('data-direction', 'DOWN');
  await expect(row).toContainText('Down 16.7%');

  await page.getByTestId('price-change-confirm').click();
  await expect.poll(() => calls.purchases).toBe(1);
  expect(calls.productPatches, 'no price typed, none written').toEqual([]);
});

test('an unchanged price saves without the extra step', async ({ page }) => {
  const calls = await openForm(page);
  await buy(page, 10, 300);                        // Rs 30, same as now
  await expect(page.getByTestId('line-cost-change')).toHaveCount(0);
  await page.getByRole('button', { name: /Save 1 Item/ }).click();
  await expect.poll(() => calls.purchases).toBe(1);
  await expect(page.getByTestId('price-change-review')).toHaveCount(0);
});

test('Back returns to the bill with every line as it was', async ({ page }) => {
  await openForm(page);
  await buy(page, 10, 400);
  await page.getByRole('button', { name: /Save 1 Item/ }).click();
  await page.getByRole('button', { name: /Back to bill/ }).click();
  await expect(page.getByLabel('Line total', { exact: true }).first()).toHaveValue('400');
  await expect(page.getByLabel('Quantity', { exact: true }).first()).toHaveValue('10');
});
