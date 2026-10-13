import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

/**
 * Moving stock between two locations, from the user's side.
 * ==========================================================================
 *
 * The thing worth a browser test here is not the arithmetic — that is in
 * transferRefusal.test.js and in the SQL probe. It is the two behaviours that
 * only exist once the screen is assembled:
 *
 *   1. the product list offers ONLY what is standing at the SOURCE, so a
 *      user's first attempt is not walked into a refusal; and
 *   2. a refusal shows the server's own sentence AND LEAVES THE FORM, because
 *      a refused transfer is one number away from a valid one.
 *
 * The second is the one that regresses silently: every other outcome looks the
 * same to a passing test if the error branch quietly clears the form or prints
 * "Transfer failed".
 */

async function gotoInventory(page) {
  await page.goto(`/${TENANT_SLUG}/inventory`);
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin') && !document.querySelector('[data-testid="global-loading"]'),
    { timeout: 15_000 },
  );
}

/**
 * Everything is scoped to the modal by test id. The inventory table behind it
 * has its own "Widget A" button, and a loose text match resolved to both --
 * which is how a test ends up asserting against the wrong screen.
 */
const modal = (page) => page.getByTestId('transfer-modal');

async function openTransfer(page) {
  await gotoInventory(page);
  await page.getByRole('button', { name: /transfer/i }).click();
  await expect(modal(page)).toBeVisible();
}

/** Open the transfer screen and pick Widget A, which has 75 at the source. */
async function openTransferWithWidgetA(page) {
  await openTransfer(page);
  await modal(page).getByTestId('transfer-candidate').filter({ hasText: 'Widget A' }).click();
  await modal(page).getByTestId('transfer-qty').fill('10');
}

test.describe('Transfer stock between locations', () => {
  test.use({ storageState: AUTH_FILE });

  test.beforeEach(async ({ page }) => {
    await seedAppCache(page);
    await setupMocks(page);
  });

  test('offers only what is in stock at the source', async ({ page }) => {
    await openTransfer(page);

    // Widget A has 75 at Main Warehouse. Gadget B and Doohickey C have a
    // products.stock figure but NO balance row at this location, so they
    // cannot be moved from here and must not be offered.
    const offered = modal(page).getByTestId('transfer-candidate');
    await expect(offered).toHaveCount(1);
    await expect(offered.first()).toContainText('Widget A');
    await expect(offered.first()).toContainText('75');
  });

  test('shows both ends of the move before it is made', async ({ page }) => {
    await openTransferWithWidgetA(page);

    // 75 at the source becomes 65; the destination holds nothing and gets 10.
    await expect(modal(page).getByText('75 → 65')).toBeVisible();
    await expect(modal(page).getByText('0 → 10')).toBeVisible();
  });

  test('a refusal shows the server reason and keeps the form', async ({ page }) => {
    // The RPC refuses, the way it does when another till emptied the shelf
    // between the page loading and the button being pressed.
    await page.route('**/rest/v1/rpc/transfer_inventory_atomic', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: '23514',
          message: 'TRANSFER_SHORT: Widget A has 2.00 at the source and this moves 10.00',
        }),
      }));

    await openTransferWithWidgetA(page);
    await modal(page).getByRole('button', { name: /^Move Stock$/ }).click();

    const problem = modal(page).getByTestId('transfer-problem');
    // The heading tells the user what kind of problem it is...
    await expect(problem).toContainText('Not enough stock at the source');
    // ...and the server's figures, which are what makes it fixable, survive.
    await expect(problem).toContainText('Widget A has 2.00 at the source and this moves 10.00');
    // The marker is for code and is never shown.
    await expect(problem).not.toContainText('TRANSFER_SHORT');

    // The form is still standing: same product, same quantity, no success
    // screen. This is the assertion that fails if the error branch resets.
    await expect(modal(page).getByTestId('transfer-qty')).toHaveValue('10');
    await expect(page.getByTestId('transfer-done')).toHaveCount(0);
  });

  test('a failure that is not a refusal keeps its own words', async ({ page }) => {
    await page.route('**/rest/v1/rpc/transfer_inventory_atomic', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PGRST202',
          message: 'Could not find the function public.transfer_inventory_atomic in the schema cache',
        }),
      }));

    await openTransferWithWidgetA(page);
    await modal(page).getByRole('button', { name: /^Move Stock$/ }).click();

    // Not dressed up as a stock problem: that would send the user to count
    // shelves that are fine and hide the real fault.
    const problem = modal(page).getByTestId('transfer-problem');
    await expect(problem).toContainText('Transfer failed');
    await expect(problem).toContainText('schema cache');
    await expect(problem).not.toContainText('Not enough stock at the source');
  });

  test('a successful move reports where the stock went', async ({ page }) => {
    await openTransferWithWidgetA(page);
    await modal(page).getByRole('button', { name: /^Move Stock$/ }).click();

    await expect(page.getByTestId('transfer-done')).toBeVisible();
    const summary = page.getByText(/moved from/);
    await expect(summary).toContainText('Main Warehouse');
    await expect(summary).toContainText('Second Counter');
    await expect(summary).toContainText('10');
  });

  test('refuses to move stock to where it already is', async ({ page }) => {
    await openTransfer(page);

    // Point the destination at the source.
    await modal(page).getByTestId('transfer-to')
      .selectOption('00000000-0000-0000-0000-000000000001');

    await expect(modal(page).getByText(/stock cannot move to where it already is/)).toBeVisible();
    await expect(modal(page).getByRole('button', { name: /^Move Stock$/ })).toBeDisabled();
  });
});
