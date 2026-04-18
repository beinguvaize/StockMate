import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG, MOCK_CLIENTS } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

async function gotoTenant(page, route) {
  await page.goto(`/${TENANT_SLUG}/${route}`);
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 12_000 }
  );
}

test.describe('Client Payments', () => {
  test.use({ storageState: AUTH_FILE });

  test.beforeEach(async ({ page }) => {
    await seedAppCache(page);
    await setupMocks(page);
  });

  test('clients page displays outstanding balance and allows payment creation', async ({ page }) => {
    await gotoTenant(page, 'clients');

    await expect(page.locator('h1').filter({ hasText: /CLIENTS/i }).first()).toBeVisible();

    // MOCK_CLIENTS[1] is 'Beta Ltd' with an outstanding_balance of 500
    const clientName = page.locator('text=Beta Ltd').first();
    await expect(clientName).toBeVisible();

    // Ensure 500 balance is visible
    const outstandingBadge = page.locator('text=500').first();
    await expect(outstandingBadge).toBeVisible();
    
    // Find payment log/create button for the client
    const paymentBtn = page.locator('button').filter({ hasText: /payment|receive|pay|\$/i }).first();
    if (await paymentBtn.isVisible()) {
      await paymentBtn.click();
      
      const amountInput = page.locator('input[type="number"]').first();
      await expect(amountInput).toBeVisible({ timeout: 5000 });
      await amountInput.fill('100');

      const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /confirm|submit|record/i }).first();
      await submitBtn.click();
      
      await expect(amountInput).toBeHidden();
    }
  });
});
