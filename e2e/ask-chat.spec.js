import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupMocks, seedAppCache, TENANT_SLUG, MOCK_TENANT } from './helpers/supabaseMocks.js';
import { buildCard } from '../supabase/functions/ai-ask/cards.ts';

/**
 * Ask's chat box ("Ask your own question"). ai-ask is mocked from the same
 * registry, strings and card builder the function uses, as in ask.spec.js.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
test.use({ storageState: path.join(__dirname, '.auth/user.json') });

const read = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
const registry = read('shared/ai_chat/questions.json');
const strings = read('shared/ai_chat/strings.json');
const SHOTS = process.env.ASK_CHAT_SHOTS;

const listOf = (lang, { consentNeeded = false, withChat = true } = {}) => ({
  contract_version: 1, state: 'on', plan: 'PRO', lang, languages: registry.languages, strings: strings[lang],
  usage: { used: 63, limit: 100, resets_on: '2026-12-01' },
  questions: registry.questions.filter((q) => !q.hidden).map((q) => ({ id: q.id, category: q.category, label: q.label[lang], screen_key: q.screen.key, fallback_screen_key: q.screen.fallback_key, mobile: q.screen.mobile })),
  ...(withChat ? { chat: { consent_version: 1, consent_needed: consentNeeded } } : {}),
});

const WEEK = {
  period_from: '2026-11-09', period_to: '2026-11-15', as_of: '2026-11-16T05:00:00Z',
  gross_sales: 84210, bill_count: 96, average_bill: 877.19,
  days: [{ date: '2026-11-09', bill_count: 14, gross_sales: 11020 }, { date: '2026-11-10', bill_count: 16, gross_sales: 13450 },
    { date: '2026-11-11', bill_count: 12, gross_sales: 9800 }, { date: '2026-11-12', bill_count: 15, gross_sales: 12600 },
    { date: '2026-11-13', bill_count: 13, gross_sales: 11240 }, { date: '2026-11-14', bill_count: 14, gross_sales: 13100 },
    { date: '2026-11-15', bill_count: 12, gross_sales: 13000 }],
  previous_gross_sales: 79100, previous_bill_count: 90, previous_from: '2026-11-02', previous_to: '2026-11-08', change_pct: 6.5,
};

const answerOf = () => ({
  contract_version: 1, kind: 'answer', reason: null, reason_message: null, removed: false, usage: { used: 64, limit: 100, resets_on: '2026-12-01' },
  text: 'You sold ₹84,210.00 last week across 96 bills. That is 6.5% more than the week before, when sales were ₹79,100.00.',
  reads: [{
    id: 'sales_week', label: 'How much did I sell this week?', title: 'Sales, 9–15 Nov', category: 'sales', custom: true,
    period: { from: '2026-11-09', to: '2026-11-15' }, as_of: WEEK.as_of, empty: false,
    card: buildCard('sales_week', WEEK, strings.en),
    screen: { key: 'reports_daily_sales', fallback_key: 'sales', mobile: false, params: { from: '2026-11-09', to: '2026-11-15' } },
  }],
  suggestions: [], turn: { reads: [{ id: 'sales_week', from: '2026-11-09', to: '2026-11-15' }] },
});

const noMatchOf = () => ({
  contract_version: 1, kind: 'no_match', reason: null, reason_message: null, removed: false, usage: null,
  text: strings.en.chat.no_match, reads: [], turn: { reads: [] },
  suggestions: ['profit_month', 'top_dues'].map((id) => ({ id, label: registry.questions.find((q) => q.id === id).label.en, category: 'x' })),
});

async function open(page, { list = (b) => listOf(b.lang ?? 'en'), chat = () => answerOf(), width = 1440, height = 900 } = {}) {
  await seedAppCache(page);
  await setupMocks(page);
  await page.route('**/rest/v1/tenants*', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ ...MOCK_TENANT, settings: { ai_chat_available: true } }]) }));
  const calls = { list: [], chat: [], ask: [], consent: [] };
  await page.route('**/functions/v1/ai-ask', (r) => {
    const body = r.request().postDataJSON();
    let out;
    if (body.action === 'list') { calls.list.push(body); out = list(body); }
    else if (body.action === 'chat') { calls.chat.push(body); out = chat(body); }
    else { calls.ask.push(body); out = { contract_version: 1, text: null, reason: 'no_data', card: buildCard('sales_today', { period_from: '2026-11-16', gross_sales: 0, bill_count: 0, by_method: [], previous_gross_sales: 0, change_pct: null }, strings.en, true), screen: null, as_of: null, usage: null }; }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await page.route('**/rest/v1/rpc/ai_set_chat_consent', (r) => {
    calls.consent.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: 'application/json', body: '1' });
  });
  await page.setViewportSize({ width, height });
  await page.goto(`/${TENANT_SLUG}/dashboard`);
  return calls;
}

const openPanel = async (page) => {
  await page.getByTestId('ask-entry').click();
  await expect(page.getByTestId('ask-panel')).toBeVisible();
};
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

