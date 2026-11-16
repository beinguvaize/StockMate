import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { checkReply } from '../../supabase/functions/ai-ask/guard.ts';
import { toModelFigures, restoreNames } from '../../supabase/functions/ai-ask/standins.ts';
import { buildCard } from '../../supabase/functions/ai-ask/cards.ts';
import { runQuestion, ReadFailed, profitFindings, PROFIT_TIPS_SHOWN } from '../../supabase/functions/ai-ask/runs.ts';
import { gateRowLinks } from '../../supabase/functions/ai-ask/handler.ts';
import { SYSTEM_PROMPT } from '../../supabase/functions/ai-ask/prompt.ts';
import { screenPath } from './askFormat.js';
import strings from '../../shared/ai_chat/strings.json';
import registry from '../../shared/ai_chat/questions.json';

// profit_tips: "How can I make more profit?" The amounts follow FUTURE DISPO's
// aggregates for 17 Oct to 16 Nov 2026, read on prod read-only: ₹36,887 of
// stock in 11 items unsold for 30 days, ₹14,398.04 unpaid over 60 days by 7
// customers, one item sold below cost (loss ₹167.50), an expense category up
// ₹600, 3 of the top 15 sellers running low. Names are invented.

const TODAY = '2026-11-16';

const MARGINS = {
  period_from: '2026-10-17', period_to: TODAY, as_of: 'x', items_sold: 50, loss_items: 1, thin_items: 0,
  revenue: 385061.5, cogs: 322522.81, gross_profit: 62538.69,
  loss: [{ product_id: 'P9', product_name: 'Paper Cup 150ml', unit: 'PKT', units_sold: 50, avg_sell_price: 31.65,
    unit_cost: 35, selling_price: 32, revenue: 1582.5, cogs: 1750, gross_profit: -167.5, margin_pct: -10.58 }],
  thin: [], picked: [],
};
const COST = { period_from: '2026-08-18', period_to: TODAY, as_of: 'x', items_up: 0, items_compared: 0, items: [] };
const DEAD = { period_from: '2026-10-17', period_to: TODAY, as_of: 'x', items_dead: 11, value_stuck: 36887,
  items: [{ product_id: 'P1', product_name: 'Steel Tray 12"', unit: 'PCS', stock: 40, value: 9600 }] };
const DUES = { as_of: 'x', total_over: 14398.04, customers_over: 7, bills_over: 12, oldest_days: 159,
  aged_61_90: 7845, aged_91_120: 4593.04, aged_over_120: 1960, total_unpaid: 52000,
  customers: [{ client_id: 'C9', name: 'Asha Stores', phone: '9876543210', oldest_days: 159, amount_over: 4200 }] };
const EXP_NOW = { total: 35860, entry_count: 30, category_count: 3, drawings_total: 0, drawings_count: 0, entries: [],
  categories: [{ category: 'Rent', amount: 12600, entry_count: 1 }, { category: 'Fuel', amount: 3600, entry_count: 6 },
    { category: 'Food', amount: 2100, entry_count: 9 }] };
const EXP_PREV = { total: 47202, entry_count: 41, category_count: 3, drawings_total: 0, drawings_count: 0, entries: [],
  categories: [{ category: 'Rent', amount: 12600, entry_count: 1 }, { category: 'Fuel', amount: 3000, entry_count: 5 },
    { category: 'Food', amount: 2300, entry_count: 8 }] };
const RET = { period_from: '2026-11-01', period_to: TODAY, as_of: 'x', returns_total: 0, return_count: 0,
  all_return_count: 9, all_returns_total: 14608, distinct_items_returned: 0, items: [] };
const FAST = { period_from: '2026-10-17', period_to: TODAY, as_of: 'x', window_days: 30, top_n: 15, cover_days: 7, top_count: 15,
  items_low: 3, items: [{ product_name: 'Frootty plate 12"', unit: 'PCS', rank: 4, units_sold: 407, stock: 54, threshold: 10, days_left: 4, reason: 'days' }] };

