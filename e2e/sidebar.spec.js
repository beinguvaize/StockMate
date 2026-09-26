import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

test('the sidebar replaces the top nav and collapses', async ({ page }) => {
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });

  const rail = page.locator('aside').first();
  await expect(rail).toBeVisible();

  // Everything the More menu used to hide is now on screen under a heading.
  await expect(page.getByText('Books', { exact: true })).toBeVisible();
  for (const label of ['Dashboard', 'Sales', 'Invoices', 'Day Book', 'Reports', 'Settings']) {
    await expect(rail.getByText(label, { exact: true })).toBeVisible();
  }
  // And the More control is gone entirely.
  await expect(page.getByRole('button', { name: /^More$/ })).toHaveCount(0);

  await page.screenshot({ path: 'shot-expanded.png' });

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(350);
  // Collapsed: the labels go, the items stay reachable by their title.
  await expect(rail.getByText('Dashboard', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.screenshot({ path: 'shot-collapsed.png' });
});

test('the phone keeps its drawer and never shows the rail', async ({ page }) => {
  // The rail is desktop-only. A 68px strip of icons on a 390px screen would
  // be a fifth of the width for navigation nobody asked for.
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });

  await expect(page.locator('aside').first()).toBeHidden();
  // The hamburger still opens the drawer that was already there.
  const rail = page.locator('aside').first();
  await expect(rail).not.toBeInViewport();
  await page.screenshot({ path: 'shot-phone.png' });
});

// ── Auto-collapse ──────────────────────────────────────────────────────────
// The rail follows the window until the user presses the toggle, and never
// again afterwards. Both halves matter: a rail that ignored the window would
// eat a third of a small laptop, and one that kept following after a deliberate
// choice would undo that choice on the next resize.

const railWidth = (page) =>
  page.locator('aside').first().evaluate(el => el.getBoundingClientRect().width);

async function openDashboard(page, width) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.addInitScript(() => {
    // No stored answer: this is a user who has never touched the toggle.
    try { localStorage.removeItem('nav_rail_collapsed'); } catch { /* ignore */ }
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
}

test('a narrow window starts the rail collapsed, a wide one does not', async ({ page }) => {
  await openDashboard(page, 1180);
  expect(await railWidth(page)).toBe(68);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(350);
  expect(await railWidth(page)).toBe(248);

  // And back, because nothing has been decided yet.
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.waitForTimeout(350);
  expect(await railWidth(page)).toBe(68);
});

test('pressing the toggle stops the window deciding', async ({ page }) => {
  await openDashboard(page, 1440);
  expect(await railWidth(page)).toBe(248);

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(350);
  expect(await railWidth(page)).toBe(68);

  // Widening would have opened it a moment ago. The choice outranks the width.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(350);
  expect(await railWidth(page)).toBe(68);

  // The choice is also what the next tab loads with.
  expect(await page.evaluate(() => localStorage.getItem('nav_rail_collapsed'))).toBe('1');
});

test('the collapsed rail shows the square mark, not a smeared wordmark', async ({ page }) => {
  await openDashboard(page, 1180);
  const mark = page.locator('aside').first().getByAltText('bookledger');
  await expect(mark).toBeVisible();
  const src = await mark.getAttribute('src');
  expect(src).toContain('mark');
  // It has to actually decode -- a broken path still renders an <img>.
  expect(await mark.evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
});

test('a choice stored before auto-collapse existed is dropped once', async ({ page }) => {
  // Everyone already using the app has pressed that toggle at least once, and
  // every one of those answers was given to a rail with no automatic behaviour
  // to opt out of. Honouring them would have shipped the feature to nobody.
  await seedAppCache(page);
  await setupMocks(page);
  await page.addInitScript(() => {
    try {
      // Once only. An init script runs on every navigation, so seeding the old
      // state unguarded would re-stale it on the reload below and the test
      // would be checking its own fixture rather than the code.
      if (sessionStorage.getItem('seeded_pre_epoch')) return;
      sessionStorage.setItem('seeded_pre_epoch', '1');
      localStorage.setItem('nav_rail_collapsed', '1');  // collapsed on the old build
      localStorage.removeItem('nav_rail_epoch');        // ...before the epoch existed
    } catch { /* ignore */ }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });

  // The width decides again, so a wide window gets the full rail.
  expect(await railWidth(page)).toBe(248);
  expect(await page.evaluate(() => localStorage.getItem('nav_rail_collapsed'))).toBeNull();

  // And it is dropped ONCE -- the next answer sticks.
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(350);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
  expect(await railWidth(page)).toBe(68);
});

// ── Hover peek ─────────────────────────────────────────────────────────────
// A collapsed rail opens under the pointer and shuts again when it leaves.
// The page must not move while that happens: the rail is fixed and the page's
// inset comes from the stored width, so a peek floats over the content rather
// than re-wrapping every table under it.

async function collapsedRail(page) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('nav_rail_collapsed', '1');
      localStorage.setItem('nav_rail_epoch', '2');   // a current, deliberate choice
    } catch { /* ignore */ }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
}

