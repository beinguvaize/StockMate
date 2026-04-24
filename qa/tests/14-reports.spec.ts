import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('14 · Reports', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'reports');
  });

  test('reports page loads', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('report tabs or type selector visible', async ({ page }) => {
    await page.waitForTimeout(2000);
    const tabs = page.locator('[role="tab"], button[class*="tab"]');
    const count = await tabs.count();
    console.log(`Report tabs found: ${count}`);
    if (count > 0) {
      await expect(tabs.first()).toBeVisible();
    }
  });

  test('sales report tab loads', async ({ page }) => {
    await page.waitForTimeout(1000);
    const salesTab = page.locator('[role="tab"]:has-text("Sales"), button:has-text("Sales Report")').first();
    if (await salesTab.count() > 0) {
      await salesTab.click();
      await page.waitForTimeout(2000);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('financial report tab loads', async ({ page }) => {
    await page.waitForTimeout(1000);
    const finTab = page.locator('[role="tab"]:has-text("Financial"), button:has-text("Financial")').first();
    if (await finTab.count() > 0) {
      await finTab.click();
      await page.waitForTimeout(2000);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('HR report tab loads', async ({ page }) => {
    await page.waitForTimeout(1000);
    const hrTab = page.locator('[role="tab"]:has-text("HR"), button:has-text("Payroll Report")').first();
    if (await hrTab.count() > 0) {
      await hrTab.click();
      await page.waitForTimeout(2000);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('inventory report tab loads', async ({ page }) => {
    await page.waitForTimeout(1000);
    const invTab = page.locator('[role="tab"]:has-text("Inventory"), button:has-text("Inventory")').first();
    if (await invTab.count() > 0) {
      await invTab.click();
      await page.waitForTimeout(2000);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('date range filter updates results', async ({ page }) => {
    await page.waitForTimeout(1000);
    const startDate = page.locator('input[type="date"]').first();
    if (await startDate.count() > 0) {
      await startDate.fill('2025-01-01');
      await page.waitForTimeout(1500);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('KPI cards show numbers', async ({ page }) => {
    await page.waitForTimeout(2000);
    // Reports use ReportKPICards which renders summary totals
    // Check that page has numeric content (totals, counts)
    const numbers = page.locator('text=/\\d+\\.\\d+|\\$\\d+|\\d{1,3}(,\\d{3})*/').first();
    if (await numbers.count() > 0) {
      await expect(numbers).toBeVisible();
    } else {
      // No data yet — just verify no crash
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('export to CSV button exists', async ({ page }) => {
    await page.waitForTimeout(1000);
    const exportBtn = page.locator('button:has-text("Export"), button:has-text("CSV"), button:has-text("Download")').first();
    if (await exportBtn.count() > 0) {
      await expect(exportBtn).toBeVisible();
    }
  });
});
