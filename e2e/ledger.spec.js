import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

test('client statement: the Payments filter shows a total of what is shown', async ({ page }) => {
  await seedAppCache(page);
  await setupMocks(page);

  // A month with bills BETWEEN the payments -- the shape that made the old
  // balance column rise across consecutive credits.
  const SUP = (process.env.VITE_SUPABASE_URL || '').trim();
  await page.route(`${SUP}/rest/v1/sales*`, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([
      { id: 'S-1', shopId: 'CLI-002', clientId: 'CLI-002', date: '2026-09-03', totalAmount: 2030, paidAmount: 2030, paymentMethod: 'CASH', paymentStatus: 'PAID', items: '[]', tenant_id: '00000000-0000-0000-0000-000000000099' },
      { id: 'S-2', shopId: 'CLI-002', clientId: 'CLI-002', date: '2026-09-10', totalAmount: 3500, paidAmount: 0, paymentMethod: 'CREDIT_SALE', paymentStatus: 'UNPAID', items: '[]', tenant_id: '00000000-0000-0000-0000-000000000099' },
      { id: 'S-3', shopId: 'CLI-002', clientId: 'CLI-002', date: '2026-09-21', totalAmount: 690, paidAmount: 690, paymentMethod: 'CASH', paymentStatus: 'PAID', items: '[]', tenant_id: '00000000-0000-0000-0000-000000000099' },
    ]),
  }));
  await page.route(`${SUP}/rest/v1/client_payments*`, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([
      { id: 'PY-1', client_id: 'CLI-002', amount: 1145, date: '2026-09-03', payment_date: '2026-09-03', payment_method: 'UPI', created_at: '2026-09-03T10:00:00Z', tenant_id: '00000000-0000-0000-0000-000000000099' },
      { id: 'PY-2', client_id: 'CLI-002', amount: 1700, date: '2026-09-17', payment_date: '2026-09-17', payment_method: 'UPI', created_at: '2026-09-17T10:00:00Z', tenant_id: '00000000-0000-0000-0000-000000000099' },
      { id: 'PY-3', client_id: 'CLI-002', amount: 20, date: '2026-09-24', payment_date: '2026-09-24', payment_method: 'UPI', created_at: '2026-09-24T10:00:00Z', tenant_id: '00000000-0000-0000-0000-000000000099' },
    ]),
  }));

  await page.goto(`/${TENANT_SLUG}/clients/settle/CLI-002`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });

  // The old small print excused a balance column that jumped. It should be gone.
  await expect(page.getByText(/balance still counts the/i)).toHaveCount(0);


  const payments = page.locator('button').filter({ hasText: /^PAYMENTS$/i }).first();
  if (await payments.count()) {
    await payments.click();
    await page.waitForTimeout(400);
    // The column stops calling itself a balance once it is not one.
    await expect(page.getByText(/Balance \(all activity\)/i)).toHaveCount(0);
    await expect(page.getByText('PAID SO FAR')).toBeVisible();
    // Filtering to Payments used to leave the table with no total at all.
    await expect(page.getByText(/TOTAL RECEIVED/i)).toBeVisible();
    // The running figure climbs and never falls back: 2,030 -> 3,175 ->
    // 4,875 -> 5,565 -> 5,585, against a balance column that went 3,175 ->
    // 2,030 -> 5,825 on the same rows.
    await expect(page.getByText('₹5,585.00').first()).toBeVisible();
  }
});
