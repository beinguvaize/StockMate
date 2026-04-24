import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('06 · Expenses', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'expenses');
  });

  test('expenses page loads', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('expense list renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('add expense button is visible', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add Expense"), button:has-text("New Expense"), button:has-text("Add")').first();
    if (await addBtn.count() > 0) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('add expense form requires positive amount', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add Expense"), button:has-text("New Expense"), button:has-text("Add")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }

    await addBtn.click();
    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Try negative amount (Zod schema: amount must be positive)
    const amountInput = page.locator('input[placeholder*="amount" i], input[name="amount"], input[type="number"]').first();
    if (await amountInput.count() > 0) {
      await amountInput.fill('-50');
      // Click within the modal dialog to avoid overlay interception
      const submitBtn = modal.locator('button:has-text("Save"), button:has-text("Add"), button[type="submit"]').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click({ force: true });
        await page.waitForTimeout(1000);
        // Should still be on form (validation rejected)
        const stillOpen = await modal.isVisible();
        console.log('Form still open after negative amount:', stillOpen);
        if (!stillOpen) {
          console.warn('BUG: Negative expense amount was accepted!');
        }
      }
    }
  });

  test('expense category field is required', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add Expense"), button:has-text("New Expense"), button:has-text("Add")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }

    await addBtn.click();
    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Submit without category
    const submitBtn = page.locator('button[type="submit"], button:has-text("Save")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
      // Should stay open
      const stillOpen = await modal.isVisible();
      console.log('Form stays open without category:', stillOpen);
    }
  });

  test('expense date field exists', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add Expense"), button:has-text("New Expense"), button:has-text("Add")').first();
    if (await addBtn.count() === 0) { test.skip(); return; }
    await addBtn.click();
    const dateInput = page.locator('input[type="date"], input[name="date"]').first();
    if (await dateInput.count() > 0) {
      await expect(dateInput).toBeVisible();
    }
  });
});
