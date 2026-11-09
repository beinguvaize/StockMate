import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG, MOCK_STAFF_USER, MOCK_TENANT } from './helpers/supabaseMocks.js';
import { buildCard } from '../supabase/functions/ai-ask/cards.ts';

/**
 * Ask, the panel over mockups/ai-chat.html v2. ai-ask is mocked from the same
 * registry, strings and card builder the function uses, so these fail if the
 * screen and the contract drift apart.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
const registry = read('shared/ai_chat/questions.json');
const strings = read('shared/ai_chat/strings.json');

const FIGURES = {
  sales_today: {
    period_from: '2026-11-18', period_to: '2026-11-18', as_of: '2026-11-18T10:42:00Z',
    gross_sales: 184620, bill_count: 23, average_bill: 8026.96, returns_amount: 1850,
    by_method: [{ method: 'CREDIT', amount: 78600 }, { method: 'UPI', amount: 106020 }],
    previous_gross_sales: 162400, change_pct: 13.7,
  },
};
const SCREEN = { key: 'reports_daily_sales', fallback_key: 'sales', mobile: true, params: { from: '2026-11-18', to: '2026-11-18' } };

const listOf = (lang, state = 'on', usage = { used: 63, limit: 100, resets_on: '2026-12-01' }) => ({
  contract_version: 1, state, plan: 'PRO', lang, languages: registry.languages, strings: strings[lang], usage,
  questions: registry.questions.map((q) => ({ id: q.id, category: q.category, label: q.label[lang], screen_key: q.screen.key, fallback_screen_key: q.screen.fallback_key, mobile: q.screen.mobile })),
});

const answerOf = (lang, { text = 'You sold ₹1,84,620.00 today across 23 bills.', reason = null, empty = false } = {}) => ({
  contract_version: 1, text, reason, reason_message: null, as_of: FIGURES.sales_today.as_of, label: 'x',
  figures: FIGURES.sales_today, card: buildCard('sales_today', FIGURES.sales_today, strings[lang], empty), screen: SCREEN, usage: null,
});

async function open(page, { list = (b) => listOf(b.lang ?? 'en'), answer = (b) => answerOf(b.lang), width = 1440, height = 900, beta = true, path: at = 'dashboard' } = {}) {
  await seedAppCache(page);
  await setupMocks(page);
  // The rollout flag is per tenant; these tests switch it on for the mock shop.
  await page.route('**/rest/v1/tenants*', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ ...MOCK_TENANT, settings: beta ? { ai_chat_available: true } : {} }]) }));
  const calls = { list: [], ask: [], enabled: [] };
  await page.route('**/functions/v1/ai-ask', (r) => {
    const body = r.request().postDataJSON();
    const out = body.action === 'list' ? (calls.list.push(body), list(body)) : (calls.ask.push(body), answer(body));
    const status = out.__status ?? 200;
    return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await page.route('**/rest/v1/rpc/ai_set_enabled', (r) => {
    calls.enabled.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });
  await page.setViewportSize({ width, height });
  await page.goto(`/${TENANT_SLUG}/${at}`);
  return calls;
}

const openPanel = async (page) => {
  await page.getByTestId('ask-entry').click();
  await expect(page.getByTestId('ask-panel')).toBeVisible();
};
const question = (page, id) => page.locator(`[data-q="${id}"]`);

test('Ask stays off until the owner turns it on, and shows what is sent', async ({ page }) => {
  let on = false;
  const calls = await open(page, { list: (b) => listOf(b.lang ?? 'en', on ? 'on' : 'off') });
  await page.route('**/rest/v1/rpc/ai_set_enabled', (r) => {
    on = true; calls.enabled.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });
  await openPanel(page);
  const panel = page.getByTestId('ask-panel');
  await expect(panel).toContainText('Turn on Ask for your shop');
  await expect(panel).toContainText('Never sent');
  await expect(panel).toContainText("sent to Google's Gemini API");
  await expect(panel).toContainText('Do not turn this on if you treat your sales, stock or dues figures as confidential.');
  // Three paragraphs, the product named Ask throughout.
  await expect(page.getByTestId('ask-consent').locator('p')).toHaveCount(3);
  await expect(page.getByTestId('ask-consent')).toContainText('after Google separates it from our Google account, API key and project');
  await expect(page.getByTestId('ask-consent')).not.toContainText('AI answers');
  await expect(page.getByTestId('ask-list')).toHaveCount(0);
  expect(calls.ask).toHaveLength(0);

  await panel.getByRole('button', { name: 'Turn on', exact: true }).click();
  await expect(page.getByTestId('ask-list')).toBeVisible();
  expect(calls.enabled).toEqual([{ p_enabled: true }]);
});

test('questions sit under category headings, with the month usage line', async ({ page }) => {
  await open(page);
  await openPanel(page);
  const list = page.getByTestId('ask-list');
  for (const h of ['Sales', 'Stock', 'Dues', 'Cash', 'GST']) await expect(list.getByText(h, { exact: true })).toBeVisible();
  await expect(list.getByRole('button')).toHaveCount(12);
  await expect(page.getByTestId('ask-usage')).toHaveText('63 of 100 explanations used in November. Figures never count.');
});

test('an answer leads with the true number, then the AI text, then the figures and the link', async ({ page }) => {
  const calls = await open(page);
  await openPanel(page);
  await question(page, 'sales_today').click();
  const ans = page.getByTestId('ask-answer');
  await expect(page.getByTestId('ask-hero')).toHaveText('₹1,84,620.00');
  await expect(ans).toContainText('Sold today, 23 bills');
  await expect(ans).toContainText('▲ 13.7% vs ₹1,62,400.00 last Wednesday');
  await expect(page.getByTestId('ask-ai-text')).toContainText('Written by AI from the figures below');
  await expect(ans).toContainText('From your books');
  await expect(ans.getByText('Total sold')).toBeVisible();
  await expect(ans).toContainText('₹1,06,020.00');

  const y = async (l) => (await l.boundingBox()).y;
  const order = [await y(page.getByTestId('ask-hero')), await y(page.getByTestId('ask-ai-text')), await y(ans.getByText('From your books'))];
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  // The client sends only these. Never a tenant, a date or a prompt.
  expect(Object.keys(calls.ask[0]).sort()).toEqual(['action', 'lang', 'question_id']);
  await expect(ans.getByRole('button', { name: /Open Daily Sales/ })).toBeVisible();
});

test('the link opens the matching report', async ({ page }) => {
  await open(page);
  await openPanel(page);
  await question(page, 'sales_today').click();
  await page.getByRole('button', { name: /Open Daily Sales/ }).click();
  await expect(page).toHaveURL(/reports\?tab=DAILY_SALES/);
  await expect(page.getByTestId('ask-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Daily Sales/ }).first()).toBeVisible();
});

test('every failure keeps the figures and says what happened, in the same slot', async ({ page }) => {
  const cases = [
    ['guard_rejected', 'a number in it did not match your books'],
    ['model_error', 'could not be written just now'],
    ['ai_not_configured', 'Explanations are not set up yet'],
    ['rate_limited', 'Too many questions in one minute'],
    ['provider_busy', 'did not use one of your explanations'],
  ];
  let reason = cases[0][0];
  await open(page, { answer: (b) => answerOf(b.lang, { text: null, reason }) });
  await openPanel(page);
  for (const [r, words] of cases) {
    reason = r;
    await question(page, 'cash_bank').click();
    await question(page, 'sales_today').click();
    const slot = page.getByTestId('ask-reason');
    await expect(slot).toHaveAttribute('data-reason', r);
    await expect(slot).toContainText(words);
    await expect(page.getByTestId('ask-hero')).toHaveText('₹1,84,620.00');
    await expect(page.getByTestId('ask-ai-text')).toHaveCount(0);
  }
});

test('a used-up quota keeps the figures and says when it returns', async ({ page }) => {
  await open(page, {
    list: (b) => listOf(b.lang ?? 'en', 'on', { used: 100, limit: 100, resets_on: '2026-12-01' }),
    answer: (b) => answerOf(b.lang, { text: null, reason: 'quota_reached' }),
  });
  await openPanel(page);
  await expect(page.getByTestId('ask-usage')).toContainText('All 100 explanations used in November');
  await question(page, 'sales_today').click();
  await expect(page.getByTestId('ask-reason')).toContainText('They return on 1 Dec');
  await expect(page.getByTestId('ask-hero')).toHaveText('₹1,84,620.00');
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();
});

test('no data shows the fixed line, with no AI slot', async ({ page }) => {
  await open(page, { answer: (b) => answerOf(b.lang, { text: strings.en.no_data, reason: 'no_data', empty: true }) });
  await openPanel(page);
  await question(page, 'sales_today').click();
  await expect(page.getByTestId('ask-answer')).toContainText('No sales recorded yet today.');
  await expect(page.getByTestId('ask-ai-text')).toHaveCount(0);
  await expect(page.getByTestId('ask-reason')).toHaveCount(0);
});

test('a failed read shows no number at all, and can be tried again', async ({ page }) => {
  let fail = true;
  const calls = await open(page, { answer: (b) => (fail ? { __status: 500, contract_version: 1, reason: 'read_failed' } : answerOf(b.lang)) });
  await openPanel(page);
  await question(page, 'sales_today').click();
  await expect(page.getByTestId('ask-error')).toContainText('Nothing is shown rather than a wrong number.');
  await expect(page.getByTestId('ask-panel')).not.toContainText('₹');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('ask-hero')).toHaveText('₹1,84,620.00');
  expect(calls.ask).toHaveLength(2);
});

test('Hindi: labels, sentences and months in Hindi, digits stay Western', async ({ page }) => {
  const calls = await open(page);
  await openPanel(page);
  await page.getByRole('button', { name: 'हिन्दी' }).click();
  const panel = page.getByTestId('ask-panel');
  await expect(panel).toHaveAttribute('lang', 'hi');
  await expect(question(page, 'sales_today')).toHaveText('आज मैंने कितनी बिक्री की?');
  await expect(page.getByTestId('ask-usage')).toHaveText('नवंबर में 100 में से 63 व्याख्याएँ इस्तेमाल हुईं। आँकड़ों की गिनती नहीं होती।');
  await question(page, 'sales_today').click();
  await expect(panel).toContainText('आज की बिक्री, 23 बिल');
  await expect(panel).toContainText('नवंबर');
  expect(calls.ask[0].lang).toBe('hi');
  expect(await page.evaluate(() => /[०-९]/.test(document.querySelector('[data-testid="ask-panel"]').innerText))).toBe(false);
});

test.describe('as staff', () => {
  test.use({ storageState: path.join(__dirname, '.auth/staff.json') });
  test('a staff user has no entry point', async ({ page }) => {
    await seedAppCache(page, true);
    await setupMocks(page, true);
    // setupMocks answers the users table with the owner whoever signs in.
    await page.route('**/rest/v1/users*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_STAFF_USER]) }));
    // Flag on, so only the owner check can be what hides the entry.
    await page.route('**/rest/v1/tenants*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...MOCK_TENANT, settings: { ai_chat_available: true } }]) }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${TENANT_SLUG}/dashboard`);
    await expect(page.getByRole('link', { name: /Dashboard/ }).first()).toBeVisible();
    await expect(page.getByTestId('ask-entry')).toHaveCount(0);
  });
});

test('the server refusal reads plainly, if a non-owner ever reaches the panel', async ({ page }) => {
  await open(page, { list: () => ({ __status: 403, contract_version: 1, reason: 'not_owner' }) });
  await openPanel(page);
  await expect(page.getByTestId('ask-panel')).toContainText('Ask is for the shop owner');
  await expect(page.getByTestId('ask-list')).toHaveCount(0);
});

test('Needs internet: the cached list stays and cannot be tapped, and nothing is worked out', async ({ page, context }) => {
  const calls = await open(page);
  await openPanel(page);
  await expect(question(page, 'sales_today')).toBeEnabled();
  await page.keyboard.press('Escape');
  await context.setOffline(true);
  await openPanel(page);
  await expect(page.getByTestId('ask-panel')).toContainText('Needs internet');
  await expect(question(page, 'sales_today')).toBeDisabled();
  expect(calls.ask).toHaveLength(0);
  await context.setOffline(false);
});

test('Escape closes the panel on web', async ({ page }) => {
  await open(page);
  await openPanel(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ask-panel')).toHaveCount(0);
});

test('phone: Back returns to the list where the owner left it, and nothing scrolls sideways', async ({ page }) => {
  await open(page, { width: 390, height: 600 });
  await page.locator('button.md\\:hidden').first().click();
  await page.getByTestId('ask-entry-mobile').click();
  const panel = page.getByTestId('ask-panel');
  await expect(panel).toBeVisible();
  await expect(question(page, 'gst_gaps')).toBeAttached();

  const scroller = panel.locator('.ask-b');
  await scroller.evaluate((el) => { el.scrollTop = 500; });
  const before = await scroller.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(100);

  await question(page, 'sales_today').scrollIntoViewIfNeeded();
  const at = await scroller.evaluate((el) => el.scrollTop);
  await question(page, 'sales_today').click();
  await expect(page.getByTestId('ask-hero')).toHaveText('₹1,84,620.00');
  await expect(panel.locator('.dock').getByRole('button', { name: /Open Daily Sales/ })).toBeVisible();
  await expect(panel).toContainText('Also ask');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(question(page, 'sales_today')).toBeVisible();
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(at);
});

test('with the rollout flag off, owners see no entry and no Settings card', async ({ page }) => {
  await open(page, { beta: false, path: 'settings' });
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByTestId('ask-entry')).toHaveCount(0);
  await expect(page.getByTestId('ask-settings')).toHaveCount(0);
});

test('Settings: Turn on opens the consent screen; only that screen turns it on', async ({ page }) => {
  let on = false;
  const calls = await open(page, { path: 'settings', list: (b) => listOf(b.lang ?? 'en', on ? 'on' : 'off') });
  await page.route('**/rest/v1/rpc/ai_set_enabled', (r) => {
    const body = r.request().postDataJSON(); calls.enabled.push(body); on = body.p_enabled;
    return r.fulfill({ status: 200, contentType: 'application/json', body: String(on) });
  });
  const card = page.getByTestId('ask-settings');
  await expect(page.getByTestId('ask-settings-state')).toHaveText('Ask is off');
  await card.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByTestId('ask-panel')).toContainText('Turn on Ask for your shop');
  expect(calls.enabled).toHaveLength(0);                 // nothing turned on yet

  await page.getByTestId('ask-panel').getByRole('button', { name: 'Turn on', exact: true }).click();
  await expect(page.getByTestId('ask-list')).toBeVisible();
  await expect(page.getByTestId('ask-settings-state')).toHaveText('Ask is on');
  await page.keyboard.press('Escape');

  await card.getByRole('button', { name: 'Turn off' }).click();   // off is direct
  await expect(page.getByTestId('ask-settings-state')).toHaveText('Ask is off');
  expect(calls.enabled).toEqual([{ p_enabled: true }, { p_enabled: false }]);
});

const LINKED = [
  ['sales_today', 'reports_daily_sales', 'DAILY_SALES', '2026-11-07', '2026-11-07'],
  ['profit_month', 'reports_financials', 'FINANCIALS', '2026-11-01', '2026-11-07'],
  ['top_items', 'reports_product_sales', 'PRODUCT_SALES', '2026-11-01', '2026-11-07'],
  ['gst_collected', 'reports_gstr3b', 'GSTR3B', '2026-11-01', '2026-11-07'],
  ['gst_gaps', 'reports_purchase_register', 'PURCHASE_REGISTER', '2026-10-01', '2026-11-07'],
];
for (const [qid, key, tab, from, to] of LINKED) {
  test(`${qid}: the link opens ${tab} on the answer's own dates`, async ({ page }) => {
    await open(page, { answer: (b) => ({ ...answerOf(b.lang), screen: { key, fallback_key: null, mobile: true, params: { from, to } } }) });
    await openPanel(page);
    await question(page, qid).click();
    await page.getByTestId('ask-answer').getByRole('button', { name: /^Open / }).click();
    await expect(page).toHaveURL(new RegExp(`tab=${tab}&from=${from}&to=${to}`));
    // The report shows the same period: in its date fields or its period line.
    await expect.poll(() => page.evaluate(([f, t]) => {
      const inputs = [...document.querySelectorAll('input[type="date"]')].map((i) => i.value);
      const text = document.body.innerText;
      return (inputs.includes(f) && inputs.includes(t)) || (text.includes(f) && text.includes(t));
    }, [from, to])).toBe(true);
  });
}

test('dead_stock: the link opens the Dead Stock Index itself', async ({ page }) => {
  await open(page, { answer: (b) => ({ ...answerOf(b.lang), screen: { key: 'reports_inventory_dead', fallback_key: 'inventory', mobile: true, params: {} } }) });
  await openPanel(page);
  await question(page, 'dead_stock').click();
  await page.getByTestId('ask-answer').getByRole('button', { name: /Open Dead Stock/ }).click();
  await expect(page).toHaveURL(/tab=INVENTORY&sub=DEAD_STOCK/);
  await expect(page.getByText('Unproductive Asset')).toBeVisible();
});

test('a language switch keeps the question, and one tap asks it again', async ({ page }) => {
  const calls = await open(page);
  await openPanel(page);
  await question(page, 'sales_today').click();
  await expect(page.getByTestId('ask-hero')).toBeVisible();
  await page.getByRole('button', { name: 'हिन्दी' }).click();
  await expect(page.getByTestId('ask-stale')).toContainText('आज मैंने कितनी बिक्री की?');
  await expect(question(page, 'sales_today')).toHaveAttribute('aria-current', 'true');
  expect(calls.ask).toHaveLength(1);                     // never re-asked on its own
  await page.getByRole('button', { name: 'हिन्दी में फिर पूछें' }).click();
  await expect(page.getByTestId('ask-hero')).toBeVisible();
  expect(calls.ask.map((c) => c.lang)).toEqual(['en', 'hi']);
});

test('a lost connection and a server failure read differently', async ({ page }) => {
  let mode = 'conn';
  await open(page);
  await page.route('**/functions/v1/ai-ask', async (r) => {
    const body = r.request().postDataJSON();
    if (body.action === 'list') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listOf('en')) });
    if (mode === 'conn') return r.abort('internetdisconnected');
    return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ contract_version: 1, reason: 'read_failed' }) });
  });
  await openPanel(page);
  await question(page, 'sales_today').click();
  await expect(page.getByTestId('ask-error')).toContainText('Connection lost.');
  mode = 'server';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('ask-error')).toContainText('The server could not read your books.');
  await expect(page.getByTestId('ask-error')).not.toContainText('Connection lost.');
});

