import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const authFile = 'playwright/.auth/user.json';

setup('authenticate and save session', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').fill('uvaize@hotmail.com');
  await page.locator('input[type="password"]').fill('Aishu@145725');
  await page.locator('button[type="submit"]').click();

  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30000 });

  const currentUrl = page.url();
  let tenantSlug = '';

  if (currentUrl.includes('/nexus-hq')) {
    // GLOBAL_ADMIN lands here — extract first tenant slug from admin panel
    await page.waitForTimeout(4000);

    const slugCodes = page.locator('code');
    const count = await slugCodes.count();
    for (let i = 0; i < count; i++) {
      const text = await slugCodes.nth(i).textContent();
      if (text && text.startsWith('/') && text.length > 1) {
        tenantSlug = text.replace(/^\//, '').trim();
        break;
      }
    }
  } else {
    const match = currentUrl.match(/\/([^/]+)\/dashboard/);
    tenantSlug = match ? match[1] : '';
  }

  console.log('Global setup — tenant slug found:', tenantSlug);

  // Save the slug to a JSON file so tests can read it
  const slugFile = path.join('playwright/.auth', 'slug.json');
  fs.writeFileSync(slugFile, JSON.stringify({ slug: tenantSlug }));

  // Save the auth session (localStorage/cookies)
  await page.context().storageState({ path: authFile });
  console.log('Auth session saved to', authFile);
});
