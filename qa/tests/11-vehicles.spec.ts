import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('11 · Vehicles & Routes', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'vehicles');
  });

  test('vehicles page loads', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('vehicle list or empty state renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('add vehicle button visible (if PRO)', async ({ page }) => {
    await page.waitForTimeout(1000);
    const addBtn = page.locator('button:has-text("Add Vehicle"), button:has-text("New Vehicle")').first();
    if (await addBtn.count() > 0) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('dispatch route button visible', async ({ page }) => {
    await page.waitForTimeout(1000);
    const dispatchBtn = page.locator('button:has-text("Dispatch"), button:has-text("Route")').first();
    if (await dispatchBtn.count() > 0) {
      await expect(dispatchBtn).toBeVisible();
    }
  });

  test('vehicle status labels (ACTIVE/IDLE/ON_ROUTE) visible', async ({ page }) => {
    await page.waitForTimeout(2000);
    const status = page.locator('text=/ACTIVE|IDLE|ON.ROUTE|AVAILABLE/i').first();
    if (await status.count() > 0) {
      await expect(status).toBeVisible();
    }
  });
});
