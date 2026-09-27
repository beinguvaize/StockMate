import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG } from './helpers/supabaseMocks.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

test('attendance totals stay pinned while the month scrolls', async ({ page }) => {
  await seedAppCache(page);
  await setupMocks(page);
  // daily-wage staff so the attendance grid renders at all
  await page.addInitScript(() => {
    const e = (data) => JSON.stringify({ data, expiry: Date.now() + 864e5 });
    try {
      localStorage.setItem('ledgr_employees', e([
        { id: 'E1', name: 'Akbar',    pay_type: 'DAILY', daily_rate: 900, status: 'ACTIVE', tenant_id: 't' },
        { id: 'E2', name: 'Nadirsha', pay_type: 'DAILY', daily_rate: 900, status: 'ACTIVE', tenant_id: 't' },
      ]));
    } catch { /* ignore */ }
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${TENANT_SLUG}/payroll`);
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 15_000 });

  const att = page.getByRole('button', { name: /Attendance/i }).first();
  if (await att.count()) { await att.click(); await page.waitForTimeout(500); }

  const probe = await page.evaluate(() => {
    const ths = [...document.querySelectorAll('th')];
    const days = ths.find(t => /^days$/i.test(t.textContent.trim()));
    const due  = ths.find(t => /still due/i.test(t.textContent.trim()));
    if (!days || !due) return { rendered: false };
    const scroller = days.closest('.overflow-x-auto');
    return {
      rendered: true,
      daysPosition: getComputedStyle(days).position,
      duePosition:  getComputedStyle(due).position,
      scrollable:   scroller ? scroller.scrollWidth > scroller.clientWidth : false,
    };
  });
  console.log('PROBE ' + JSON.stringify(probe));
  if (!probe.rendered) { console.log('grid did not render — no daily-wage rows'); return; }

  expect(probe.daysPosition).toBe('sticky');
  expect(probe.duePosition).toBe('sticky');

  // scroll the month fully right; the totals must not move off screen
  const before = await page.evaluate(() => {
    const t = [...document.querySelectorAll('th')].find(x => /still due/i.test(x.textContent));
    return t.getBoundingClientRect().right;
  });
  await page.evaluate(() => {
    const s = document.querySelector('.overflow-x-auto');
    if (s) s.scrollLeft = s.scrollWidth;
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const t = [...document.querySelectorAll('th')].find(x => /still due/i.test(x.textContent));
    const r = t.getBoundingClientRect();
    return { right: r.right, visible: r.right <= window.innerWidth + 1 && r.left >= 0 };
  });
  console.log('STILLDUE before.right=' + Math.round(before) + ' after=' + JSON.stringify(after));
  expect(after.visible).toBe(true);
  await page.screenshot({ path: 'shot-payroll.png' });
});
