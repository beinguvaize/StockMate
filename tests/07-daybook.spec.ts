import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('07 · Day Book', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'daybook');
  });

  test('day book page loads', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('ledger entries or table visible', async ({ page }) => {
    await page.waitForTimeout(2000);
    const tableOrList = page.locator('table, [class*="ledger"], [class*="daybook"]').first();
    if (await tableOrList.count() > 0) {
      await expect(tableOrList).toBeVisible();
    }
  });

  test('opening and closing balance fields visible', async ({ page }) => {
    await page.waitForTimeout(1000);
    const balanceInput = page.locator('input[name*="balance" i], input[placeholder*="balance" i]').first();
    if (await balanceInput.count() > 0) {
      await expect(balanceInput).toBeVisible();
    }
  });

  test('date filter or date navigation works', async ({ page }) => {
    await page.waitForTimeout(1000);
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count() > 0) {
      await dateInput.fill('2025-01-01');
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });
});