const ANSWERS = {
  ai_item_margins: MARGINS, ai_cost_up: COST, ai_dead_stock: DEAD, ai_dues_over_60: DUES,
  ai_expense_summary: (a) => (a.p_from === '2026-11-01' ? EXP_NOW : EXP_PREV),
  ai_sales_returns: RET, ai_fast_movers_low: FAST,
};
const fnDb = (answers, calls = []) => ({
  calls,
  rpc: async (name, args) => {
    calls.push({ name, ...args });
    const a = answers[name];
    return a ? { data: typeof a === 'function' ? a(args) : a, error: null } : { data: null, error: { message: `unexpected ${name}` } };
  },
});
const run = (db, today = TODAY) => runQuestion('profit_tips', db, { tenantId: 'T', today, taxMode: null });
const findingsOf = (over = {}) => profitFindings({
  today: TODAY, from: '2026-10-17', mFrom: '2026-11-01', prev: { from: '2026-10-01', to: '2026-10-16' }, asOf: 'x',
  margins: MARGINS, cost: COST, dead: DEAD, dues: DUES, expNow: EXP_NOW, expPrev: EXP_PREV, returns: RET, fast: FAST, ...over,
});

describe('profit_tips: registry and strings', () => {
  it('is the first question in Sales, owner only, with no single screen', () => {
    const q = registry.questions[0];
    expect(q).toMatchObject({ id: 'profit_tips', category: 'sales', module: 'reports', roles: ['OWNER'] });
    expect(q.label.en).toBe('How can I make more profit?');
    expect(q.label.hi).toBeTruthy();
    expect(q.screen).toEqual({ key: null, fallback_key: null, module: 'reports', mobile: false });
    expect(registry.questions.filter((x) => x.category === 'sales')[0].id).toBe('profit_tips');
  });

  it('every new key is in both languages, and every new Hindi key awaits review', () => {
    const keys = ['titles.profit_tips', 'hero.profit_tips.unit', 'hero.profit_tips.caption', 'notes.profit_tips',
      'no_data_by_question.profit_tips', 'links.reports_product_margins', 'card.tip_finding', 'card.tip_below_cost',
      'card.tip_more_loss', 'card.tip_thin_margin', 'card.tip_cost_up', 'card.tip_dead_stock', 'card.tip_dues',
      'card.tip_expense_up', 'card.tip_returns', 'card.tip_fast_low', 'card.tip_items_n',
      'footnotes.profit_tips_margins', 'footnotes.profit_tips_loss', 'footnotes.profit_tips_cost_up',
      'footnotes.profit_tips_dues', 'footnotes.profit_tips_expense', 'footnotes.profit_tips_fast'];
    const get = (lang, k) => k.split('.').reduce((o, p) => o?.[p], strings[lang]);
    for (const k of keys) {
      expect(get('en', k), k).toBeTruthy();
      expect(get('hi', k), k).toBeTruthy();
      expect(strings.hi.review_pending).toContain(k);
    }
    expect(strings.en.review_pending).toEqual([]);
    expect(new Set(strings.hi.review_pending).size).toBe(strings.hi.review_pending.length);
  });

  it('Product Margins opens on the answer\'s 30 days', () => {
    expect(screenPath('reports_product_margins', { from: '2026-10-17', to: TODAY }))
      .toBe('/reports?tab=PROFITABILITY&from=2026-10-17&to=2026-11-16');
    expect(readFileSync(new URL('../components/reports/ProductProfitabilityReport.jsx', import.meta.url), 'utf8'))
      .toContain("useDateWindow('YEAR', linked)");
  });

  it('the prompt rules for this question are in the fixed system prompt', () => {
    expect(SYSTEM_PROMPT).toContain('Only for the question "How can I make more profit?"');
    expect(SYSTEM_PROMPT).toContain('Never promise or predict a result');
    expect(SYSTEM_PROMPT).toContain('not guarantees');
  });
});

