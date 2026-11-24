import { describe, it, expect, vi } from 'vitest';
import { checkReply } from '../../supabase/functions/ai-ask/guard.ts';
import { toModelFigures, restoreNames } from '../../supabase/functions/ai-ask/standins.ts';
import { buildCard } from '../../supabase/functions/ai-ask/cards.ts';
import { sameDaysLastMonth } from '../../supabase/functions/ai-ask/periods.ts';
import { runQuestion, compareCategories, ReadFailed } from '../../supabase/functions/ai-ask/runs.ts';
import { handle } from '../../supabase/functions/ai-ask/handler.ts';
import { screenPath } from './askFormat.js';
import strings from '../../shared/ai_chat/strings.json';
import registry from '../../shared/ai_chat/questions.json';

// The Expenses category: expenses_month, top_expenses, expenses_vs_last.
// Figures are the shape ai_expense_summary returns; the amounts are the Demo
// Kirana Store's 1-25 Jun 2026 and 1-25 May 2026, read on prod.

const IDS = ['expenses_month', 'top_expenses', 'expenses_vs_last'];

const JUNE = {
  period_from: '2026-06-01', period_to: '2026-06-25', as_of: 'x', total: 35441, entry_count: 11,
  categories: [
    { category: 'Salary', amount: 12000, entry_count: 1 }, { category: 'Interest', amount: 9415, entry_count: 2 },
    { category: 'Rent', amount: 8000, entry_count: 1 }, { category: 'Utilities', amount: 2955, entry_count: 1 },
    { category: 'Transport', amount: 2360, entry_count: 4 }, { category: 'Other', amount: 711, entry_count: 2 },
  ],
  category_count: 6, drawings_total: 0, drawings_count: 0,
  entries: [
    { date: '2026-06-03', category: 'Salary', amount: 12000, description: null, from_payroll: true },
    { date: '2026-06-03', category: 'Rent', amount: 8000, description: 'Shop rent June', from_payroll: false },
    { date: '2026-06-24', category: 'Interest', amount: 4767, description: 'Paid to Ramesh Kumar 9876543210', from_payroll: false },
  ],
};
const MAY = {
  period_from: '2026-05-01', period_to: '2026-05-25', as_of: 'x', total: 31367, entry_count: 10,
  categories: [
    { category: 'Salary', amount: 12000, entry_count: 1 }, { category: 'Rent', amount: 8000, entry_count: 1 },
    { category: 'Interest', amount: 4884, entry_count: 1 }, { category: 'Utilities', amount: 3236, entry_count: 1 },
    { category: 'Transport', amount: 2035, entry_count: 3 }, { category: 'Other', amount: 1212, entry_count: 3 },
  ],
  category_count: 6, drawings_total: 0, drawings_count: 0, entries: [],
};

/** A database that answers ai_expense_summary by period, and records the calls. */
const summaryDb = (byFrom, calls = []) => ({
  calls,
  rpc: async (name, args) => {
    calls.push({ name, ...args });
    if (name !== 'ai_expense_summary') return { data: null, error: { message: `unexpected ${name}` } };
    const f = byFrom[args.p_from];
    return f ? { data: f, error: null } : { data: null, error: { message: 'boom' } };
  },
});
const run = (id, db, today = '2026-06-25') => runQuestion(id, db, { tenantId: 'T', today, taxMode: null });

