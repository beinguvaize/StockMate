/**
 * staff.setup.js — runs once before the staff-authenticated tests.
 *
 * Performs a real login (with mocked Supabase network mimicking a STAFF user)
 * and saves the browser storage state to e2e/.auth/staff.json.
 */

import { test as setup, expect } from '@playwright/test';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STAFF_AUTH_FILE = path.join(__dirname, '.auth/staff.json');

setup('authenticate and save staff storage state', async ({ page }) => {
  const isStaff = true;
  await seedAppCache(page, isStaff);
  await setupMocks(page, isStaff);

  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  await page.locator('input[type="email"]').fill('staff@test.com', { timeout: 15_000 });
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(`**/${TENANT_SLUG}/dashboard`, { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/${TENANT_SLUG}/dashboard`));

  // Persist cookies + localStorage so other tests can skip login
  await page.context().storageState({ path: STAFF_AUTH_FILE });
});