describe('profit_tips: reads', () => {
  it('reads every source once, with dates worked out on the server', async () => {
    const db = fnDb(ANSWERS);
    const r = await run(db);
    expect(db.calls).toEqual([
      { name: 'ai_cost_up', p_days: 90, p_limit: 10 },
      { name: 'ai_item_margins', p_from: '2026-10-17', p_to: TODAY, p_limit: 5, p_product_ids: [] },
      { name: 'ai_dead_stock', p_days: 30, p_limit: 1 },
      { name: 'ai_dues_over_60', p_limit: 1 },
      { name: 'ai_expense_summary', p_from: '2026-11-01', p_to: TODAY, p_limit: 1 },
      { name: 'ai_expense_summary', p_from: '2026-10-01', p_to: '2026-10-16', p_limit: 1 },
      { name: 'ai_sales_returns', p_from: '2026-11-01', p_to: TODAY, p_limit: 1 },
      { name: 'ai_fast_movers_low', p_days: 30, p_top: 15, p_cover_days: 7, p_limit: 1 },
    ]);
    expect(r.params).toEqual({ from: '2026-10-17', to: TODAY });
    expect(r.empty).toBe(false);
  });

  it('ranks by rupee size, money first, then the count finding (FUTURE DISPO shape)', async () => {
    const { figures: f } = await run(fnDb(ANSWERS));
    expect(f.findings.map((x) => [x.key, x.amount])).toEqual([
      ['dead_stock', 36887], ['dues_over_60', 14398.04], ['expense_up', 600], ['below_cost', 167.5], ['fast_low', 3]]);
    expect(f.findings_found).toBe(5);
    expect(f.customers).toEqual([{ name: 'Asha Stores', amount_over: 4200, oldest_days: 159 }]);
    expect(f.categories).toEqual([{ category: 'Fuel', amount: 3600, previous_amount: 3000, change: 600 }]);
  });

  it('shows at most five, and says how many were found', () => {
    const f = findingsOf({
      margins: { ...MARGINS, thin_items: 2, thin: [{ product_id: 'P5', product_name: 'Rice 5kg', unit: 'BAG', units_sold: 20, avg_sell_price: 300,
        unit_cost: 290, selling_price: 300, revenue: 6000, cogs: 5850, gross_profit: 150, margin_pct: 2.5 }] },
      returns: { ...RET, returns_total: 1200, return_count: 2, all_return_count: 11, all_returns_total: 15808,
        items: [{ product_name: 'Cup', qty_returned: 10, unit: 'PKT', value: 800 }] },
    });
    expect(f.findings).toHaveLength(PROFIT_TIPS_SHOWN);
    expect(f.findings_found).toBe(7);
    expect(f.findings.map((x) => x.key)).toEqual(['dead_stock', 'dues_over_60', 'thin_margin', 'returns', 'expense_up']);
    // The dropped findings take their stand-in lists with them.
    expect(findingsOf({ dead: { ...DEAD, value_stuck: 1e6 }, margins: { ...MARGINS, loss_items: 3, loss: [{ ...MARGINS.loss[0], gross_profit: -1e5 }],
        thin_items: 1, thin: [{ ...MARGINS.loss[0], revenue: 2e4, gross_profit: 100, margin_pct: 0.5 }] },
      returns: { ...RET, returns_total: 9e4, return_count: 1, items: [{ product_name: 'X', value: 9e4 }] },
      fast: { ...FAST, items_low: 0 }, dues: { ...DUES, total_over: 50 },
      expNow: { ...EXP_NOW, categories: [{ category: 'Fuel', amount: 9e3 }] } }).customers).toEqual([]);
  });

  it('a cost rise counts only when the list price no longer keeps 5% over the new cost', () => {
    const cost = { ...COST, items_up: 2, items: [
      { product_id: 'A', product_name: 'Cover 10x13', unit: 'PKT', old_cost: 9, new_cost: 9.15, pct_rise: 1.67 },
      { product_id: 'B', product_name: 'Bowl', unit: 'PCS', old_cost: 2, new_cost: 2.2, pct_rise: 10 },
    ] };
    const picked = [
      { product_id: 'A', product_name: 'Cover 10x13', units_sold: 300, selling_price: 8.5, revenue: 2550 },
      { product_id: 'B', product_name: 'Bowl', units_sold: 100, selling_price: 4, revenue: 400 },
    ];
    const f = findingsOf({ cost, margins: { ...MARGINS, picked } });
    const c = f.findings.find((x) => x.key === 'cost_up');
    expect(c).toMatchObject({ product_name: 'Cover 10x13', old_cost: 9, new_cost: 9.15, selling_price: 8.5, amount: 2550, items: 1 });
    // Not sold in the 30 days: no sales figure to tie, so not a finding.
    expect(findingsOf({ cost, margins: { ...MARGINS, picked: [] } }).findings.some((x) => x.key === 'cost_up')).toBe(false);
  });

  it('nothing to suggest is empty, not zero findings dressed up', async () => {
    const none = { ...ANSWERS, ai_item_margins: { ...MARGINS, loss_items: 0, loss: [] }, ai_dead_stock: { ...DEAD, items_dead: 0, value_stuck: 0, items: [] },
      ai_dues_over_60: { ...DUES, bills_over: 0, customers: [] }, ai_expense_summary: { ...EXP_PREV, category_count: 0, categories: [] },
      ai_fast_movers_low: { ...FAST, items_low: 0, items: [] } };
    const r = await run(fnDb(none));
    expect(r.empty).toBe(true);
    expect(r.figures.findings).toEqual([]);
    const card = buildCard('profit_tips', r.figures, strings.en, true);
    expect(card.hero.caption).toBe(strings.en.no_data_by_question.profit_tips);
    expect(card.table).toBeNull();
  });

  it('a cut expense list or a missing read fails the read, never a guess', async () => {
    await expect(run(fnDb({ ...ANSWERS, ai_expense_summary: { ...EXP_NOW, category_count: 60 } }))).rejects.toBeInstanceOf(ReadFailed);
    await expect(run(fnDb({ ...ANSWERS, ai_dead_stock: undefined }))).rejects.toBeInstanceOf(ReadFailed);
    await expect(run(fnDb({ ...ANSWERS, ai_dues_over_60: { total_over: 1 } }))).rejects.toBeInstanceOf(ReadFailed);
  });
});

