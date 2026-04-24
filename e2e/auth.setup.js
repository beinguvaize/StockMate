/**
 * auth.setup.js — runs once before the authenticated smoke tests.
 *
 * Performs a real login (with mocked Supabase network) and saves the
 * resulting browser storage state to e2e/.auth/user.json.  The authenticated
 * tests then load that file via `test.use({ storageState })`, skipping login.
 */

import { test as setup, expect } from '@playwright/test';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('authenticate and save storage state', async ({ page }) => {
  await seedAppCache(page); // seed cache BEFORE page loads
  await setupMocks(page);

  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  await page.locator('input[type="email"]').fill('owner@test.com', { timeout: 15_000 });
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(`**/${TENANT_SLUG}/dashboard`, { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/${TENANT_SLUG}/dashboard`));

  // Persist cookies + localStorage so other tests can skip login
  await page.context().storageState({ path: AUTH_FILE });
});
