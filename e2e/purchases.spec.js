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

test('every row has the same shape: bill, paid, outstanding', async ({ page }) => {
  // The column this replaced held a payment method on settled rows and an
  // amount on unpaid ones, plus a bar on some of them -- three kinds of thing
  // in one column, which is what stops a table being scannable. Now each money
  // column holds one kind of value in every row.
  await openPurchases(page);

  const settled = page.locator('tr', { hasText: '₹13,800.00' }).first();
  await expect(settled).toBeVisible();
  // settled: billed, nothing outstanding — a dash, not a zero
  await expect(settled).toContainText('—');
  await expect(settled).not.toContainText('Settled');
  // no meter anywhere on the row
  expect(await settled.locator('div[style*="width:"]').count()).toBe(0);

  // and the terms moved to the supplier line, out of the money columns
  await expect(settled).toContainText(/Cash|Credit/i);
});

test('an unpaid bill reads across: billed, paid, still owed', async ({ page }) => {
  await openPurchases(page);

  // 32,320 billed − 12,000 paid = 20,320 outstanding, as three plain figures
  const row = page.locator('tr', { hasText: '₹32,320.00' }).first();
  await expect(row).toContainText('₹32,320.00');
  await expect(row).toContainText('₹12,000.00');
  await expect(row).toContainText('₹20,320.00');
  // no bar: the two numbers say the proportion more precisely than a bar does
  expect(await row.locator('div[style*="width:"]').count()).toBe(0);
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

test('an opened bill keeps its lines under the same columns', async ({ page }) => {
  // The bill row has seven cells. Its lines had six, so opening a bill shifted
  // every cell after the first money column one to the left: the line's amount
  // landed under Outstanding and its status under Amount. Nothing in the
  // fixtures was a multi-line bill, so no test saw it.
  await openPurchases(page);

  // 11,000 + 6,250 grouped into one bill. Matching the total rather than the
  // supplier: every fixture shares one supplier id, so the name is not unique.
  const billRow = page.locator('tr', { hasText: '₹17,250.00' }).first();
  await expect(billRow).toBeVisible();
  const cellsInBillRow = await billRow.locator('td').count();

  await billRow.click();
  await page.waitForTimeout(400);

  // the child rows are siblings in the same table
  const lineRows = page.locator('tr', { hasText: /in 2|×/ });
  const childRow = page.locator('tr').filter({ hasText: '₹6,250.00' }).first();
  await expect(childRow).toBeVisible();
  expect(await childRow.locator('td').count()).toBe(cellsInBillRow);

  // and the money actually lands under the money headers: compare the x of the
  // line's Bill figure with the bill's Bill figure
  const align = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')];
    const bill = rows.find(r => /17,250/.test(r.textContent));
    const line = rows.find(r => /6,250/.test(r.textContent));
    if (!bill || !line) return null;
    const bx = [...bill.querySelectorAll('td')].map(td => Math.round(td.getBoundingClientRect().left));
    const lx = [...line.querySelectorAll('td')].map(td => Math.round(td.getBoundingClientRect().left));
    return { bx, lx, same: JSON.stringify(bx) === JSON.stringify(lx) };
  });
  expect(align).not.toBeNull();
  expect(align.same).toBe(true);
});
