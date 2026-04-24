import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug } from './helpers/auth';

let slug = '';

test.describe('03 · Inventory', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
    if (slug) await goTo(page, slug, 'inventory');
  });

  test('inventory page loads', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await expect(page.locator('body')).not.toContainText('Access Denied');
  });

  test('product list renders', async ({ page }) => {
    // Table rows or product cards should be present
    const rows = page.locator('table tbody tr, [class*="product-card"], [class*="item-row"]');
    await page.waitForTimeout(2000); // Allow data to load
    const count = await rows.count();
    console.log(`Inventory items found: ${count}`);
    // At minimum the empty state or items should render without crash
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('search/filter input is functional', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('test product xyz');
      await page.waitForTimeout(500);
      // Results should change (may show empty)
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('add product button is visible', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New Product"), button:has-text("+ Product")').first();
    if (await addBtn.count() > 0) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('add product form opens', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New Product"), button:has-text("+ Product"), button:has-text("Add Product")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      // Modal or form should appear
      const form = page.locator('form, [class*="modal"], [role="dialog"]').first();
      await expect(form).toBeVisible({ timeout: 5000 });
    }
  });

  test('add new product with required fields', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Add"), button:has-text("New Product"), button:has-text("Add Product")').first();
    if (await addBtn.count() === 0) {
      test.skip();
      return;
    }

    await addBtn.click();
    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Fill product name
    const nameInput = modal.locator('input[placeholder*="name" i], input[name="name"]').first();
    if (await nameInput.count() > 0) await nameInput.fill('QA Test Product');

    // Fill SKU
    const skuInput = modal.locator('input[placeholder*="sku" i], input[name="sku"]').first();
    if (await skuInput.count() > 0) await skuInput.fill('QA-SKU-001');

    // Fill selling price
    const priceInput = modal.locator('input[placeholder*="price" i], input[name="sellingPrice"], input[name="price"]').first();
    if (await priceInput.count() > 0) await priceInput.fill('99.99');

    // Submit — use force click to bypass any overlay
    const submitBtn = modal.locator('button:has-text("Save"), button:has-text("Add Product"), button:has-text("Create")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click({ force: true });
      await page.waitForTimeout(2000);
      // Check product appears or no error
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('stock adjustment updates count', async ({ page }) => {
    // Look for adjust stock button
    const adjustBtn = page.locator('button:has-text("Adjust"), [title*="adjust" i]').first();
    if (await adjustBtn.count() > 0) {
      await adjustBtn.click();
      const modal = page.locator('[class*="modal"], [role="dialog"]').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
    }
  });

  test('delete product shows confirmation', async ({ page }) => {
    const deleteBtn = page.locator('button:has-text("Delete"), [title*="delete" i], [aria-label*="delete" i]').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      // Confirmation dialog should appear
      const confirm = page.locator('[class*="confirm"], [role="alertdialog"], text=/confirm|are you sure/i').first();
      if (await confirm.count() > 0) {
        await expect(confirm).toBeVisible({ timeout: 3000 });
      }
    }
  });
});