// The padding that holds the page clear of the rail. No fallback: if this
// stops finding the element the test must fail, not quietly compare null to
// null and pass.
const pageInset = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.md\\:pl-\\[68px\\], .md\\:pl-\\[248px\\]');
    if (!el) throw new Error('no element carries the rail inset');
    return parseFloat(getComputedStyle(el).paddingLeft);
  });

test('hovering a collapsed rail opens it, leaving shuts it', async ({ page }) => {
  await collapsedRail(page);
  const rail = page.locator('aside').first();
  expect(await railWidth(page)).toBe(68);
  await expect(rail.getByText('Dashboard', { exact: true })).toHaveCount(0);

  await rail.hover();
  await page.waitForTimeout(300);
  expect(await railWidth(page)).toBe(248);
  await expect(rail.getByText('Dashboard', { exact: true })).toBeVisible();

  // Away again, and it shuts.
  await page.mouse.move(900, 500);
  await page.waitForTimeout(300);
  expect(await railWidth(page)).toBe(68);
});

test('a peek floats over the page instead of reflowing it', async ({ page }) => {
  await collapsedRail(page);
  const rail = page.locator('aside').first();
  const before = await pageInset(page);
  expect(before).toBe(68);   // a real measurement, not a missing one

  await rail.hover();
  await page.waitForTimeout(300);
  expect(await railWidth(page)).toBe(248);
  // The rail is wider, the page has not moved.
  expect(await pageInset(page)).toBe(68);
});

test('a peek is not the same as being expanded', async ({ page }) => {
  // Pressing the toggle while peeked should PIN it open, so the control has to
  // still name the stored state rather than what is on screen.
  await collapsedRail(page);
  const rail = page.locator('aside').first();
  await rail.hover();
  await page.waitForTimeout(300);

  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.waitForTimeout(300);

  // Now pinned: moving the pointer away leaves it open.
  await page.mouse.move(900, 500);
  await page.waitForTimeout(300);
  expect(await railWidth(page)).toBe(248);
  expect(await page.evaluate(() => localStorage.getItem('nav_rail_collapsed'))).toBe('0');
});

// ── The account lives in the rail ──────────────────────────────────────────
// The avatar used to sit at the far right of a header that held nothing else,
// so a 64px band crossed every screen to carry it. The rail holds it now and
// the band is gone on desktop.

test('desktop has no header band, and the account sits in the rail', async ({ page }) => {
  await collapsedRail(page);
  await expect(page.locator('header').first()).toBeHidden();

  const account = page.locator('aside button[aria-haspopup="menu"]');
  await expect(account).toBeVisible();

  await account.click();
  await expect(page.getByRole('link', { name: /Nexus/i }).or(page.getByRole('button', { name: /Log out/i })).first()).toBeVisible();

  // Escape closes it, and so does a click elsewhere.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Log out/i })).toHaveCount(0);
});

test('nothing in the collapsed rail hangs over its edge', async ({ page }) => {
  // The sync pill and its refresh button are wider than 68px and used to spill
  // across the page when the rail was collapsed.
  await collapsedRail(page);
  const overflow = await page.locator('aside').first().evaluate((aside) => {
    const w = aside.getBoundingClientRect().width;
    return [...aside.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > w + 0.5 || r.left < -0.5);
      })
      .map((el) => el.className.toString().slice(0, 50));
  });
  expect(overflow).toEqual([]);
});

test('the phone keeps its header, because it has no rail', async ({ page }) => {
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
  await expect(page.locator('header').first()).toBeVisible();
});
