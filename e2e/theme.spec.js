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

test('keyboard focus is visible even where outline-none was written', async ({ page }) => {
  // 320 elements carry `outline-none` and nothing replaced it, so tabbing moved
  // an invisible cursor. The global rule is unlayered, which is what lets it
  // win without touching any of those 320 call sites -- so the thing worth
  // pinning is precisely that it beats the utility.
  await open(page, 'expenses');
  const ring = await page.evaluate(() => {
    const b = document.createElement('button');
    b.className = 'outline-none px-4 py-2';
    document.body.appendChild(b);
    b.focus({ focusVisible: true });
    const cs = getComputedStyle(b);
    const out = { w: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, offset: cs.outlineOffset };
    b.remove();
    return out;
  });
  expect(ring).toEqual({
    w: '2px', style: 'solid', color: 'rgb(17, 17, 17)', offset: '2px',
  });
});

test('the focus ring is visible on a dark background too', async ({ page }) => {
  // An ink ring measured 1.04:1 against the login page's dark panel -- drawn,
  // and invisible. Where 3:1 is the minimum. So there are two rings: white
  // fills the offset gap and carries the dark grounds, ink sits outside it and
  // carries the light ones. This pins the white one, which is the half that is
  // easy to lose because it does nothing on the screens you look at most.
  await open(page, 'expenses');
  const shadow = await page.evaluate(() => {
    const b = document.createElement('button');
    b.className = 'outline-none px-4 py-2';
    document.body.appendChild(b);
    b.focus({ focusVisible: true });
    const s = getComputedStyle(b).boxShadow;
    b.remove();
    return s;
  });
  expect(shadow).toContain('rgb(255, 255, 255)');
  expect(shadow).toContain('2px');
});

test('a mouse click leaves no ring behind', async ({ page }) => {
  // :focus-visible, not :focus -- otherwise every click would leave an outline
  // sitting on the button until you clicked elsewhere.
  await open(page, 'expenses');
  const ring = await page.evaluate(() => {
    const b = document.createElement('button');
    b.className = 'outline-none px-4 py-2';
    document.body.appendChild(b);
    b.focus({ focusVisible: false });
    const w = getComputedStyle(b).outlineWidth;
    b.remove();
    return w;
  });
  expect(ring).not.toBe('2px');
});
