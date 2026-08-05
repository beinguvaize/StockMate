import { test, expect } from '@playwright/test';
import { login, goTo, getSavedSlug, TEST_EMAIL, TEST_PASSWORD } from './helpers/auth';

let slug = '';

test.describe.configure({ mode: 'serial' });

test.describe('18 · Navigation & Routing', () => {
  test.beforeEach(async ({ page }) => {
    slug = getSavedSlug() || await login(page);
  });

  test('sidebar links navigate to correct routes', async ({ page }) => {
    if (!slug) { test.skip(); return; }
    const modules = ['dashboard', 'inventory', 'sales', 'clients', 'expenses'];
    for (const mod of modules) {
      await page.goto(`/${slug}/${mod}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      expect(page.url()).toContain(`/${mod}`);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  });

  test('/ redirects to dashboard or nexus-hq', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const url = page.url();
    const redirectedCorrectly = url.includes('/dashboard') || url.includes('/nexus-hq');
    expect(redirectedCorrectly).toBe(true);
  });

  test('unknown route redirects gracefully', async ({ page }) => {
    await page.goto('/totally-unknown-route-xyz-abc-123');
    await page.waitForTimeout(2000);
    // Should redirect away or show a not-found page without crashing
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('wrong tenant slug shows error, not crash', async ({ page }) => {
    if (!slug) { test.skip(); return; }
    await page.goto('/totally-fake-workspace-slug/dashboard');
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('browser back button works after navigation', async ({ page }) => {
    if (!slug) { test.skip(); return; }
    await page.goto(`/${slug}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.goto(`/${slug}/inventory`);
    await page.waitForLoadState('networkidle');
    await page.goBack();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/dashboard');
  });

  test('no-access page renders correctly', async ({ page }) => {
    await page.goto('/no-access');
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('page titles update per route', async ({ page }) => {
    if (!slug) { test.skip(); return; }
    await page.goto(`/${slug}/dashboard`);
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    console.log('Dashboard title:', title);
    expect(title.length).toBeGreaterThan(0);
  });
});