describe('expenses: registry and strings', () => {
  it('three questions under the expenses category, linked to the Expenses report, no phone link', () => {
    const qs = registry.questions.filter((q) => q.category === 'expenses');
    expect(qs.map((q) => q.id)).toEqual(IDS);
    for (const q of qs) {
      expect(q).toMatchObject({ module: 'expenses', roles: ['OWNER'] });
      expect(q.screen).toEqual({ key: 'reports_expenses', fallback_key: null, module: 'reports', mobile: false });
      expect(q.label.en && q.label.hi).toBeTruthy();
      expect(q.hidden).toBeUndefined();
    }
    expect(strings.en.ui.category_expenses).toBe('Expenses');
  });

  it('every new key exists in both languages, and every new Hindi key awaits review', () => {
    for (const id of IDS) {
      for (const sec of ['titles', 'notes', 'footnotes', 'no_data_by_question']) {
        expect(strings.en[sec][id]).toBeTruthy();
        expect(strings.hi[sec][id]).toBeTruthy();
      }
      expect(Object.keys(strings.hi.hero[id]).sort()).toEqual(Object.keys(strings.en.hero[id]).sort());
    }
    expect(Object.keys(strings.hi.no_data_by_question).sort()).toEqual(Object.keys(strings.en.no_data_by_question).sort());
    for (const k of ['ui.category_expenses', 'card.staff_pay', 'titles.expenses_month', 'hero.top_expenses.caption',
      'footnotes.expenses_vs_last', 'links.reports_expenses', 'no_data_by_question.expenses_vs_last']) {
      expect(strings.hi.review_pending).toContain(k);
    }
    expect(strings.en.review_pending).toEqual([]);
  });

  it('the link opens the Expenses report on the answer\'s own dates', () => {
    expect(screenPath('reports_expenses', { from: '2026-06-01', to: '2026-06-25' }))
      .toBe('/reports?tab=EXPENSES&from=2026-06-01&to=2026-06-25');
  });
});

