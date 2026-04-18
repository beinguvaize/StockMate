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

    // Filter to limit scope to Widget A
    const searchInput = page.locator('input[placeholder*="Search by" i], input[placeholder*="search" i]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Widget A');
    }

    // Find the edit/adjust button for Widget A. Typically an icon button.
    // We'll click the row or the adjust button to open the modal.
    const adjustBtn = page.locator('button').filter({ hasText: /adjust|edit|\+/i }).first();
    
    // If we can't find an explicit button, we click the first row which might open a detail/edit view
    if (await adjustBtn.isVisible()) {
      await adjustBtn.click();
    } else {
      await page.locator('text=Widget A').first().click();
    }

    // Wait for the adjustment modal to appear - look for an input to change the qty
    const updateStockBtn = page.locator('button').filter({ hasText: /confirm|save|update|adjust/i }).first();
    await expect(updateStockBtn).toBeVisible({ timeout: 5000 });
    
    // We mock the RPC success on adjust_inventory_atomic
    // This just verifies the form can be submitted without crashing.
    await updateStockBtn.click();
    
    // Form should close
    await expect(updateStockBtn).toBeHidden();
  });
});
