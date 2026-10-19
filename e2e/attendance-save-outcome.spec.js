import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

/**
 * What the attendance bar is allowed to claim after a failed save.
 * ==========================================================================
 *
 * On 2026-10-17 at 11:06:36 UTC an attendance batch for a real shop
 * preflighted (OPTIONS 200), committed four rows in Postgres at 11:06:36.679,
 * and the browser showed `Not saved · TypeError: Failed to fetch` — with a
 * Discard button beside it. The screen asserted the opposite of what had
 * happened and offered the one action that destroys the work.
 *
 * These two tests are the pair that matters. A rejection must still read as
 * "Not saved" with the server's reason, or this change would have turned a
 * real refusal into a shrug; a dropped connection must not.
 */

async function openAttendance(page) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/${TENANT_SLUG}/payroll`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });
  const att = page.getByRole('button', { name: /Attendance/i }).first();
  if (await att.count()) await att.click();
  await expect(page.getByText(/Click a day to mark it/)).toBeVisible();
}

/**
 * Make the attendance WRITE fail the given way, while reads keep working.
 *
 * The GET is answered here rather than passed on. `route.continue()` would
 * send it to the real API, where the fixture's fake JWT is refused, and
 * `route.fallback()` depends on handler registration order. Answering it
 * outright makes the re-read deterministic: the server holds nothing.
 */
async function failTheSave(page, failWrite) {
  await page.route('**/rest/v1/attendance**', (route) =>
    route.request().method() === 'POST'
      ? failWrite(route)
      : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

/** Mark the first employee's first day Present, leaving one pending change. */
async function stageOneDay(page) {
  // By test id, not "the first button in the row" — that is the Apply-rate
  // button in the sticky name cell, not a day.
  await page.getByTestId('att-day').first().click();
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.getByTestId('att-save-bar')).toContainText('1 unsaved change');
}

test.describe('a failed attendance save', () => {
  test('a dropped connection is reported as unconfirmed, not as lost', async ({ page }) => {
    await openAttendance(page);
    await stageOneDay(page);

    // The exact failure from production: the request goes out and nothing
    // comes back. fetch rejects with TypeError: Failed to fetch.
    await failTheSave(page, (route) => route.abort('failed'));

    await page.getByTestId('att-save').click();

    const bar = page.getByTestId('att-save-bar');
    await expect(bar).toContainText("Couldn't confirm this attendance save");
    // The claim the app cannot support must not appear.
    await expect(bar).not.toContainText('Not saved');
    await expect(page.getByTestId('att-unconfirmed-note')).toContainText('may already be saved');

    // Discard is replaced, not merely demoted: it would throw away edits the
    // database may already hold.
    await expect(page.getByTestId('att-discard')).toHaveCount(0);
    await expect(page.getByTestId('att-check-server')).toBeVisible();

    // And the edit itself is still there to re-save.
    await expect(page.getByTestId('att-save')).toContainText('Save again');
    await expect(page.getByTestId('att-save')).toBeEnabled();
  });

  test('"Check the server" shows what the server actually has', async ({ page }) => {
    await openAttendance(page);
    await stageOneDay(page);

    await failTheSave(page, (route) => route.abort('failed'));
    await page.getByTestId('att-save').click();
    await expect(page.getByTestId('att-check-server')).toBeVisible();

    await page.getByTestId('att-check-server').click();

    // The bar goes once the server's answer is on screen — the question has
    // been answered, whichever way it fell.
    await expect(page.getByTestId('att-save-bar')).toHaveCount(0);
  });

  test('a server rejection still reads as not saved, with the reason', async ({ page }) => {
    await openAttendance(page);
    await stageOneDay(page);

    await failTheSave(page, (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: '42501',
        message: 'new row violates row-level security policy for table "attendance"',
      }),
    }));

    await page.getByTestId('att-save').click();

    const bar = page.getByTestId('att-save-bar');
    await expect(bar).toContainText('Not saved');
    // The server answered, so its words are kept: they are what makes this
    // fixable rather than mysterious.
    await expect(bar).toContainText('row-level security');
    await expect(page.getByTestId('att-unconfirmed-note')).toHaveCount(0);
    // Nothing was written, so discarding is safe and is offered again.
    await expect(page.getByTestId('att-discard')).toBeVisible();
  });
});
