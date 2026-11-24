import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * A line far from what the item last cost is asked about before it saves.
 *
 * An owner saved "10*13 Cover PKT" at Rs 9.15 a unit when it had been bought
 * at Rs 6.00 and Rs 5.90 -- the line was against the wrong product -- and
 * nothing said so. The check asks once and never blocks.
 *
 * Fixtures: Widget A was last bought at Rs 92 a unit (PUR-1, 13,800 / 150),
 * before that at Rs 110 (PUR-4) and Rs 310 (PUR-3). Its costPrice is Rs 30,
 * so buying at Rs 30 skips the separate cost-change review and saves directly.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

// Set PRICECHECK_SHOTS to a folder to keep a picture of each dialog.
const SHOTS = process.env.PRICECHECK_SHOTS;
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(600);                           // let the fade-in finish
  await page.screenshot({ path: path.join(SHOTS, name) });
}

async function boot(page) {
  await seedAppCache(page);
  await setupMocks(page);
  const calls = { purchases: 0, billEdits: 0 };
  await page.route('**/rest/v1/rpc/process_purchase', (r) => {
    calls.purchases += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.route('**/rest/v1/rpc/edit_purchase_bill', (r) => {
    calls.billEdits += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${TENANT_SLUG}/purchases`);
  return calls;
}

async function newPurchase(page, qty, total) {
  await page.getByRole('button', { name: /New purchase/ }).click();
  await page.locator('#pf-supplier').selectOption({ label: 'Supplier X' });
  const product = page.getByLabel('Product', { exact: true }).first();
  await product.click();
  await product.fill('Widget A');
  await page.getByRole('button', { name: /^Widget A/ }).first().dispatchEvent('mousedown');
  await page.getByLabel('Quantity', { exact: true }).first().fill(String(qty));
  await page.getByLabel('Line total', { exact: true }).first().fill(String(total));
}

// PUR-1: Widget A, 150 units, Rs 13,800, paid -- so on the Paid tab.
async function editPaidBill(page) {
  await page.getByRole('tab', { name: /^Paid/ }).click();
  await page.getByTestId('bill').filter({ hasText: '13,800.00' }).getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: /Edit bill/ }).click();
}

test('a price far from the last purchase asks first, and "Yes" still saves', async ({ page }) => {
  const calls = await boot(page);
  await newPurchase(page, 10, 300);                         // Rs 30 against Rs 92
  await page.getByRole('button', { name: /Save 1 Item/ }).click();

  const dialog = page.getByTestId('price-check-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('price-check-line'))
    .toHaveText(/^Widget A: ₹30\.00 per unit\. Last bought at ₹92\.00 on \d{1,2} \w{3}( \d{4})?, 67% lower\.$/);
  expect(calls.purchases, 'nothing saved while asking').toBe(0);
  await shot(page, 'web-new-purchase-dialog.png');

  await dialog.getByRole('button', { name: 'Yes, these prices are right' }).click();
  await expect.poll(() => calls.purchases).toBe(1);
  await expect(dialog).toHaveCount(0);
});

test('"Change it" goes back with the amount in focus, saving nothing', async ({ page }) => {
  const calls = await boot(page);
  await newPurchase(page, 10, 300);
  await page.getByRole('button', { name: /Save 1 Item/ }).click();
  await page.getByRole('button', { name: 'Change it' }).click();

  await expect(page.getByTestId('price-check-dialog')).toHaveCount(0);
  await expect(page.getByLabel('Line total', { exact: true }).first()).toBeFocused();
  expect(calls.purchases).toBe(0);
});

test('a price within 20 % of the last purchase does not ask', async ({ page }) => {
  const calls = await boot(page);
  await newPurchase(page, 10, 1000);                        // Rs 100 against Rs 92: +8.7 %
  await page.getByRole('button', { name: /Save 1 Item/ }).click();
  // Rs 100 is still a change from costPrice Rs 30, so the cost review shows.
  await expect(page.getByTestId('price-change-review')).toBeVisible();
  await expect(page.getByTestId('price-check-dialog')).toHaveCount(0);
  await page.getByTestId('price-change-confirm').click();
  await expect.poll(() => calls.purchases).toBe(1);
});

test('Edit Bill compares a changed line with the purchase before it', async ({ page }) => {
  const calls = await boot(page);
  await editPaidBill(page);

  const amount = page.getByLabel('Amount', { exact: true }).first();
  await amount.fill('4500');                                // 150 units: Rs 30 each
  await page.getByRole('button', { name: /Save bill/ }).click();

  // Not Rs 92 -- that is this line's own old price -- but PUR-4's Rs 110.
  const dialog = page.getByTestId('price-check-dialog');
  await expect(dialog.getByTestId('price-check-line'))
    .toContainText('Widget A: ₹30.00 per unit. Last bought at ₹110.00 on');
  await expect(dialog.getByTestId('price-check-line')).toContainText('73% lower.');
  await shot(page, 'web-edit-bill-dialog.png');

  await dialog.getByRole('button', { name: 'Change it' }).click();
  await expect(amount).toBeFocused();
  expect(calls.billEdits).toBe(0);

  await page.getByRole('button', { name: /Save bill/ }).click();
  await page.getByRole('button', { name: 'Yes, these prices are right' }).click();
  await expect.poll(() => calls.billEdits).toBe(1);
});

test('Edit Bill does not ask about a line nobody changed', async ({ page }) => {
  const calls = await boot(page);
  await editPaidBill(page);
  await page.getByPlaceholder('optional').fill('INV-77');   // header only
  await page.getByRole('button', { name: /Save bill/ }).click();
  await expect.poll(() => calls.billEdits).toBe(1);
  await expect(page.getByTestId('price-check-dialog')).toHaveCount(0);
});
