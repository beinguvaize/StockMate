import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

const AMBER_TEXT = 'rgb(171, 79, 8)';   // #AB4F08 -- amber that passes 4.5:1
const AMBER_FILL = 'rgb(217, 119, 6)';  // #D97706 -- the brand value, fills only

async function open(page, route) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${TENANT_SLUG}/${route}`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
}

test('amber text on a light surface is the value that passes contrast', async ({ page }) => {
  // #D97706 needs 4.5:1 as text and has never had it: 3.19:1 on a card, 2.92:1
  // on the ground, 2.64:1 on its own amber/10 chip. Every one of these is on a
  // light surface, so every one of them must be the darker amber.
  await open(page, 'dashboard');
  const swatches = await page.locator('.text-accent-signature').evaluateAll(
    els => els.filter(el => !el.closest('.bg-ink-primary')).map(el => getComputedStyle(el).color)
  );
  expect(swatches.length).toBeGreaterThan(0);
  expect([...new Set(swatches)]).toEqual([AMBER_TEXT]);
});

test('black panels keep deciding their own text colour', async ({ page }) => {
  // On #111111 the relationship inverts -- #D97706 measures 5.93:1 and the
  // darker amber only 3.76:1 -- so the fix must not reach inside a black panel.
  // The .bg-ink-primary rules are more specific and still win, both ways round.
  await open(page, 'dashboard');
  const cascade = await page.evaluate(() => {
    const mk = (cls, parentCls) => {
      const host = document.createElement('div');
      if (parentCls) host.className = parentCls;
      const el = document.createElement('span');
      el.className = cls;
      host.appendChild(el);
      document.body.appendChild(host);
      const c = getComputedStyle(el).color;
      host.remove();
      return c;
    };
    return {
      plain: mk('text-accent-signature'),
      sameElement: mk('bg-ink-primary text-accent-signature'),
      descendant: mk('text-accent-signature', 'bg-ink-primary'),
    };
  });

  expect(cascade.plain).toBe(AMBER_TEXT);
  expect(cascade.descendant).toBe(AMBER_FILL);
  // Both classes on ONE element resolves to white, and did before this change
  // too: `[data-theme="white"] .bg-ink-primary` is unlayered and beats the
  // utility. So the ~10 dark buttons written as `bg-ink-primary
  // text-accent-signature` have never rendered amber. Pinned as it is rather
  // than quietly repainted -- that is a design call, not a contrast fix.
  expect(cascade.sameElement).toBe('rgb(255, 255, 255)');
});
