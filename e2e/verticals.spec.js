/**
 * verticals.spec.js — the vertical axis actually gates a route.
 *
 * AppLayout has always HIDDEN nav items whose vertical module is off. Hiding a
 * link is not blocking a page: every one of those routes stayed reachable by
 * typing the URL, because ProtectedRoute only ever consulted the PLAN axis.
 *
 * The mock tenant is the perfect case for this. It carries no `business_type`,
 * so it normalises to RETAIL, and it is on ENTERPRISE — which means the plan
 * allows `kds` while RETAIL has the `kot` toggle off. Before this change that
 * combination opened the Kitchen Display in a hardware shop.
 *
 * All Supabase calls are mocked; auth.setup.js runs first.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

test.use({ storageState: AUTH_FILE });

async function gotoTenant(page, route) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.goto(`/${TENANT_SLUG}/${route}`);
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin') && !document.querySelector('[data-testid="global-loading"]'),
    { timeout: 15_000 }
  );
}

test.describe('vertical module gating', () => {
  test('a module the vertical has OFF does not open by URL', async ({ page }) => {
    // RETAIL has kot:false. The plan (ENTERPRISE) does allow kds, so if this
    // renders the kitchen screen the gate is not the plan gate — it is missing.
    await gotoTenant(page, 'kds');
    await expect(page.getByText('Module turned off')).toBeVisible({ timeout: 15_000 });
    // And it must NOT be mistaken for a billing problem.
    await expect(page.getByText('Upgrade Required')).toHaveCount(0);
  });

  test('the block explains itself and points at the fix', async ({ page }) => {
    await gotoTenant(page, 'kds');
    // A dead end that does not say who can undo it is a support ticket.
    await expect(page.getByText(/Business type/i).first()).toBeVisible();
    await expect(page.getByText(/switch it back on/i)).toBeVisible();
  });

  test('appointments is off for a retail shop', async ({ page }) => {
    // RETAIL has appointments:false while ENTERPRISE allows the module.
    await gotoTenant(page, 'appointments');
    await expect(page.getByText('Module turned off')).toBeVisible({ timeout: 15_000 });
  });

  test('a module the vertical has ON still opens', async ({ page }) => {
    // The control. If this also blocked, the gate would be indiscriminate and
    // the two tests above would prove nothing.
    await gotoTenant(page, 'inventory');
    await expect(page.getByText('Module turned off')).toHaveCount(0);
  });

  test('a spine route is never gated', async ({ page }) => {
    // Dashboard is not in DEFAULT_MODULES at all. isModuleEnabled returns TRUE
    // for unknown keys precisely so the spine cannot be switched off; if that
    // default ever flips, this is what catches it.
    await gotoTenant(page, 'dashboard');
    await expect(page.getByText('Module turned off')).toHaveCount(0);
  });
});

test.describe('sector field packs', () => {
  const SUPABASE = (process.env.VITE_SUPABASE_URL || '').trim();

  /** Re-answer the tenants fixture with a pack switched on. */
  async function withPack(page, pack) {
    // Registered AFTER setupMocks, and Playwright runs the most recent
    // matching handler first, so this wins without touching the shared
    // fixture every other spec depends on.
    await page.route(`${SUPABASE}/rest/v1/tenants*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: '00000000-0000-0000-0000-000000000099',
          name: 'Test Co', slug: TENANT_SLUG,
          plan: 'ENTERPRISE', plan_tier: 'ENTERPRISE', status: 'ACTIVE',
          modules: { [pack]: true },
        }]),
      });
    });
  }

  async function openAddItem(page) {
    await page.goto(`/${TENANT_SLUG}/inventory`);
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 15_000 }
    );
    await page.locator('button').filter({ hasText: /add item|add product|new item/i }).first().click();
  }

  test('pack fields are HIDDEN when the pack is off', async ({ page }) => {
    // The default. A shop that does not sell parts is never asked for a part
    // number -- which is the whole reason packs default to off.
    await seedAppCache(page);
    await setupMocks(page);
    await openAddItem(page);
    await expect(page.getByText('Part number')).toHaveCount(0);
    await expect(page.getByText('Catalog details')).toHaveCount(0);
  });

  test('pack fields APPEAR when the pack is switched on', async ({ page }) => {
    await seedAppCache(page);
    await setupMocks(page);
    await withPack(page, 'automotive');
    await openAddItem(page);
    // Rendered from the registry, not from JSX written per field.
    await expect(page.getByText('Catalog details')).toBeVisible({ timeout: 10_000 });
    for (const label of ['Part number', 'OEM / cross-ref', 'Fits', 'Warranty']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });
});