describe('expenses: periods', () => {
  // sameDaysLastMonth is shared with purchases_month; these pin what Expenses relies on.
  it('compares with the same days of last month, not the days just before', () => {
    expect(sameDaysLastMonth('2026-11-10')).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(sameDaysLastMonth('2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-15' });
  });
  it('stops at the last day of a shorter month', () => {
    expect(sameDaysLastMonth('2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(sameDaysLastMonth('2028-03-30')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(sameDaysLastMonth('2026-05-31')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });
});

describe('expenses: reads', () => {
  it('expenses_month reads month to date and the same days last month, and keeps drawings out of the total', async () => {
    const db = summaryDb({ '2026-06-01': { ...JUNE, drawings_total: 5000, drawings_count: 1 }, '2026-05-01': MAY });
    const r = await run('expenses_month', db);
    expect(db.calls.map((c) => [c.p_from, c.p_to])).toEqual([['2026-06-01', '2026-06-25'], ['2026-05-01', '2026-05-25']]);
    expect(r.params).toEqual({ from: '2026-06-01', to: '2026-06-25' });
    expect(r.figures).toMatchObject({ total: 35441, entry_count: 11, drawings_total: 5000, drawings_count: 1,
      previous_total: 31367, previous_from: '2026-05-01', previous_to: '2026-05-25', change_pct: 13 });
    expect(r.figures.entries).toBeUndefined();   // the list is not this question's
    expect(r.empty).toBe(false);
  });

  it('top_expenses asks for 10 and keeps the total over every entry', async () => {
    const db = summaryDb({ '2026-06-01': JUNE });
    const r = await run('top_expenses', db);
    expect(db.calls).toEqual([{ name: 'ai_expense_summary', p_from: '2026-06-01', p_to: '2026-06-25', p_limit: 10 }]);
    expect(r.figures).toMatchObject({ total: 35441, entry_count: 11 });
    expect(r.figures.entries).toHaveLength(3);
  });

  it('expenses_vs_last ranks categories by the biggest increase, and a category new or gone counts against 0', async () => {
    const cur = { ...JUNE, categories: [...JUNE.categories, { category: 'Repairs', amount: 500, entry_count: 1 }], category_count: 7 };
    const prev = { ...MAY, categories: [...MAY.categories, { category: 'Packing', amount: 300, entry_count: 1 }], category_count: 7 };
    const r = await run('expenses_vs_last', summaryDb({ '2026-06-01': cur, '2026-05-01': prev }));
    expect(r.figures.categories.map((c) => [c.category, c.change])).toEqual([
      ['Interest', 4531], ['Repairs', 500], ['Transport', 325], ['Salary', 0], ['Rent', 0],
      ['Utilities', -281], ['Packing', -300], ['Other', -501],
    ]);
    expect(r.figures.categories.find((c) => c.category === 'Repairs')).toMatchObject({ previous_amount: 0, change_pct: null });
    expect(r.figures).toMatchObject({ total: 35441, change: 4074, change_pct: 13, category_count: 8, categories_up: 3, categories_down: 3 });
  });

  it('a failed read throws, never a zero', async () => {
    await expect(run('expenses_month', summaryDb({ '2026-06-01': JUNE }))).rejects.toBeInstanceOf(ReadFailed);
    await expect(run('top_expenses', summaryDb({}))).rejects.toBeInstanceOf(ReadFailed);
  });

  it('a comparison over a cut category list is a failed read', async () => {
    const cut = { ...JUNE, category_count: 60 };
    await expect(run('expenses_vs_last', summaryDb({ '2026-06-01': cut, '2026-05-01': MAY }))).rejects.toBeInstanceOf(ReadFailed);
  });

  it('is empty only when neither period has an entry', async () => {
    const none = { ...MAY, total: 0, entry_count: 0, categories: [], category_count: 0 };
    expect((await run('expenses_month', summaryDb({ '2026-06-01': none, '2026-05-01': none }))).empty).toBe(true);
    expect((await run('expenses_month', summaryDb({ '2026-06-01': none, '2026-05-01': MAY }))).empty).toBe(false);
    expect((await run('top_expenses', summaryDb({ '2026-06-01': none }))).empty).toBe(true);
  });

  it('compareCategories leaves change_pct null without a positive base', () => {
    expect(compareCategories([{ category: 'A', amount: 10 }], [])).toEqual([
      { category: 'A', amount: 10, previous_amount: 0, change: 10, change_pct: null }]);
  });
});

const MONTH_FIG = {
  period_from: '2026-06-01', period_to: '2026-06-25', as_of: 'x', total: 35441, entry_count: 11,
  categories: JUNE.categories, category_count: 6, drawings_total: 0, drawings_count: 0,
  previous_total: 31367, previous_entry_count: 10, previous_from: '2026-05-01', previous_to: '2026-05-25', change_pct: 13,
};
const TOP_FIG = { period_from: '2026-06-01', period_to: '2026-06-25', as_of: 'x', total: 35441, entry_count: 11,
  entries: JUNE.entries, drawings_total: 0, drawings_count: 0 };
const VS_FIG = { period_from: '2026-06-01', period_to: '2026-06-25', as_of: 'x', total: 35441, entry_count: 11,
  previous_total: 31367, previous_entry_count: 10, previous_from: '2026-05-01', previous_to: '2026-05-25',
  change: 4074, change_pct: 13, category_count: 6, categories_up: 2, categories_down: 2,
  categories: compareCategories(JUNE.categories, MAY.categories) };

describe('expenses: cards', () => {
  it('expenses_month: the total, the categories, and the same days last month', () => {
    const c = buildCard('expenses_month', MONTH_FIG, strings.en);
    expect(c.title).toBe('Spent this month');
    expect(c.hero).toMatchObject({ value: 35441, kind: 'money', caption: 'Spent, 1 to 25 Jun, 11 entries',
      detail: '▲ 13.0% vs ₹31,367.00 for 1 to 25 May' });
    expect(c.table.rows[0]).toEqual(['Salary', 1, 12000]);
    expect(c.rows_after).toEqual([{ label: 'Total spent', value: 35441, kind: 'money', tone: 'total' }]);
    expect(c.note).toContain('GST included');
    expect(c.footnote).toBeNull();
  });

  it('expenses_month: owner drawings shown apart, and a cut category list says so', () => {
    const c = buildCard('expenses_month', { ...MONTH_FIG, drawings_total: 5000, drawings_count: 1,
      categories: MONTH_FIG.categories.slice(0, 2), category_count: 6 }, strings.en);
    expect(c.rows_after[1]).toEqual({ label: 'Owner drawings, kept out of profit', value: 5000, kind: 'money' });
    expect(c.hero.value).toBe(35441);
    expect(c.footnote).toBe('Top 2 of 6 categories shown. The total covers all 6.');
  });

  it('top_expenses: biggest first, a payroll entry as Staff pay, the total over every entry', () => {
    const c = buildCard('top_expenses', TOP_FIG, strings.en);
    expect(c.hero).toMatchObject({ value: 12000, caption: 'Biggest: Salary on 3 Jun', detail: '₹35,441.00 spent over all 11 entries' });
    expect(c.table.columns.map((x) => x.label)).toEqual(['Date', 'Category', 'Details', 'Amount']);
    expect(c.table.rows[0]).toEqual(['3 Jun', 'Salary', 'Staff pay', 12000]);
    expect(c.table.rows[1]).toEqual(['3 Jun', 'Rent', 'Shop rent June', 8000]);
    expect(c.footnote).toBe('Top 3 of 11 entries shown. The total covers all 11.');
  });

  it('expenses_vs_last: change per category, signed, and where last month\'s figures are', () => {
    const c = buildCard('expenses_vs_last', VS_FIG, strings.en);
    expect(c.hero).toMatchObject({ value: 35441, caption: 'Spent, 1 to 25 Jun',
      detail: '▲ 13.0% vs ₹31,367.00, same days last month (1–25 May)' });
    expect(c.table.rows[0]).toEqual(['Interest', 9415, 4884, '+₹4,531.00']);
    expect(c.table.rows.at(-1)).toEqual(['Other', 711, 1212, '-₹501.00']);
    expect(c.rows_after[1]).toEqual({ label: 'Same days last month (1–25 May)', value: 31367, kind: 'money' });
    expect(c.footnote).toBe('The report opens on this month\'s dates. Set it to 1 to 25 May to check last month.');
  });

  it('every card draws in Hindi with the same shape', () => {
    for (const [id, f] of [['expenses_month', MONTH_FIG], ['top_expenses', TOP_FIG], ['expenses_vs_last', VS_FIG]]) {
      const en = buildCard(id, f, strings.en);
      const hi = buildCard(id, f, strings.hi);
      expect(hi.title).toBe(strings.hi.titles[id]);
      expect(hi.table.rows.length).toBe(en.table.rows.length);
      expect(hi.hero.value).toBe(en.hero.value);
      expect(hi.hero.caption).not.toBe(en.hero.caption);
    }
    expect(buildCard('top_expenses', TOP_FIG, strings.hi).table.rows[0][2]).toBe('स्टाफ़ वेतन');
  });

  it('empty: the fixed line, no detail and no footnote', () => {
    const c = buildCard('top_expenses', { ...TOP_FIG, entries: [], total: 0, entry_count: 0 }, strings.en, true);
    expect(c.hero.caption).toBe('No expenses recorded yet this month.');
    expect(c.hero.detail).toBeNull();
    expect(c.footnote).toBeNull();
  });
});

describe('expenses: stand-ins', () => {
  it('no category, description, staff name or phone reaches the model', () => {
    const { view, map } = toModelFigures(TOP_FIG);
    const sent = JSON.stringify(view);
    for (const secret of ['Salary', 'Rent', 'Interest', 'Shop rent', 'Ramesh', '9876543210', 'description']) {
      expect(sent).not.toContain(secret);
    }
    expect(view.entries.map((e) => e.category)).toEqual(['[E1]', '[E2]', '[E3]']);
    expect(view.entries[0]).toEqual({ date: '2026-06-03', category: '[E1]', amount: 12000, from_payroll: true });
    expect(map).toEqual({ '[E1]': 'Salary', '[E2]': 'Rent', '[E3]': 'Interest' });
  });

  it('a category is one token wherever it appears, the biggest category first', () => {
    const { view, map } = toModelFigures({ ...MONTH_FIG, entries: [{ date: '2026-06-03', category: 'Rent', amount: 8000 }] });
    expect(view.categories.map((c) => c.category)).toEqual(['[E1]', '[E2]', '[E3]', '[E4]', '[E5]', '[E6]']);
    expect(view.entries[0].category).toBe('[E3]');
    expect(map['[E3]']).toBe('Rent');
  });

  it('a category that looks like a phone number still maps back to its name', () => {
    const { view, map } = toModelFigures({ categories: [{ category: '98765 43210', amount: 5 }] });
    expect(JSON.stringify(view)).not.toContain('98765');
    expect(map['[E1]']).toBe('98765 43210');
  });

  it('the owner reads real names; [E1] never clips [E10]', () => {
    expect(restoreNames('[E1] rose most; [E10] fell.', { '[E1]': 'Salary', '[E10]': 'Rent' })).toBe('Salary rose most; Rent fell.');
  });
});

describe('expenses: number guard', () => {
  const guard = (text, figures) => {
    const { view, map } = toModelFigures(figures);
    return checkReply(text, view, map);
  };
  it('allows the figures as the card states them', () => {
    expect(guard('You spent ₹35,441 over 11 entries from 1 to 25 June, 13% more than the same days in May. [E1] was the biggest at ₹12,000.', MONTH_FIG).ok).toBe(true);
    expect(guard('Your biggest expense was [E1] at ₹12,000 on 3 June, out of ₹35,441 in total.', TOP_FIG).ok).toBe(true);
    expect(guard('You spent ₹4,074 more than the same days last month. [E1] rose the most, by ₹4,531.', VS_FIG).ok).toBe(true);
  });
  it('rejects a sum, a share or a stand-in the figures do not hold', () => {
    expect(guard('Salary and rent together came to ₹20,000.', MONTH_FIG).ok).toBe(false);
    expect(guard('[E1] was about a third of your spending.', MONTH_FIG).ok).toBe(false);
    expect(guard('[E7] was new this month.', MONTH_FIG).ok).toBe(false);
    expect(guard('You spent 13% less than last month.', VS_FIG)).toEqual({ ok: false, reason: 'direction:13%' });
    expect(guard('Your top 4 expenses were large.', TOP_FIG).ok).toBe(false);
  });
});

describe('expenses: the whole flow', () => {
  it('stand-ins reach the model, real names reach the owner, and the card links to the report', async () => {
    const calls = [];
    const db = {
      auth: { getUser: async () => ({ data: { user: { id: 'USER' } } }) },
      from: (table) => {
        const rows = { tenants: { status: 'ACTIVE', settings: { ai_enabled: true, ai_chat_available: true } },
          business_profile: { tax_mode: 'EXCLUSIVE', timezone: 'Asia/Kolkata' }, ai_answer_cache: null, product_batches: [] };
        const q = {};
        for (const m of ['select', 'eq', 'is', 'not', 'limit']) q[m] = () => q;
        q.maybeSingle = async () => ({ data: rows[table], error: null });
        return q;
      },
      rpc: async (name, args) => {
        calls.push(name);
        const h = {
          current_tenant_id: () => 'T1', is_tenant_admin: () => true, get_my_effective_plan: () => 'PRO',
          plan_modules: () => ['expenses', 'reports'], ai_expense_summary: () => JUNE,
          ai_usage_claim: () => ({ ok: true, id: 'U1' }),
        };
        return { data: h[name]?.(args) ?? null, error: null };
      },
    };
    const model = vi.fn(async () => ({ text: 'Your biggest expense was [E1] at ₹12,000.', stopReason: 'end_turn', inputTokens: 1, cachedTokens: 0, outputTokens: 1 }));
    const req = new Request('https://x/ai-ask', { method: 'POST', headers: { Authorization: 'Bearer good' },
      body: JSON.stringify({ action: 'ask', question_id: 'top_expenses', lang: 'en' }) });
    const res = await handle(req, { ai: { name: 'f', model: 'm', configured: true, ask: model }, db: () => db,
      now: () => new Date('2026-06-25T06:00:00Z'), cors: {} });
    const body = await res.json();
    expect(res.status).toBe(200);
    const prompt = model.mock.calls[0][1];
    expect(prompt).not.toContain('Salary');
    expect(prompt).not.toContain('Ramesh');
    expect(body.text).toBe('Your biggest expense was Salary at ₹12,000.');
    expect(body.screen).toMatchObject({ key: 'reports_expenses', mobile: false, params: { from: '2026-06-01', to: '2026-06-25' } });
    expect(body.card.hero.value).toBe(12000);
  });
});
