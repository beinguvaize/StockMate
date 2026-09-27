import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

async function openPurchases(page) {
  await seedAppCache(page);
  await setupMocks(page);
  // The rail costs 248px, and the list drops to its card layout below a width
  // the table needs. Collapse it so these assertions are about the table.
  await page.addInitScript(() => {
    try { localStorage.setItem('nav_rail_collapsed', '1'); localStorage.setItem('nav_rail_epoch', '2'); } catch { /* ignore */ }
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${TENANT_SLUG}/purchases`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
  await page.waitForTimeout(900);
}

test('a settled bill spends no ink on saying so', async ({ page }) => {
  // It used to carry a full-width meter at 100%, the word "Settled" in green,
  // the payment method and a green status pill -- the same fact four times, on
  // the rows that need nothing from you. The six that DID need attention had
  // partly-empty meters and so read as quieter.
  await openPurchases(page);

  const settled = page.locator('tr', { hasText: '₹13,800.00' }).first();
  await expect(settled).toBeVisible();

  // No meter at all on a settled row.
  expect(await settled.locator('div[style*="width: 100%"]').count()).toBe(0);
  await expect(settled).not.toContainText('Settled');
  // It still says how it was paid.
  await expect(settled).toContainText('CASH');
});

test('an unpaid bill leads with what is owed', async ({ page }) => {
  await openPurchases(page);

  // 32,320 billed, 12,000 paid → 20,320 outstanding, and that is the figure
  // the row leads with rather than burying it under a meter.
  const partPaid = page.locator('tr', { hasText: '₹32,320.00' }).first();
  await expect(partPaid).toContainText('₹20,320.00');
  await expect(partPaid).toContainText('₹12,000.00 paid');

  // The meter survives only where a proportion means something.
  expect(await partPaid.locator('div[style*="width:"]').count()).toBeGreaterThan(0);
});

test('an overdue bill says how late it is', async ({ page }) => {
  await openPurchases(page);
  const overdue = page.locator('tr', { hasText: '₹9,300.00' }).first();
  await expect(overdue).toContainText(/\d+d overdue/);
});

test('money owed passes contrast where it is drawn', async ({ page }) => {
  await openPurchases(page);

  // Use the locator that the other assertions already rely on, rather than
  // re-finding the node by hand inside evaluate -- a hand-rolled selector that
  // misses reports "no element" and a test that skips is not a test.
  const due = page.locator('tr', { hasText: '₹32,320.00' })
    .locator('span', { hasText: '₹20,320.00' }).first();
  await expect(due).toBeVisible();

  const ratio = await due.evaluate((el) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const ctx = cv.getContext('2d');
    const rgba = (c) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.clearRect(0,0,1,1); ctx.fillRect(0,0,1,1);
      const d = ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]; };
    const lin = (c) => { c/=255; return c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
    const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
    let n = el, bg = [255,255,255];
    while (n && n !== document.documentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] === 1) { bg = c; break; }
      n = n.parentElement;
    }
    const fg = rgba(getComputedStyle(el).color);
    const [hi, lo] = [L(fg), L(bg)].sort((a,b) => b-a);
    return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
  });

  console.log('outstanding figure contrast: ' + ratio + ':1');
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('the toolbar shows two filters, not nine', async ({ page }) => {
  // Nine controls sat permanently above a list most people open to scan.
  // Search and Unpaid stay; the other five fold behind one button.
  await openPurchases(page);

  const bar = page.locator('div').filter({ has: page.getByPlaceholder(/Search product/) }).last();
  expect(await bar.locator('select:visible').count()).toBe(0);

  await page.getByRole('button', { name: /Filters/ }).click();
  expect(await page.locator('select:visible').count()).toBeGreaterThanOrEqual(5);
});

test('a folded filter still announces itself', async ({ page }) => {
  // Hiding the controls must never hide their EFFECT: a filtered list that
  // looks unfiltered is how someone concludes their data has gone missing.
  await openPurchases(page);
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.locator('select').filter({ hasText: 'All payment' }).selectOption('CREDIT');
  await page.waitForTimeout(300);

  // the count rides on the button, which stays visible when the panel closes
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('button', { name: /Filters/ })).toContainText('1');
});
