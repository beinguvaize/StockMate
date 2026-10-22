import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * The purchase bill register (design approved by the Director at v3).
 *
 * Fixtures (MOCK_PURCHASES), all one supplier id, 30 days credit by default:
 *   PUR-1  ₹13,800  cash, paid             2 days ago     -> Paid
 *   PUR-2  ₹32,320  credit, ₹12,000 paid   5 days ago     -> Part paid
 *   PUR-3  ₹9,300   credit, nothing paid   48 days ago    -> Overdue 18d
 *   PUR-4/5 one bill ₹17,250 (11,000 + 6,250), ₹4,000 paid, 9 days ago -> Part paid
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

async function openPurchases(page, { width = 1600, height = 900 } = {}) {
  await seedAppCache(page);
  await setupMocks(page);
  // The rail costs 248px; collapse it so these assertions are about the register.
  await page.addInitScript(() => {
    try { localStorage.setItem('nav_rail_collapsed', '1'); localStorage.setItem('nav_rail_epoch', '2'); } catch { /* ignore */ }
  });
  await page.setViewportSize({ width, height });
  await page.goto(`/${TENANT_SLUG}/purchases`);
  await page.getByTestId('bill-register').waitFor({ timeout: 15_000 });
  await page.getByTestId('bill').first().waitFor({ timeout: 15_000 });
}

const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const bill = (page, text) => page.getByTestId('bill').filter({ hasText: text });

