import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

async function gotoTenant(page, route) {
  await page.goto(`/${TENANT_SLUG}/${route}`);
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin') && !document.querySelector('[data-testid="global-loading"]'),
    { timeout: 15_000 }
  );
}

test.describe('Inventory Management', () => {
  test.use({ storageState: AUTH_FILE });

  test.beforeEach(async ({ page }) => {
    await seedAppCache(page);
    await setupMocks(page);
  });

  test('inventory page displays correct aggregate stock from balances, overriding product stock', async ({ page }) => {
    await gotoTenant(page, 'inventory');

    await expect(page.locator('h1').filter({ hasText: /INVENTORY/i }).first()).toBeVisible();

    // PROD-001 (Widget A) has "100" in products table, but "75" in inventory_balances table.
    // The UI should display 75, proving STOCK-01 refactor applied.
    const widgetName = page.locator('text=Widget A').first();
    await expect(widgetName).toBeVisible();

    // The quantity node shows 75 next to "UNIT" or "UNITS"
    const qtyBadge = page.locator('text=75').first();
    await expect(qtyBadge).toBeVisible();
  });

  test('stock adjustment via UI triggers RPC call', async ({ page }) => {
    await gotoTenant(page, 'inventory');

    // Web redesign: a row's "···" menu opens Adjust stock as a dialog.
    let rpcCalled = false;
    page.on('request', (req) => { if (/\/rpc\/adjust_inventory_atomic/.test(req.url())) rpcCalled = true; });

    await page.getByRole('button', { name: 'Actions for Widget A' }).click();
    await page.getByRole('menuitem', { name: 'Adjust stock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adjust Stock' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('radio', { name: /Add/ }).click();
    await dialog.getByRole('spinbutton', { name: 'Units to add' }).fill('5');
    await dialog.getByLabel('Reason *').selectOption('Received new stock');
    await dialog.getByRole('button', { name: 'Save adjustment' }).click();

    // The mocked RPC answers 200, so the dialog reports the new count.
    await expect(page.getByText('Stock updated')).toBeVisible();
    expect(rpcCalled).toBe(true);
  });
});
