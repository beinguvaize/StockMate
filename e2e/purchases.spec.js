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

/** A row of the register, never the day band above it. The band totals the
 *  day, so it contains the same figures as the rows it covers and a plain
 *  hasText match finds it first. The band is one cell spanning the table; a
 *  row has four. */
const billRow = (page, text) =>
  page.locator('tr').filter({ hasText: text }).filter({ has: page.locator('td:nth-child(4)') });

test('a settled bill carries one money figure and nothing else', async ({ page }) => {
  // Measured on the live book: Outstanding was blank on 195 purchases of 205
  // and Status read RECEIVED on all 205. Both are gone as columns. A settled
  // row is now the amount and nothing beside it -- not a dash standing in for
  // a column that had nothing to say.
  await openPurchases(page);

  const settled = billRow(page, '₹13,800.00').first();
  await expect(settled).toBeVisible();
  await expect(settled).toContainText('₹13,800.00');
  await expect(settled).not.toContainText('due');
  await expect(settled).not.toContainText('—');
  // the status dropdown is gone from the row; it lives in the row's menu
  expect(await settled.locator('select').count()).toBe(0);
  // terms sit under the supplier, out of the money column
  await expect(settled).toContainText(/Cash|Credit/i);
});

test('the day is a band, and it carries the day total', async ({ page }) => {
  // The date left the rows so it could be stated once per day. The exchange is
  // that the screen can finally total a day -- nothing in the old layout had a
  // scope wider than one row.
  await openPurchases(page);

  const band = page.locator('tr', { hasText: /\d+ bills?/ }).first();
  await expect(band).toBeVisible();
  await expect(band).toContainText(/₹[\d,]+/);
  // one cell spanning the table, not a row of columns
  expect(await band.locator('td').count()).toBe(1);
});

test('an unpaid bill shows what is owed, and what was paid under it', async ({ page }) => {
  await openPurchases(page);

  // Paid is no longer a column: on 73 of 79 bills it repeated Amount. It
  // survives only where it differs, as a second line under the outstanding
  // figure -- the one place two numbers mean two things.
  const row = billRow(page, '₹32,320.00').first();
  await expect(row).toContainText('₹32,320.00');        // billed
  await expect(row).toContainText('₹20,320.00 due');    // still owed, under it
  await expect(row).toContainText('₹12,000.00 paid');
  expect(await row.locator('div[style*="width:"]').count()).toBe(0);
});

test('an overdue bill says how late it is', async ({ page }) => {
  await openPurchases(page);
  const overdue = billRow(page, '₹9,300.00').first();
  await expect(overdue).toContainText(/\d+d late/);
});

