import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * Customer Aging reads get_unpaid_sales. It used to read invoices, and showed
 * Rs 1,761 where customers owed Rs 73,819.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const UNPAID = [
  { sale_id: 'S-OLD', client_id: 'C1', client_name: 'Kuttees Thattukada', phone: '9847000001', sale_date: day(100), total: 1000, paid: 400, unpaid: 600, invoice_id: null },
  { sale_id: 'S-NEW', client_id: 'C1', client_name: 'Kuttees Thattukada', phone: '9847000001', sale_date: day(5), total: 250, paid: 0, unpaid: 250, invoice_id: null },
];

async function open(page, rpc) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.route('**/rest/v1/rpc/get_unpaid_sales', rpc);
  await page.route('**/rest/v1/clients*', (r) => (r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'C1', outstanding_balance: 800 }]) })
    : r.fallback()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${TENANT_SLUG}/reports`);
  await page.getByRole('button', { name: /Accounting/i }).click();
  // The report picker is the button just under the group tabs.
  await page.locator('main button:has(svg.lucide-chevron-down)').first().click();
  await page.getByRole('button', { name: /Customer Aging/ }).first().click();
}

test('shows what is still owed, by age, and states any gap to client balances', async ({ page }) => {
  await open(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(UNPAID) }));
  await expect(page.getByText('Customers owe').first()).toBeVisible({ timeout: 15_000 });
  // What is LEFT to pay (850), not the bill totals (1,250).
  await expect(page.getByRole('cell', { name: /Kuttees Thattukada/ }).first()).toBeVisible();
  await expect(page.locator('body')).toContainText('850');
  await expect(page.locator('body')).not.toContainText('1,250.00');
  await expect(page.getByText(/Customer balances total .*800.*50.* less than these bills/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/overdue/i);
  // headline money is formatted, in rupees
  await expect(page.getByText('₹850.00').first()).toBeVisible();

  // the second tab keeps its own columns: switching must not lose them
  await page.getByRole('button', { name: 'By bill' }).click();
  await expect(page.getByRole('columnheader', { name: /Still owed/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Unpaid for/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'S-OLD' })).toBeVisible();
});

test('total owed fits inside the table on a phone', async ({ page }) => {
  await open(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(UNPAID) }));
  await page.setViewportSize({ width: 390, height: 844 });
  const head = page.getByRole('columnheader', { name: /Total owed/ });
  await expect(head).toBeVisible({ timeout: 15_000 });
  // The rail animates shut after the resize, so wait for the layout to settle.
  await expect.poll(() => head.evaluate((el) => {
    let box = el.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowX)) box = box.parentElement;
    return box.getBoundingClientRect().right - el.getBoundingClientRect().right;
  })).toBeGreaterThanOrEqual(0);
});

test('total owed is on screen without scrolling at 1440', async ({ page }) => {
  await open(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(UNPAID) }));
  const head = page.getByRole('columnheader', { name: /Total owed/ });
  await expect(head).toBeVisible({ timeout: 15_000 });
  const right = await head.evaluate((el) => el.getBoundingClientRect().right);
  expect(right).toBeLessThan(1440);
});

test('says why when the figures cannot load, rather than showing zero as fact', async ({ page }) => {
  await open(page, (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Access denied' }) }));
  const err = page.getByTestId('aging-error');
  await expect(err).toContainText('Access denied', { timeout: 15_000 });
  await expect(err.getByRole('button', { name: 'Retry' })).toBeVisible();
  // never zero as fact
  await expect(page.getByText('Customers owe')).toHaveCount(0);
});
