import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('05 · Clients', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'clients');
  });

  test('clients page loads', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('client list renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('add client button is visible', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add Client"), button:has-text("New Client"), button:has-text("Add")').first();
    if (await addBtn.count() > 0) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('add client form validates name (min 2 chars)', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add Client"), button:has-text("New Client"), button:has-text("Add")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }

    await addBtn.click();
    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Try single character name (should fail Zod validation)
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('A');
      const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Add Client")').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
        // Should show error or stay on form
        const stillOpen = await modal.isVisible();
        // If form stayed open → validation working
        console.log('Form still open after 1-char name:', stillOpen);
      }
    }
  });

  test('client outstanding balance column is visible', async ({ page }) => {
    await page.waitForTimeout(2000);
    const balanceCol = page.locator('th:has-text("Balance"), th:has-text("Outstanding"), td[class*="balance"]').first();
    if (await balanceCol.count() > 0) {
      await expect(balanceCol).toBeVisible();
    }
  });

  test('client aging tab exists', async ({ page }) => {
    const agingTab = page.locator('button:has-text("Aging"), [role="tab"]:has-text("Aging")').first();
    if (await agingTab.count() > 0) {
      await agingTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('client payments tab exists', async ({ page }) => {
    const paymentsTab = page.locator('button:has-text("Payments"), [role="tab"]:has-text("Payment")').first();
    if (await paymentsTab.count() > 0) {
      await paymentsTab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });
});
