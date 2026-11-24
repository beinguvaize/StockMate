import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

async function openCartWithOneLine(page) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('nav_rail_collapsed', '1'); localStorage.setItem('nav_rail_epoch', '2'); } catch { /* ignore */ }
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${TENANT_SLUG}/sales`);
  await page.getByPlaceholder(/Search by name/).waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(500);
  // first product in the list, into the cart
  await page.locator('button[aria-label="Add to cart"], .group button').first().click().catch(() => {});
  const plus = page.getByRole('button', { name: 'One more' });
  if (await plus.count() === 0) {
    // the list's own + button, whichever shape it has
    await page.locator('aside, div').filter({ hasText: /stk/ }).locator('button').first().click();
  }
  await expect(page.getByRole('button', { name: 'One more' }).first()).toBeVisible({ timeout: 10_000 });
}

test('the quantity box brings no browser spinners with it', async ({ page }) => {
  // It was <input type="number">, so the browser drew its own stepper inside
  // the control -- about four pixels tall, mouse only, next to a stepper that
  // already existed. On the touchscreen this runs on it was unreachable.
  await openCartWithOneLine(page);

  const qty = page.getByRole('textbox', { name: /Quantity/ }).first();
  await expect(qty).toBeVisible();
  expect(await qty.getAttribute('type')).toBe('text');
  expect(await qty.getAttribute('inputMode')).toMatch(/numeric|decimal/);
});

test('the steppers are big enough to hit', async ({ page }) => {
  // 20x20 with a 9px glyph. WCAG 2.5.8 puts the floor at 24x24, and this is a
  // control pressed a few hundred times a day.
  await openCartWithOneLine(page);

  for (const name of ['One less', 'One more']) {
    const box = await page.getByRole('button', { name }).first().boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
});

test('clearing the box does not delete the line', async ({ page }) => {
  // The field wrote through on every keystroke and 0 removed the line, so
  // select-and-retype -- the ordinary way to change a quantity -- could vanish
  // it mid-edit. The value is a draft until blur or Enter.
  await openCartWithOneLine(page);

  const qty = page.getByRole('textbox', { name: /Quantity/ }).first();
  const before = await qty.inputValue();

  await qty.click();
  await qty.press('ControlOrMeta+a');
  await qty.press('Backspace');
  // empty box, still focused — the line must still be there
  await expect(qty).toBeVisible();
  await qty.blur();
  // and an empty commit puts back what was there rather than acting on blank
  await expect(qty).toHaveValue(before);
});

test('typing a quantity replaces it in one gesture', async ({ page }) => {
  await openCartWithOneLine(page);

  const qty = page.getByRole('textbox', { name: /Quantity/ }).first();
  await qty.click();            // focus selects the whole value
  await qty.type('12');
  await qty.press('Enter');
  await expect(qty).toHaveValue('12');
});