test('typing a question shows the owner\'s message, then an answer card from the books', async ({ page }) => {
  const calls = await open(page);
  await openPanel(page);
  const input = page.getByTestId('ask-chat-input');
  await expect(input).toBeEnabled();
  await expect(page.getByTestId('ask-chat-bar')).toContainText('Each message uses one explanation.');
  await input.fill('How did sales go last week?');
  await input.press('Enter');

  const thread = page.getByTestId('ask-chat-thread');
  await expect(thread.getByTestId('ask-chat-user')).toHaveText('You: How did sales go last week?');
  const ans = thread.getByTestId('ask-chat-answer');
  await expect(ans.getByTestId('ask-ai-text')).toContainText('You sold ₹84,210.00 last week across 96 bills.');
  await expect(ans.getByTestId('ask-chat-read')).toContainText('Sales, 9–15 Nov');
  await expect(ans.getByTestId('ask-chat-hero')).toHaveText('₹84,210.00');
  await expect(ans).toContainText('▲ 6.5% vs ₹79,100.00, same days last week');
  await expect(ans.getByRole('button', { name: /Open Daily Sales/ })).toBeVisible();
  await expect(input).toHaveValue('');
  await shot(page, 'chat-answer-desktop');

  // Only the text, the language and the earlier turns go: never a shop, a date or a prompt.
  expect(Object.keys(calls.chat[0]).sort()).toEqual(['action', 'history', 'lang', 'message']);
  expect(calls.chat[0]).toMatchObject({ action: 'chat', lang: 'en', message: 'How did sales go last week?', history: [] });

  // A follow-up sends the earlier question and its reads, never the answer.
  await input.fill('and the week before?');
  await page.getByTestId('ask-chat-send').click();
  await expect(thread.getByTestId('ask-chat-turn')).toHaveCount(2);
  await expect(thread.getByTestId('ask-chat-answer')).toHaveCount(2);
  expect(calls.chat[1].history).toEqual([{ message: 'How did sales go last week?', reads: [{ id: 'sales_week', from: '2026-11-09', to: '2026-11-15' }] }]);
  expect(JSON.stringify(calls.chat[1])).not.toContain('84,210');
});

test('New chat clears the thread', async ({ page }) => {
  await open(page);
  await openPanel(page);
  await page.getByTestId('ask-chat-input').fill('sales last week?');
  await page.getByTestId('ask-chat-input').press('Enter');
  await expect(page.getByTestId('ask-chat-answer')).toBeVisible();
  await page.getByTestId('ask-chat-new').click();
  await expect(page.getByTestId('ask-chat-thread')).toHaveCount(0);
  await expect(page.getByTestId('ask-chat-turn')).toHaveCount(0);
  await expect(page.getByTestId('ask-panel')).toContainText('Tap a question');
});

test('the chat box stays disabled until the updated notice is accepted; set questions keep working', async ({ page }) => {
  let consented = false;
  const calls = await open(page, { list: (b) => listOf(b.lang ?? 'en', { consentNeeded: !consented }) });
  await openPanel(page);
  const input = page.getByTestId('ask-chat-input');
  const notice = page.getByTestId('ask-chat-consent');
  await expect(input).toBeDisabled();
  await expect(page.getByTestId('ask-chat-send')).toBeDisabled();
  await expect(notice).toContainText("What you type in the chat box is also sent to Google. Don't type customers' phone numbers, bank or ID details.");
  await shot(page, 'chat-consent-desktop');

  // A set question still answers meanwhile.
  await page.locator('[data-q="sales_today"]').click();
  await expect(page.getByTestId('ask-answer')).toBeVisible();
  expect(calls.ask).toHaveLength(1);
  expect(calls.chat).toHaveLength(0);

  consented = true;
  await page.getByTestId('ask-chat-accept').click();
  await expect(notice).toHaveCount(0);
  await expect(input).toBeEnabled();
  expect(calls.consent).toEqual([{ p_version: 1 }]);
});

test('an older server without the chat action shows no chat box', async ({ page }) => {
  await open(page, { list: (b) => listOf(b.lang ?? 'en', { withChat: false }) });
  await openPanel(page);
  await expect(page.getByTestId('ask-list')).toBeVisible();
  await expect(page.getByTestId('ask-chat-bar')).toHaveCount(0);
});

test('a question the books cannot answer gets a plain reply with set-question chips that ask', async ({ page }) => {
  const calls = await open(page, { chat: () => noMatchOf() });
  await openPanel(page);
  await page.getByTestId('ask-chat-input').fill('Should I buy gold?');
  await page.getByTestId('ask-chat-input').press('Enter');
  await expect(page.getByTestId('ask-chat-nomatch')).toHaveText(strings.en.chat.no_match);
  const chips = page.getByTestId('ask-chat-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveText('What is my profit this month?');
  await shot(page, 'chat-nomatch-desktop');
  await chips.nth(1).click();
  await expect.poll(() => calls.ask.length).toBe(1);
  expect(calls.ask[0]).toMatchObject({ action: 'ask', question_id: 'top_dues' });
});

test('phone width: the chat box sits at the bottom, the thread replaces the list, Back returns to it', async ({ page }) => {
  await open(page, { width: 390, height: 740 });
  await page.locator('button.md\\:hidden').first().click();
  await page.getByTestId('ask-entry-mobile').click();
  const panel = page.getByTestId('ask-panel');
  await expect(panel).toBeVisible();
  const bar = page.getByTestId('ask-chat-bar');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect(box.y + box.height).toBeGreaterThan(700);

  await page.getByTestId('ask-chat-input').fill('How did sales go last week?');
  await page.getByTestId('ask-chat-input').press('Enter');
  await expect(page.getByTestId('ask-chat-answer')).toBeVisible();
  await expect(page.getByTestId('ask-list')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, 'chat-answer-phone');

  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('ask-list')).toBeVisible();
  await expect(bar).toBeVisible();
});
