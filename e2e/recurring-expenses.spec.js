import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * Daily recurring expenses. Generation runs in the database
 * (generate_due_recurring_expenses on pg_cron, tested on dev); this pins what
 * the form sends: the schedule, and that the logged expense covers its own
 * day so the nightly job starts tomorrow.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

test('a daily expense that skips Sunday is saved with its schedule', async ({ page }) => {
  await seedAppCache(page);
  await setupMocks(page);
  const templates = [];
  await page.route('**/rest/v1/recurring_expense_templates*', (r) => {
    if (r.request().method() === 'POST') { templates.push(r.request().postDataJSON()); return r.fulfill({ status: 201, body: '' }); }
    return r.fallback();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${TENANT_SLUG}/expenses`);
  await page.getByRole('button', { name: /Log expense/ }).first().click();
  await page.locator('#exp-amount').fill('50');

  const repeat = page.getByTestId('repeat-control');
  await expect(repeat).toContainText('Log this once');
  await repeat.getByRole('radio', { name: 'Daily' }).click();
  await repeat.getByRole('button', { name: 'Sun' }).click();
  await expect(repeat).toContainText('Every day except Sun');

  await page.locator('form button[type="submit"]').click();
  await expect.poll(() => templates.length).toBe(1);
  const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  expect(templates[0]).toMatchObject({ frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6], amount: 50, start_date: today, last_generated: today });
});
