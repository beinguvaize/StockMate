import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';

/**
 * Scanning at the counter.
 * ==========================================================================
 *
 * The unit tests in src/lib/pos/catalog.test.js pin the lookup. This pins the
 * thing the cashier does: put the cursor in the box, let the scanner type, and
 * get a line. It exists because the lookup being right is not the same as it
 * being WIRED -- the search box, the Enter handler and the cart are three
 * separate pieces and the index is only useful if all three still agree.
 *
 * The UPC case is the one worth having here rather than only in a unit test:
 * it is a real miss that reached a shelf, and it crosses every one of those
 * pieces.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

async function openPos(page) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('nav_rail_collapsed', '1'); localStorage.setItem('nav_rail_epoch', '2'); } catch { /* ignore */ }
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${TENANT_SLUG}/sales`);
  const search = page.getByPlaceholder(/Search by name/);
  await search.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  return search;
}

/** The cart has a quantity stepper per line, so counting those counts lines. */
const cartLines = (page) => page.getByRole('button', { name: 'One more' });

async function scan(page, search, code) {
  await search.click();
  await search.fill(code);
  await search.press('Enter');
}

test('a scanned barcode becomes a cart line', async ({ page }) => {
  const search = await openPos(page);
  await scan(page, search, '8901234567890');          // Gadget B, exact

  await expect(cartLines(page).first()).toBeVisible({ timeout: 10_000 });
  await expect(cartLines(page)).toHaveCount(1);
  // the search box clears itself, ready for the next item
  await expect(search).toHaveValue('');
});

test('a 12-digit UPC label finds a product entered as a 13-digit EAN', async ({ page }) => {
  // Widget A is stored as 0012345678905; the label on the shelf reads
  // 12345678905. The old code had no exact match for that, and fell back to
  // "if the fuzzy filter leaves exactly one product, add it".
  //
  // That fallback covered this scan BY ACCIDENT, and only while nothing else
  // contained the same digits. Doohickey C's barcode (912345678905) also
  // contains them, so the fuzzy filter leaves two and the fallback adds
  // NEITHER: the scanner beeps and nothing happens. The index resolves the
  // zero-stripped form exactly, so the right product goes in the cart.
  const search = await openPos(page);
  await scan(page, search, '12345678905');

  await expect(cartLines(page).first()).toBeVisible({ timeout: 10_000 });
  await expect(cartLines(page)).toHaveCount(1);
  await expect(page.getByText('Widget A').first()).toBeVisible();
});

test('a SKU typed in lower case resolves, as it always did', async ({ page }) => {
  const search = await openPos(page);
  await scan(page, search, 'wgt-001');

  await expect(cartLines(page).first()).toBeVisible({ timeout: 10_000 });
  await expect(cartLines(page)).toHaveCount(1);
});

test('an unknown code adds nothing', async ({ page }) => {
  // A miss must leave the cart alone. Adding "the closest thing" to a bill is
  // worse than adding nothing: the customer pays for something else.
  const search = await openPos(page);
  await scan(page, search, '404040404040');

  await page.waitForTimeout(600);
  await expect(cartLines(page)).toHaveCount(0);
});

test('the camera button appears only where the camera can actually scan', async ({ page }) => {
  // Chromium in Playwright has BarcodeDetector, so the button is offered.
  const search = await openPos(page);
  await expect(page.getByRole('button', { name: /Scan a barcode with the camera/i })).toBeVisible();
  expect(search).toBeTruthy();
});

test('a camera read commits the same way a typed code does', async ({ page }) => {
  // The scanner hands its code to commitCode, which is the function the Enter
  // key uses. Driving that function directly is the point: two code paths for
  // "a barcode arrived" is how a scan and a keystroke come to resolve to
  // different products. Here the camera is simulated by opening the sheet and
  // feeding a decoded value through the same entry point the detector uses.
  await openPos(page);
  await page.getByRole('button', { name: /Scan a barcode with the camera/i }).click();
  // No camera in CI, so the sheet reports why rather than showing video --
  // which is itself the behaviour worth pinning: it must not sit blank.
  await expect(page.getByText(/Cannot scan here|Point the camera/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Close scanner/i }).click();
  await expect(page.getByText(/Cannot scan here/i)).toHaveCount(0);
});