test('the tabs count bills and money over the whole filtered set', async ({ page }) => {
  await openPurchases(page);
  await expect(tab(page, 'Due')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Due')).toContainText('3');
  await expect(tab(page, 'Due')).toContainText('₹42,870.00');
  await expect(tab(page, 'Overdue')).toContainText('₹9,300.00');
  await expect(tab(page, 'Part paid')).toContainText('2');
  await expect(tab(page, 'Paid')).toContainText('1');
  await expect(tab(page, 'All')).toContainText('4');
});

test('what needs action comes first: overdue leads the Due tab', async ({ page }) => {
  await openPurchases(page);
  const firstBand = page.getByTestId('band').first();
  await expect(firstBand).toContainText('Overdue');
  await expect(page.getByTestId('bill').first()).toContainText('₹9,300.00'.slice(1));
  await expect(page.getByTestId('bill').first()).toContainText(/Overdue \d+d/);
});

test('red marks only money that is overdue', async ({ page }) => {
  await openPurchases(page);
  const colour = (loc) => loc.evaluate((el) => getComputedStyle(el).color);
  const neg = await page.evaluate(() => {
    const p = document.createElement('span'); p.style.color = 'var(--color-neg)';
    document.querySelector('.breg').appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c;
  });
  // the overdue bill's due figure is red ...
  expect(await colour(bill(page, '9,300.00').locator('.c-due'))).toBe(neg);
  // ... a part-paid bill that is not late is not
  expect(await colour(bill(page, '32,320.00').locator('.c-due'))).not.toBe(neg);
  // the total's due figure is not red; the overdue part is said separately
  const total = page.getByTestId('register-total');
  expect(await colour(total.locator('.c-due'))).not.toBe(neg);
  await expect(total).toContainText('of which ₹9,300.00 overdue');
});

test('the total row is the sum of the rows above it', async ({ page }) => {
  await openPurchases(page);
  await tab(page, 'All').click();
  const nums = await page.getByTestId('bill').evaluateAll((rows) => rows.map((r) => {
    const n = (sel) => Number((r.querySelector(sel)?.textContent || '0').replace(/[^\d.]/g, '') || 0);
    return [n('.row .c-amt'), n('.row .c-due')];
  }));
  const sum = (i) => nums.reduce((s, x) => s + x[i], 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const total = page.getByTestId('register-total');
  await expect(total.locator('.c-amt')).toHaveText(`₹${sum(0)}`);
  await expect(total.locator('.c-due')).toHaveText(`₹${sum(1)}`);
  await expect(page.getByTestId('register-summary')).toContainText(`₹${sum(0)}`);
});

test('an opened bill keeps its lines under the bill’s own columns', async ({ page }) => {
  await openPurchases(page);
  const b = bill(page, '17,250.00');
  await b.getByRole('button', { name: /Show 2 lines/ }).click();
  const lines = b.getByTestId('bill-line');
  await expect(lines).toHaveCount(2);
  const right = (loc) => loc.evaluate((el) => Math.round(el.getBoundingClientRect().right));
  const billAmt = await right(b.locator('.row .c-amt'));
  expect(await right(lines.nth(0).locator('.c-amt'))).toBe(billAmt);
  expect(await right(lines.nth(1).locator('.c-amt'))).toBe(billAmt);
  expect(await right(page.getByTestId('register-total').locator('.c-amt'))).toBe(billAmt);
  // each line says how its price moved against the previous purchase
  await expect(lines.nth(0)).toContainText(/First purchase|%/);
});

test('money owed passes contrast where it is drawn', async ({ page }) => {
  await openPurchases(page);
  const ratio = await bill(page, '9,300.00').locator('.c-due').evaluate((el) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const ctx = cv.getContext('2d');
    const rgba = (c) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.clearRect(0, 0, 1, 1); ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    let n = el, bg = [255, 255, 255];
    while (n && n !== document.documentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] === 1) { bg = c; break; }
      n = n.parentElement;
    }
    const [hi, lo] = [L(rgba(getComputedStyle(el).color)), L(bg)].sort((a, b) => b - a);
    return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('changing tab clears a selection it would hide, and Undo brings it back', async ({ page }) => {
  await openPurchases(page);
  await bill(page, '32,320.00').getByRole('checkbox').check();
  await expect(page.getByTestId('bulk-bar')).toContainText('1 selected');
  await tab(page, 'Overdue').click();
  await expect(page.getByTestId('bulk-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tab(page, 'Due')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('bulk-bar')).toContainText('1 selected');
});

test('a filter is never hidden: each one shows as a chip', async ({ page }) => {
  await openPurchases(page);
  await page.getByRole('button', { name: /^Terms/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Credit' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.chip', { hasText: 'Terms: Credit' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove terms Credit' }).click();
  await expect(page.locator('.chip')).toHaveCount(0);
});

test('search finds a bill by what was bought', async ({ page }) => {
  await openPurchases(page);
  await tab(page, 'All').click();
  await page.getByPlaceholder('Search bills').fill('Gadget');
  await expect(page.getByTestId('bill')).toHaveCount(2);           // PUR-2, and the bill holding PUR-5
  await expect(page.locator('.chip', { hasText: 'Search: Gadget' })).toBeVisible();
});

test('paying a two-line bill fills its oldest line first, never past what a line owes', async ({ page }) => {
  await openPurchases(page);
  const calls = [];
  await page.route('**/rest/v1/rpc/settle_purchase_payment', (r) => {
    calls.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  page.on('dialog', (d) => d.accept());
  const b = bill(page, '17,250.00');
  await b.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: /Record payment/ }).click();
  await expect(page.getByRole('spinbutton').first()).toHaveValue('13250.00');
  await page.getByRole('button', { name: /Record payment/ }).last().click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls.map((c) => [c.p_purchase_id, c.p_amount])).toEqual([['PUR-4', 7000], ['PUR-5', 6250]]);
});

test('export gives the bills on screen with the GST split', async ({ page }) => {
  await openPurchases(page);
  await page.getByRole('button', { name: /^Export/ }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /CSV/ }).click();
  const file = await dl;
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  const lines = text.replace(/^﻿/, '').trim().split('\n');
  expect(lines[0]).toMatch(/^Supplier bill no,Voucher no,Bill date,Supplier,Supplier GSTIN,Items,Terms,Due date,Status,Taxable value,GST,Amount,Paid,Due$/);
  expect(lines).toHaveLength(4);                                    // header + the 3 bills on the Due tab
  expect(text).toContain('Overdue');
});

test('the row menu opens inside the window on the last row', async ({ page }) => {
  await openPurchases(page, { height: 700 });
  await tab(page, 'All').click();
  const triggers = page.getByRole('button', { name: /^Actions for/ });
  await triggers.last().click();
  const box = await page.locator('.breg-pop').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth };
  });
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.vh);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.vw);
});

test('the keyboard does what the legend says', async ({ page }) => {
  await openPurchases(page);
  const first = page.locator('.breg .row').first();
  await first.focus();
  await page.keyboard.press('j');
  await expect(page.locator('.breg .row').nth(1)).toBeFocused();
  await page.keyboard.press('x');
  await expect(page.getByTestId('bulk-bar')).toContainText('1 selected');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('bill').nth(1).getByTestId('bill-line').first()).toBeVisible();
  await page.keyboard.press('.');
  await expect(page.getByRole('menuitem', { name: /Voucher/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.breg-pop')).toHaveCount(0);
  // tabs move with the arrow keys
  await tab(page, 'Due').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Overdue')).toHaveAttribute('aria-selected', 'true');
});

test('on a phone the first bill is near the top and nothing scrolls sideways', async ({ page }) => {
  await openPurchases(page, { width: 390, height: 844 });
  const y = await page.getByTestId('bill').first().evaluate((el) => el.getBoundingClientRect().top);
  expect(y).toBeLessThan(560);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('a row can be read across without crossing the monitor', async ({ page }) => {
  await openPurchases(page, { width: 2000 });
  const gap = await page.locator('.breg .row').first().evaluate((r) => {
    const items = r.querySelector('.c-items').getBoundingClientRect();
    const amt = r.querySelector('.c-amt').getBoundingClientRect();
    return Math.round(amt.left - items.right);
  });
  expect(gap).toBeLessThan(700);
});

test('every field in the purchase form says what it is', async ({ page }) => {
  // Entering a number in the wrong one of these writes a wrong balance to a
  // supplier's ledger, so every input carries its own name.
  await openPurchases(page);
  await page.getByRole('button', { name: /New purchase/ }).click();
  await expect(page.getByText('Line total').first()).toBeVisible();
  const unnamed = await page.evaluate(() => {
    const form = document.querySelector('form');
    return [...form.querySelectorAll('input, select, textarea')]
      .filter((el) => !(el.getAttribute('aria-label') || el.labels?.[0]?.textContent || '').trim())
      .map((el) => el.getAttribute('placeholder') || el.tagName + ':' + el.type);
  });
  expect(unnamed).toEqual([]);
});

test('the form says that price and total fill each other in', async ({ page }) => {
  await openPurchases(page);
  await page.getByRole('button', { name: /New purchase/ }).click();
  await expect(page.getByText(/the other is worked out from the quantity/i)).toBeVisible();
});

async function openEditBill(page) {
  await openPurchases(page);
  await page.getByRole('button', { name: /^Actions for/ }).first().click();
  await page.getByRole('menuitem', { name: /Edit bill/ }).click();
  await expect(page.getByRole('button', { name: /Add another product/ })).toBeVisible();
}

test('a bill can gain a line', async ({ page }) => {
  // The sixth item turns up in the van an hour later. Without this it needed a
  // second bill for the same delivery.
  await openEditBill(page);
  const before = await page.locator('select').filter({ hasText: /Widget|Gadget/ }).count();
  await page.getByRole('button', { name: /Add another product/ }).click();
  const after = await page.locator('select').filter({ hasText: /Widget|Gadget/ }).count();
  expect(after).toBe(before + 1);
  await expect(page.getByText('new line')).toBeVisible();
});

test('an empty added line cannot be saved', async ({ page }) => {
  await openEditBill(page);
  await page.getByRole('button', { name: /Add another product/ }).click();
  await expect(page.getByRole('button', { name: /Save bill/ })).toBeDisabled();
});

test('only the unsaved line can be dropped here', async ({ page }) => {
  // Removing a SAVED line moves stock and the ledger; it belongs to the
  // line's own Delete, which reverses that.
  await openEditBill(page);
  await page.getByRole('button', { name: /Add another product/ }).click();
  const removers = page.getByRole('button', { name: 'Remove this new line' });
  expect(await removers.count()).toBe(1);
  await removers.first().click();
  await expect(page.getByText('new line')).toHaveCount(0);
});

test("an item's price history lists every purchase against the one before", async ({ page }) => {
  // Widget A was bought three times: Rs 310 (48 days ago), Rs 110 (9 days),
  // Rs 92 (2 days).
  await openPurchases(page);
  await tab(page, 'Paid').click();
  await bill(page, '13,800.00').getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Price history' }).click();

  const h = page.getByTestId('price-history');
  await expect(h).toBeVisible();
  const rows = h.getByTestId('price-history-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('₹92.00');
  await expect(rows.nth(0)).toContainText('-16.4%');
  await expect(rows.nth(1)).toContainText('-64.5%');
  await expect(rows.nth(2)).toContainText('First');
  // Every fixture purchase shares supplier id SUP-001: one supplier, so the
  // by-supplier list (unit-tested) correctly stays hidden.
  await expect(h.getByTestId('price-history-suppliers')).toHaveCount(0);
  const inside = await h.locator('svg[role="img"]').evaluate((svg) => {
    const vb = svg.viewBox.baseVal;
    return [...svg.querySelectorAll('text, circle')].every((el) => {
      const b = el.getBBox();
      return b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= vb.width + 0.5 && b.y + b.height <= vb.height + 0.5;
    });
  });
  expect(inside).toBe(true);
});
