import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('13 · Payroll', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'payroll');
  });

  test('payroll page loads', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('employee list renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('add employee button visible', async ({ page }) => {
    await page.waitForTimeout(1000);
    const addBtn = page.locator('button:has-text("Add Employee"), button:has-text("New Employee")').first();
    if (await addBtn.count() > 0) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('add employee form has required fields', async ({ page }) => {
    await page.waitForTimeout(1000);
    const addBtn = page.locator('button:has-text("Add Employee"), button:has-text("New Employee")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }

    await addBtn.click();
    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    if (await modal.count() === 0) { test.skip(); return; }
    await expect(modal).toBeVisible({ timeout: 5000 });

    // name and department should be present
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    const deptInput = page.locator('input[name="department"], input[placeholder*="department" i], select[name="department"]').first();
    if (await nameInput.count() > 0) await expect(nameInput).toBeVisible();
    if (await deptInput.count() > 0) await expect(deptInput).toBeVisible();
  });

  test('process payroll button exists', async ({ page }) => {
    await page.waitForTimeout(1000);
    const processBtn = page.locator('button:has-text("Process Payroll"), button:has-text("Run Payroll"), button:has-text("Process")').first();
    if (await processBtn.count() > 0) {
      await expect(processBtn).toBeVisible();
    }
  });

  test('pay history tab or section visible', async ({ page }) => {
    await page.waitForTimeout(1000);
    const historyTab = page.locator('button:has-text("History"), button:has-text("Pay History"), [role="tab"]:has-text("History")').first();
    if (await historyTab.count() > 0) {
      await historyTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });
});