test('Settings: the Ask card sits in the same column as the cards above it', async ({ page }) => {
  await open(page, { path: 'settings', list: (b) => listOf(b.lang ?? 'en', 'off') });
  const card = page.getByTestId('ask-settings');
  await expect(card).toBeVisible();
  const above = page.locator('main section').first();
  const [a, c] = [await above.boundingBox(), await card.boundingBox()];
  expect(Math.abs(a.width - c.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(a.x - c.x)).toBeLessThanOrEqual(1);
});

test('gst_collected says what its sales row is, and why GSTR-3B can differ by paise', async ({ page }) => {
  const f = { period_from: '2026-05-01', period_to: '2026-05-31', as_of: 'x', output_gst: 12381.21, taxable_sales: 147678.79,
    last_month_output_gst: 0, last_month_from: '2026-04-01', last_month_to: '2026-04-30', tax_mode: 'EXCLUSIVE' };
  await open(page, { answer: () => ({ ...answerOf('en'), figures: f, card: buildCard('gst_collected', f, strings.en),
    screen: { key: 'reports_gstr3b', fallback_key: null, mobile: true, params: { from: '2026-05-01', to: '2026-05-31' } } }) });
  await openPanel(page);
  await question(page, 'gst_collected').click();
  const ans = page.getByTestId('ask-answer');
  await expect(ans).toContainText('Sales after returns, before GST');
  await expect(ans).toContainText('it rounds GST on each line, your bills round it once per bill.');
  await expect(ans.getByRole('button', { name: /Open GSTR-3B/ })).toBeVisible();
});

test('cash_bank with a loan account says exactly why the Accounts screen reads differently', async ({ page }) => {
  const f = { period_from: '2026-11-09', period_to: '2026-11-09', as_of: 'x', total_balance: 117846.08, cash_total: 215695.51,
    bank_total: -97849.43, today_in: 0, today_out: 0, loan_total: -250000,
    accounts: [{ account_id: 'A1', label: 'Cash', type: 'CASH', balance: 215695.51 }, { account_id: 'A2', label: 'SBI', type: 'BANK', balance: -97849.43 }] };
  await open(page, { answer: () => ({ ...answerOf('en'), figures: f, card: buildCard('cash_bank', f, strings.en),
    screen: { key: 'accounts', fallback_key: 'dashboard', mobile: true, params: {} } }) });
  await openPanel(page);
  await question(page, 'cash_bank').click();
  await expect(page.getByTestId('ask-answer'))
    .toContainText('The Accounts screen total also includes loan accounts (-₹2,50,000.00), so it reads -₹1,32,153.92.');
  await expect(page.getByTestId('ask-hero')).toHaveText('₹1,17,846.08');
});
