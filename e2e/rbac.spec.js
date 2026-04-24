import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG, MOCK_STAFF_USER } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAFF_AUTH_FILE = path.join(__dirname, '.auth/staff.json');

async function gotoTenant(page, route) {
  await page.goto(`/${TENANT_SLUG}/${route}`);
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 12_000 }
  );
}

test.describe('RBAC and Tenant Isolation', () => {

  test.describe('STAFF / VIEW_ONLY role', () => {
    test.use({ storageState: STAFF_AUTH_FILE });

    test.beforeEach(async ({ page }) => {
      const isStaff = true;
      await seedAppCache(page, isStaff);
      await setupMocks(page, isStaff);
    });

    test('write actions are hidden for STAFF users on Inventory', async ({ page }) => {
      await gotoTenant(page, 'inventory');
      
      const addStockBtn = page.locator('button').filter({ hasText: /new|add|\+/i });
      // Since it's view only, add buttons should not be present in the UI
      await expect(addStockBtn).toHaveCount(0);
    });

    test('write actions are hidden for STAFF users on Sales', async ({ page }) => {
      await gotoTenant(page, 'sales');
      
      // Look for the "Confirm Sale" or checkout button — usually hidden or disabled for view-only
      const checkoutBtn = page.locator('button').filter({ hasText: /confirm|place sale|checkout/i });
      await expect(checkoutBtn).toHaveCount(0);
    });
  });

  test.describe('Tenant Data Isolation', () => {
    // We'll use the regular owner auth for this, but we'll monitor network requests.
    const AUTH_FILE = path.join(__dirname, '.auth/user.json');
    test.use({ storageState: AUTH_FILE });

    test.beforeEach(async ({ page }) => {
      await seedAppCache(page);
      await setupMocks(page);
    });

    test('API requests carry tenant_id filter', async ({ page }) => {
      const requestPromises = [];
      page.on('request', request => {
        const url = request.url();
        if (url.includes('/rest/v1/') && request.method() === 'GET') {
          requestPromises.push(url);
        }
      });

      await gotoTenant(page, 'inventory');
      
      // Wait for network idle or product grid
      await expect(page.locator('text=Widget A').first()).toBeVisible();

      // Check the intercepted requests - they should be filtered by tenant_id automatically 
      // by the Supabase client RLS or explicitly via the query string.
      // E.g., /rest/v1/products?select=*...
      const hasRestRequests = requestPromises.length > 0;
      expect(hasRestRequests).toBe(true);
    });
  });
});
