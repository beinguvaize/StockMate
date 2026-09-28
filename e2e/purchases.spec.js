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
  // Wait for CONTENT, not for a spinner to leave. The loading state here is a
  // skeleton and draws no spinner at all, so the old wait returned on the very
  // first frame and left every assertion racing a fixed 900ms sleep.
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
  await page.getByPlaceholder(/Search product/).waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
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

test('an unpaid bill shows what is owed, and what was paid under it', async ({ page }) => {
  await openPurchases(page);

  // Paid is no longer a column: on 73 of 79 bills it repeated Amount. It
  // survives only where it differs, as a second line under the outstanding
  // figure -- the one place two numbers mean two things.
  const row = page.locator('tr', { hasText: '₹32,320.00' }).first();
  await expect(row).toContainText('₹32,320.00');   // billed
  await expect(row).toContainText('₹20,320.00');   // still owed
  await expect(row).toContainText('₹12,000.00 paid');
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
  // The panel stays mounted and animates its row track open, so wait for a
  // control to actually have a box before counting -- mid-animation the height
  // is real but tiny and the count is whatever that frame happened to be.
  await expect(page.locator('select').first()).toBeVisible();
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
  // Twice now a column changed on the bill row and not on the lines it expands
  // into: once a count mismatch, once the same count in the wrong order, which
  // silently swapped Amount and Outstanding. Counting cells catches the first
  // and not the second, so this measures where they actually sit.
  await openPurchases(page);

  const billRow = page.locator('tr', { hasText: '₹17,250.00' }).first();
  await expect(billRow).toBeVisible();
  const cells = await billRow.locator('td').count();

  await billRow.click();
  await page.waitForTimeout(400);

  const childRow = page.locator('tr').filter({ hasText: '₹6,250.00' }).first();
  await expect(childRow).toBeVisible();
  expect(await childRow.locator('td').count()).toBe(cells);

  const align = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')];
    const bill = rows.find(r => /17,250/.test(r.textContent));
    const line = rows.find(r => /6,250/.test(r.textContent));
    if (!bill || !line) return null;
    const x = (r) => [...r.querySelectorAll('td')].map(td => Math.round(td.getBoundingClientRect().left));
    return { same: JSON.stringify(x(bill)) === JSON.stringify(x(line)) };
  });
  expect(align).not.toBeNull();
  expect(align.same).toBe(true);
});

test('every field in the purchase form says what it is', async ({ page }) => {
  // The line grid is a CSS grid, not a <table>, and its five inputs were named
  // only by a 9px uppercase header a screen reader has no way to associate.
  // The header fields had visible <label>s with no htmlFor, which is decoration
  // rather than a label. Entering a number in the wrong one of these writes a
  // wrong balance to a supplier's ledger.
  await openPurchases(page);
  await page.getByRole('button', { name: /New purchase/ }).click();
  await expect(page.getByText('Line total').first()).toBeVisible();

  const unnamed = await page.evaluate(() => {
    const form = document.querySelector('form');
    return [...form.querySelectorAll('input, select, textarea')]
      .filter((el) => {
        const n = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || '';
        return !n.trim();
      })
      .map((el) => el.getAttribute('placeholder') || el.tagName + ':' + el.type);
  });
  expect(unnamed).toEqual([]);
});

test('the form says that price and total fill each other in', async ({ page }) => {
  // Typing a total rewrites the price each, and vice versa. Useful -- a
  // supplier's bill often states one and not the other -- but a field changing
  // itself is alarming when nothing said it would.
  await openPurchases(page);
  await page.getByRole('button', { name: /New purchase/ }).click();
  await expect(page.getByText(/the other is worked out from the quantity/i)).toBeVisible();
});

test('a folded filter panel is out of reach, not just out of sight', async ({ page }) => {
  // The panel now stays mounted so it can animate in both directions. Mounted
  // and invisible is a trap of its own: five controls a sighted user cannot see
  // but a keyboard or a screen reader walks straight into. Clipping alone does
  // not do it -- a clipped <select> still has its own 36px box and still takes
  // focus -- so this measures the TRACK the panel sits in, and inert on top.
  await openPurchases(page);

  const read = () => page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')]
      .find(el => /All suppliers/.test(el.textContent));
    if (!sel) return null;
    const clip = sel.closest('[class*="overflow-hidden"]');
    let inert = false;
    for (let el = sel; el; el = el.parentElement) if (el.inert) { inert = true; break; }
    return { h: Math.round(clip.getBoundingClientRect().height), inert };
  });

  const shut = await read();
  expect(shut).not.toBeNull();
  expect(shut.h).toBe(0);
  expect(shut.inert).toBe(true);

  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.locator('select').filter({ hasText: 'All suppliers' })).toBeVisible();
  // The track animates open, so settle before measuring -- a frame taken
  // mid-transition reports whatever height that frame happened to be at.
  await page.waitForFunction(() => {
    const sel = [...document.querySelectorAll('select')]
      .find(el => /All suppliers/.test(el.textContent));
    const clip = sel && sel.closest('[class*="overflow-hidden"]');
    return !!clip && clip.getBoundingClientRect().height > 20;
  }, { timeout: 5000 });
  const open = await read();
  expect(open.h).toBeGreaterThan(20);
  expect(open.inert).toBe(false);
});

test('the row menu opens inside the window on the last row', async ({ page }) => {
  // Six items is 212px. On the last rows of a long table the menu used to open
  // below the trigger and off the bottom of the window, which is exactly where
  // it is most needed. It flips above instead, and grows from the corner the
  // trigger is on rather than from its own centre.
  await openPurchases(page);

  const triggers = page.getByRole('button', { name: /^(Bill actions|More)$/ });
  await expect(triggers.first()).toBeVisible();
  const n = await triggers.count();
  await triggers.nth(n - 1).click();

  const box = await page.evaluate(() => {
    const el = document.querySelector('.menu-pop');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: r.top, bottom: r.bottom, left: r.left, right: r.right,
      vh: window.innerHeight, vw: window.innerWidth,
      w: el.offsetWidth,
      origin: getComputedStyle(el).transformOrigin,
    };
  });
  expect(box).not.toBeNull();
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.vh);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.vw);
  // Origin resolves to pixels against the element's own border box, which is
  // NOT the rect while it is still scaling -- read offsetWidth instead.
  const [ox] = box.origin.split(' ').map(parseFloat);
  expect(Math.round(ox)).toBe(box.w);
});
