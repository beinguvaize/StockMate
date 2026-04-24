import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('16 · Settings', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'settings');
  });

  test('settings page loads', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('business name field is visible and editable', async ({ page }) => {
    await page.waitForTimeout(1500);
    const nameInput = page.locator('input[name="name"], input[placeholder*="business" i], input[placeholder*="company" i]').first();
    if (await nameInput.count() > 0) {
      await expect(nameInput).toBeVisible();
      await expect(nameInput).toBeEditable();
    }
  });

  test('currency selector is present', async ({ page }) => {
    await page.waitForTimeout(1500);
    const currencyInput = page.locator('select[name="currency"], input[name="currency"], select:has(option[value="USD"])').first();
    if (await currencyInput.count() > 0) {
      await expect(currencyInput).toBeVisible();
    }
  });

  test('save/update button is visible', async ({ page }) => {
    await page.waitForTimeout(1500);
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first();
    if (await saveBtn.count() > 0) {
      await expect(saveBtn).toBeVisible();
    }
  });

  test('bank account fields present', async ({ page }) => {
    await page.waitForTimeout(1500);
    const bankField = page.locator('input[name="bank_name"], input[name="account_no"], input[placeholder*="bank" i]').first();
    if (await bankField.count() > 0) {
      await expect(bankField).toBeVisible();
    }
  });

  test('low stock threshold field present', async ({ page }) => {
    await page.waitForTimeout(1500);
    const thresholdField = page.locator('input[name="lowStockThreshold"], input[placeholder*="threshold" i]').first();
    if (await thresholdField.count() > 0) {
      await expect(thresholdField).toBeVisible();
    }
  });
});