test('money owed passes contrast where it is drawn', async ({ page }) => {
  await openPurchases(page);

  // Use the locator that the other assertions already rely on, rather than
  // re-finding the node by hand inside evaluate -- a hand-rolled selector that
  // misses reports "no element" and a test that skips is not a test.
  const due = billRow(page, '₹32,320.00')
    .locator('div', { hasText: '₹20,320.00' }).last();
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

  const row = billRow(page, '₹17,250.00').first();
  await expect(row).toBeVisible();
  const cells = await row.locator('td').count();

  await row.click();
  await page.waitForTimeout(400);

  const childRow = billRow(page, '₹6,250.00').first();
  await expect(childRow).toBeVisible();
  expect(await childRow.locator('td').count()).toBe(cells);

  const align = await page.evaluate(() => {
    // Rows only -- the day band totals the day, so it carries the same figures
    // and would otherwise be compared against a line as if it were a row.
    const rows = [...document.querySelectorAll('tr')]
      .filter(r => r.querySelectorAll('td').length === 4);
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

  // Settle before measuring, the same way the open direction does. The track
  // animates, and a frame read on arrival is whatever that frame was at -- which
  // is why this passed alone and failed in a full run.
  await page.waitForFunction(() => {
    const sel = [...document.querySelectorAll('select')]
      .find(el => /All suppliers/.test(el.textContent));
    const clip = sel && sel.closest('[class*="overflow-hidden"]');
    return !!clip && clip.getBoundingClientRect().height === 0;
  }, { timeout: 5000 });

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

async function openEditBill(page) {
  await openPurchases(page);
  await page.getByRole('button', { name: /^(Bill actions|More)$/ }).first().click();
  await page.getByRole('button', { name: /Edit/ }).first().click();
  await expect(page.getByRole('button', { name: /Add another product/ })).toBeVisible();
}

test('a bill can gain a line', async ({ page }) => {
  // A delivery is not always counted in one go: five things are booked in and
  // the sixth turns up in the van an hour later. Without this the only way to
  // record it was a second bill for the same delivery -- the same split this
  // form exists to prevent, reached from the other side.
  await openEditBill(page);

  const before = await page.locator('select').filter({ hasText: /Widget|Gadget/ }).count();
  await page.getByRole('button', { name: /Add another product/ }).click();
  const after = await page.locator('select').filter({ hasText: /Widget|Gadget/ }).count();
  expect(after).toBe(before + 1);

  // the added row says it is not saved yet
  await expect(page.getByText('new line')).toBeVisible();
  // and the button counts it
  await expect(page.getByRole('button', { name: /Save bill · 2 lines/ })).toBeVisible();
});

test('an empty added line cannot be saved', async ({ page }) => {
  // Quantity and amount are required on every line, and a blank new row must
  // not slip through as a zero-quantity purchase.
  await openEditBill(page);
  await page.getByRole('button', { name: /Add another product/ }).click();

  await expect(page.getByRole('button', { name: /Save bill/ })).toBeDisabled();

  const qtyBoxes = page.locator('input[type="number"]');
  await qtyBoxes.nth(2).fill('5');     // new line qty
  await qtyBoxes.nth(3).fill('250');   // new line amount
  await expect(page.getByRole('button', { name: /Save bill/ })).toBeEnabled();
});

test('only the unsaved line can be dropped here', async ({ page }) => {
  // Removing a SAVED line is a different act -- stock has moved, the ledger
  // has a row -- and belongs to the line's own Delete, which reverses that.
  await openEditBill(page);
  await page.getByRole('button', { name: /Add another product/ }).click();

  const removers = page.getByRole('button', { name: 'Remove this new line' });
  expect(await removers.count()).toBe(1);

  await removers.first().click();
  await expect(page.getByText('new line')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Save bill · 1 line/ })).toBeVisible();
});

test('a row can be read across without crossing the monitor', async ({ page }) => {
  // On a 2000px screen the four columns were four islands with roughly 1,300px
  // of nothing between an item and its amount, and pairing them is the whole
  // job of this table. The page is capped so a row stays one object.
  await page.setViewportSize({ width: 2000, height: 900 });
  await openPurchases(page);

  const row = billRow(page, '₹13,800.00').first();
  await expect(row).toBeVisible();

  const gap = await row.evaluate((tr) => {
    const cells = [...tr.querySelectorAll('td')];
    const item = cells[0].getBoundingClientRect();
    const amount = cells[2].getBoundingClientRect();
    return Math.round(amount.left - item.right);
  });
  // Item and Amount are the pair the eye has to make. Keep them within a
  // readable sweep rather than at opposite ends of the glass.
  expect(gap).toBeLessThan(700);
});

test('quantity sits with the item, not with the supplier', async ({ page }) => {
  // A quantity describes what was bought. It was printed under the SUPPLIER,
  // which is the one thing it does not describe.
  await openPurchases(page);

  const row = billRow(page, '₹13,800.00').first();
  const itemCell = row.locator('td').first();
  await expect(itemCell).toContainText(/\d/);          // the qty is here
  const supplierCell = row.locator('td').nth(1);
  await expect(supplierCell).toContainText(/Cash|Credit/i);
});
