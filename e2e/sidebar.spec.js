import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

test('the sidebar replaces the top nav and collapses', async ({ page }) => {
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });

  const rail = page.locator('aside').first();
  await expect(rail).toBeVisible();

  // Everything the More menu used to hide is now on screen under a heading.
  await expect(page.getByText('Books', { exact: true })).toBeVisible();
  for (const label of ['Dashboard', 'Sales', 'Invoices', 'Day Book', 'Reports', 'Settings']) {
    await expect(rail.getByText(label, { exact: true })).toBeVisible();
  }
  // And the More control is gone entirely.
  await expect(page.getByRole('button', { name: /^More$/ })).toHaveCount(0);

  await page.screenshot({ path: 'shot-expanded.png' });

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(350);
  // Collapsed: the labels go, the items stay reachable by their title.
  await expect(rail.getByText('Dashboard', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.screenshot({ path: 'shot-collapsed.png' });
});

test('the phone keeps its drawer and never shows the rail', async ({ page }) => {
  // The rail is desktop-only. A 68px strip of icons on a 390px screen would
  // be a fifth of the width for navigation nobody asked for.
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });

  await expect(page.locator('aside').first()).toBeHidden();
  // The hamburger still opens the drawer that was already there.
  const rail = page.locator('aside').first();
  await expect(rail).not.toBeInViewport();
  await page.screenshot({ path: 'shot-phone.png' });
});
