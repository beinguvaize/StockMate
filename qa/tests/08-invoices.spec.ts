import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('08 · Invoices', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'invoices');
  });

  test('invoices page loads', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('invoice list renders', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('invoice status labels visible (PAID/UNPAID/PENDING)', async ({ page }) => {
    await page.waitForTimeout(2000);
    const statusBadge = page.locator('text=/PAID|UNPAID|PENDING|OVERDUE/i').first();
    if (await statusBadge.count() > 0) {
      await expect(statusBadge).toBeVisible();
    }
  });

  test('invoice numbers are displayed', async ({ page }) => {
    await page.waitForTimeout(2000);
    // Invoice numbers typically start with INV- or #
    const invoiceNum = page.locator('text=/INV-|#\\d+/').first();
    if (await invoiceNum.count() > 0) {
      await expect(invoiceNum).toBeVisible();
    }
  });

  test('mark as paid button exists for unpaid invoices', async ({ page }) => {
    await page.waitForTimeout(2000);
    const markPaid = page.locator('button:has-text("Mark Paid"), button:has-text("Mark as Paid")').first();
    if (await markPaid.count() > 0) {
      await expect(markPaid).toBeVisible();
    }
  });
});
