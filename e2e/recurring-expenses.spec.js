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

test('the repeat control states the real next date and works from the keyboard', async ({ page }) => {
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${TENANT_SLUG}/expenses`);
  await page.getByRole('button', { name: /Log expense/ }).first().click();
  const repeat = page.getByTestId('repeat-control');
  const daily = repeat.getByRole('radio', { name: 'Daily' });
  await daily.click();
  await expect(page.getByTestId('repeat-line')).toContainText(/· next (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}/);
  // arrows move AND select, one tab stop for the group
  await daily.focus();
  await page.keyboard.press('ArrowRight');
  await expect(repeat.getByRole('radio', { name: 'Monthly' })).toHaveAttribute('aria-checked', 'true');
  await expect(repeat.getByRole('radio', { name: 'Monthly' })).toBeFocused();
  await expect(repeat.getByRole('radio', { name: 'Daily' })).toHaveAttribute('tabindex', '-1');
  await expect(page.getByTestId('repeat-line')).toContainText(/Monthly on the \d+(st|nd|rd|th)/);
  // the last day cannot be switched off silently
  await page.keyboard.press('ArrowLeft');
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) await repeat.getByRole('button', { name: d }).click();
  await expect(repeat).toContainText('Keep at least one day');
  await expect(repeat.getByRole('button', { name: 'Sun' })).toHaveAttribute('aria-pressed', 'true');
});
