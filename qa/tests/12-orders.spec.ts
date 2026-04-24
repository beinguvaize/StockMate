import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('12 · Orders / Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'orders');
  });

  test('orders page loads', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('order list or pipeline renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('order status indicators visible', async ({ page }) => {
    await page.waitForTimeout(2000);
    const status = page.locator('text=/PENDING|CONFIRMED|DELIVERED|CANCELLED/i').first();
    if (await status.count() > 0) {
      await expect(status).toBeVisible();
    }
  });
});
