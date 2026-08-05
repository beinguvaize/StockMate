import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_EMAIL, TEST_PASSWORD, TEST_TENANT_SLUG, PROTECTED_SLUGS } from './helpers/auth';

const authFile = 'playwright/.auth/user.json';

setup('authenticate and save session', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30000 });

  const currentUrl = page.url();
  let tenantSlug = '';

  if (currentUrl.includes('/nexus-hq')) {
    // GLOBAL_ADMIN lands here. Pick the tenant we were told to use rather than
    // whichever happens to render first -- that was a live customer, and these
    // tests write.
    await page.waitForTimeout(4000);

    const slugCodes = page.locator('code');
    const count = await slugCodes.count();
    const seen: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await slugCodes.nth(i).textContent();
      if (text && text.startsWith('/') && text.length > 1) {
        const slug = text.replace(/^\//, '').trim();
        seen.push(slug);
        if (slug === TEST_TENANT_SLUG) tenantSlug = slug;
      }
    }

    if (!tenantSlug) {
      throw new Error(
        `Tenant "${TEST_TENANT_SLUG}" was not found in the admin panel. ` +
        `Available: ${seen.join(', ') || '(none)'}. ` +
        `Set E2E_TENANT_SLUG to one of these. Refusing to fall back to an ` +
        `arbitrary tenant, because these tests write data.`
      );
    }
  } else {
    const match = currentUrl.match(/\/([^/]+)\/dashboard/);
    tenantSlug = match ? match[1] : '';
  }

  // Last line of defence. A typo, a stale .env or a changed default must not be
  // able to point a writing test suite at a real business's books.
  if (PROTECTED_SLUGS.includes(tenantSlug)) {
    throw new Error(
      `Refusing to run against "${tenantSlug}": it is a live tenant and this ` +
      `suite creates and modifies records. Use demo-kirana-store.`
    );
  }

  console.log('Global setup — tenant slug found:', tenantSlug);

  // Save the slug to a JSON file so tests can read it
  const slugFile = path.join('playwright/.auth', 'slug.json');
  fs.writeFileSync(slugFile, JSON.stringify({ slug: tenantSlug }));

  // Save the auth session (localStorage/cookies)
  await page.context().storageState({ path: authFile });
  console.log('Auth session saved to', authFile);
});
