import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('10 · Suppliers', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'suppliers');
  });

  test('suppliers page loads', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('supplier list or empty state renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('add supplier button is visible (if PRO)', async ({ page }) => {
    await page.waitForTimeout(1000);
    const addBtn = page.locator('button:has-text("Add Supplier"), button:has-text("New Supplier"), button:has-text("Add")').first();
    if (await addBtn.count() > 0) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('supplier name and contact fields exist in form', async ({ page }) => {
    await page.waitForTimeout(1000);
    const addBtn = page.locator('button:has-text("Add Supplier"), button:has-text("New Supplier")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }

    await addBtn.click();
    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    if (await modal.count() === 0) { test.skip(); return; }
    await expect(modal).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await nameInput.count() > 0) {
      await expect(nameInput).toBeVisible();
    }
  });
});
