/**
 * One-off: log in as the seeded demo tenant and snap the marketing
 * landing-page screenshots into public/screens/. Run from repo root:
 *   node scripts/capture_screens.mjs
 * Requires the dev server (`npm run dev`) on http://localhost:5173.
 */
import { chromium } from '@playwright/test';
import fs   from 'node:fs';
import path from 'node:path';

const OUT  = 'public/screens';
fs.mkdirSync(OUT, { recursive: true });

const BASE  = 'http://localhost:5173';
const EMAIL = 'demo@ledgrpro.app';
const PASS  = 'Demo@12345';
const SLUG  = 'future-dispo';

const VIEW = { width: 1440, height: 900 };

const browser = await chromium.launch();
const ctx     = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
const page    = await ctx.newPage();

const shot = async (name) => {
  // Give charts + lazy supabase fetches plenty of time to settle.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}.png`);
};

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
// Login.jsx mounts the form after the dynamic chunks resolve; give the
// SPA a beat then wait for the email input explicitly.
await page.waitForSelector('input[type="email"]', { timeout: 60000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');

await page.waitForURL(/\/dashboard/, { timeout: 20000 });
// Dashboard pulls a lot of data via fetchWithCache (3s timeout +
// background revalidate). Give it a full 8s plus a reload so the
// second mount reads from a primed IDB cache.
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(8000);
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(5000);
await shot('dashboard');

const tabs = [
  ['sales',     'sales'],
  ['inventory', 'inventory'],
  ['reports',   'reports'],
  ['clients',   'clients'],
  ['invoices',  'invoices'],
  ['settings',  'settings'],
  ['vehicles',  'vehicles'],
  ['expenses',  'expenses'],
  ['purchases', 'purchases'],
  ['suppliers', 'suppliers'],
];
for (const [name, slug] of tabs) {
  await page.goto(`${BASE}/${SLUG}/${slug}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(name);
}

await browser.close();
console.log('Done.');