describe('profit_tips: card', () => {
  const card = () => buildCard('profit_tips', findingsOf(), strings.en);

  it('one row per finding: what it is, its amount, its screen', () => {
    const c = card();
    expect(c.title).toBe('Ideas to make more profit');
    expect(c.hero).toMatchObject({ value: 5, kind: 'count', unit: 'things to look at', caption: 'From your books, 17 Oct to 16 Nov' });
    expect(c.table.columns.map((x) => x.label)).toEqual(['What your books show', 'Amount']);
    expect(c.table.rows).toEqual([
      ['Unsold since 17 Oct: 11 items, the most in Steel Tray 12" (₹9,600.00)', '₹36,887.00'],
      ['Unpaid for over 60 days: 7 customers, the most Asha Stores (₹4,200.00, 159 days)', '₹14,398.04'],
      ['Fuel up: ₹3,600.00 this month against ₹3,000.00 on the same days last month', '+₹600.00'],
      ['Sold below cost: Paper Cup 150ml, sold for ₹1,582.50 against a cost of ₹1,750.00', '₹167.50'],
      ['Best sellers running low: Frootty plate 12" has 4 days left', '3 items'],
    ]);
    expect(c.table.links).toEqual([
      { key: 'reports_inventory_dead', params: {} },
      { key: 'reports_customer_aging', params: {} },
      { key: 'reports_expenses', params: { from: '2026-11-01', to: TODAY } },
      { key: 'reports_product_margins', params: { from: '2026-10-17', to: TODAY } },
      { key: 'reports_product_movement', params: {} },
    ]);
    expect(c.note).toBe(strings.en.notes.profit_tips);
    expect(c.note).toContain('not guarantees');
  });

  it('every amount that is not the screen\'s own figure has an exact footnote', () => {
    const fn = card().footnote;
    expect(fn).toContain('Product Margins opens on 17 Oct–16 Nov');
    expect(fn).toContain("A loss is the item's Gross Profit there, shown as a minus.");
    expect(fn).toContain('Customer Aging shows this as 61–90 days ₹7,845.00, 91–120 days ₹4,593.04 and over 120 days ₹1,960.00.');
    expect(fn).toContain('The Expenses report opens on 1–16 Nov, where Fuel is ₹3,600.00. On the same days last month, 1–16 Oct, it was ₹3,000.00.');
    expect(fn).toContain('Best sellers are your top 15 items by units sold.');
    // The three aging columns add up to the row's amount.
    expect(Math.round((7845 + 4593.04 + 1960) * 100) / 100).toBe(14398.04);
  });

  it('more found than shown says so; more loss items say how many', () => {
    const f = findingsOf({ margins: { ...MARGINS, loss_items: 3 },
      returns: { ...RET, returns_total: 1200, return_count: 2, all_return_count: 2, all_returns_total: 1200, items: [{ product_name: 'Cup', value: 800 }] } });
    const c = buildCard('profit_tips', f, strings.en);
    expect(c.footnote).toContain('Top 5 of 6 shown.');
    expect(c.table.rows.find((r) => r[0].startsWith('Sold below cost'))[0]).toContain('; 2 more items also sold below cost');
    expect(c.footnote).toContain('Sales › Returns shows the same ₹1,200.00: all 2 returns fall in this period.');
  });

  it('a link whose module the plan lacks is dropped; the facts stay', () => {
    const c = gateRowLinks(card(), ['sales', 'inventory']);
    expect(c.table.links).toEqual([null, null, null, null, null]);
    expect(c.table.rows).toHaveLength(5);
    expect(gateRowLinks(card(), ['reports']).table.links[0]).toEqual({ key: 'reports_inventory_dead', params: {} });
    const plain = buildCard('sales_today', { period_from: TODAY, gross_sales: 1, bill_count: 1, average_bill: 1, by_method: [], returns_amount: 0, previous_gross_sales: 0, change_pct: null }, strings.en);
    expect(gateRowLinks(plain, [])).toBe(plain);
  });

  it('Hindi builds the same card shape', () => {
    const c = buildCard('profit_tips', findingsOf(), strings.hi);
    expect(c.table.rows).toHaveLength(5);
    expect(c.table.rows.every(([label]) => label && !label.includes('{'))).toBe(true);
    expect(c.footnote).not.toContain('{');
  });
});

