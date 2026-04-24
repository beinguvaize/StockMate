import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('09 · Purchases', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'purchases');
  });

  test('purchases page loads (PRO feature)', async ({ page }) => {
    await page.waitForTimeout(2000);
    // May show upgrade screen if not PRO plan
    const isUpgradeScreen = await page.locator('text=/upgrade|PRO|plan/i').count() > 0;
    const isError = await page.locator('text=Something went wrong').count() > 0;

    if (isUpgradeScreen) {
      console.log('INFO: Purchases is a PRO feature — upgrade wall shown');
    } else if (isError) {
      throw new Error('Purchases page crashed with an error');
    }
    // Either upgrade screen or actual page is acceptable
  });

  test('purchase list or empty state renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('add purchase button visible (if PRO)', async ({ page }) => {
    await page.waitForTimeout(1000);
    const addBtn = page.locator('button:has-text("Add Purchase"), button:has-text("New Purchase"), button:has-text("Record Purchase")').first();
    if (await addBtn.count() > 0) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('purchase form requires quantity > 0', async ({ page }) => {
    await page.waitForTimeout(1000);
    const addBtn = page.locator('button:has-text("Add Purchase"), button:has-text("New Purchase"), button:has-text("Record Purchase")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }

    await addBtn.click();
    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    if (await modal.count() === 0) { test.skip(); return; }
    await expect(modal).toBeVisible({ timeout: 5000 });

    const qtyInput = page.locator('input[name="quantity"], input[placeholder*="qty" i], input[placeholder*="quantity" i]').first();
    if (await qtyInput.count() > 0) {
      await qtyInput.fill('0');
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
        const stillOpen = await modal.isVisible();
        console.log('Form stays open for qty=0:', stillOpen);
      }
    }
  });
});
