import { Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const TEST_EMAIL = 'uvaize@hotmail.com';
export const TEST_PASSWORD = 'Aishu@145725';

/**
 * Read the tenant slug saved by global.setup.ts.
 * Returns empty string if not available.
 */
export function getSavedSlug(): string {
  try {
    const slugFile = path.join('playwright/.auth', 'slug.json');
    if (fs.existsSync(slugFile)) {
      const data = JSON.parse(fs.readFileSync(slugFile, 'utf-8'));
      return data.slug || '';
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Log in and return the tenant slug.
 * Tries the saved slug first; falls back to extracting from current URL.
 * Most tests should use the storageState (set in playwright.config.ts) and call
 * getSavedSlug() instead of this function to avoid repeated Supabase logins.
 */
export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD): Promise<string> {
  // If already authenticated via storageState, just navigate to / and get the slug
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const currentUrl = page.url();

  // If still on login page, perform actual login
  if (currentUrl.includes('/login')) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 25000 });
  }

  // Try the saved slug first (fastest)
  const savedSlug = getSavedSlug();
  if (savedSlug) return savedSlug;

  // Extract from current URL
  const afterUrl = page.url();
  if (afterUrl.includes('/nexus-hq')) {
    await page.waitForTimeout(3000);
    const slugCode = page.locator('code').first();
    if (await slugCode.count() > 0) {
      const text = await slugCode.textContent();
      if (text && text.startsWith('/')) return text.replace(/^\//, '').trim();
    }
    return '';
  }

  const match = afterUrl.match(/\/([^/]+)\/dashboard/);
  return match ? match[1] : '';
}

/**
 * Navigate to a tenant module.
 */
export async function goTo(page: Page, slug: string, module: string) {
  await page.goto(`/${slug}/${module}`);
  await page.waitForLoadState('networkidle');
}