describe('profit_tips: what the model sees', () => {
  const { view, map } = toModelFigures(findingsOf());

  it('names go as stand-ins, ids and screens never leave', () => {
    expect(view.customers).toEqual([{ name: '[C1]', amount_over: 4200, oldest_days: 159 }]);
    expect(view.categories[0].category).toBe('[E1]');
    expect(map).toMatchObject({ '[C1]': 'Asha Stores', '[E1]': 'Fuel' });
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/screen|reports_|product_id|9876543210/);
    expect(view.findings[0]).toMatchObject({ key: 'dead_stock', amount: 36887 });
  });

  it('a good answer passes the guard and gets its names back', () => {
    const reply = 'Try to clear Steel Tray 12", part of ₹36,887 of stock unsold since 17 Oct. '
      + 'Follow up with [C1] on ₹4,200, unpaid for 159 days. Check why [E1] rose to ₹3,600 from ₹3,000. '
      + 'Consider raising the price of Paper Cup 150ml, which sold for ₹1,582.50 against a cost of ₹1,750. '
      + 'These are ideas from your books, not guarantees.';
    expect(checkReply(reply, view, map)).toEqual({ ok: true });
    expect(restoreNames(reply, map)).toContain('Follow up with Asha Stores');
  });

  it('an invented number, a promise or advice it may not give is dropped', () => {
    const bad = [
      'Raise the price of Paper Cup 150ml to ₹40.',
      'Clearing your old stock will increase your profit by ₹36,887.',
      'This is guaranteed to work.',
      'Your profit will go up if you follow up with [C1].',
      'Consider cutting staff pay to save money.',
      'Let go of one helper to save on wages.',
      'Take a loan to buy more of Frootty plate 12".',
    ];
    for (const r of bad) expect(checkReply(r, view, map).ok, r).toBe(false);
  });
});
