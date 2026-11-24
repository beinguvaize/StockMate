import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCard } from '../../supabase/functions/ai-ask/cards.ts';
import { checkReply } from '../../supabase/functions/ai-ask/guard.ts';
import { toModelFigures } from '../../supabase/functions/ai-ask/standins.ts';
import { runQuestion } from '../../supabase/functions/ai-ask/runs.ts';
import { SYSTEM_PROMPT } from '../../supabase/functions/ai-ask/prompt.ts';
import { screenPath } from './askFormat';
import strings from '../../shared/ai_chat/strings.json';

// ── Dues and cash (ask-dues-cash) ───────────────────────────────────────────
// Figures are what the new SQL returned on prod, read only, with names and ids
// replaced: FUTURE DISPO for dues and the Day Book days, Demo Kirana Store for
// June. Each was checked against the linked screen's own rule over the same rows.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const IDS = ['dues_overdue', 'credit_sales_month', 'cash_today', 'payment_mix_month'];

const OVER60 = {
  period_from: '2026-11-11', period_to: '2026-11-11', as_of: 'x', days: 60, age_bounds: [60, 90, 120],
  total_over: 12323.04, bills_over: 13, customers_over: 7, oldest_days: 153,
  aged_61_90: 6629.04, aged_91_120: 3734, aged_over_120: 1960, total_unpaid: 71570.54,
  customers: [
    { client_id: 'C-1', name: 'Shop One', amount_over: 7305, bills_over: 2, oldest_days: 102 },
    { client_id: 'C-2', name: 'Shop Two', amount_over: 3705, bills_over: 4, oldest_days: 153 },
    { client_id: 'C-3', name: 'Shop Three', amount_over: 884.04, bills_over: 2, oldest_days: 90 },
  ],
};
// FUTURE DISPO, 1-11 Nov: eight credit bills, none paid; four part-paid cash bills.
const CREDIT = {
  period_from: '2026-11-01', period_to: '2026-11-11', as_of: 'x', credit_billed: 26656, credit_bills: 8,
  credit_collected: 0, credit_open: 26656, credit_open_bills: 8, other_open: 4213, other_open_bills: 4,
  sales_total: 103617.5, credit_share_pct: 25.7, screen_credit_collected: 0,
};
// Demo Kirana Store, June: two part-paid credit bills.
const CREDIT_JUNE = {
  ...CREDIT, period_from: '2026-06-01', period_to: '2026-06-30', credit_billed: 9464, credit_bills: 7,
  credit_collected: 2242, credit_open: 7222, credit_open_bills: 7, other_open: 0, other_open_bills: 0,
  sales_total: 115975.9, credit_share_pct: 8.2, screen_credit_collected: 2242,
};
// FUTURE DISPO, 31 Oct: ₹9,564 of customer payments were recorded with mode CREDIT_SALE.
const CASH_31OCT = {
  period_from: '2026-10-31', period_to: '2026-10-31', as_of: 'x', money_in: 26959, money_out: 36335, net: -9376,
  in_by_type: [{ type: 'SALE', amount: 16265 }, { type: 'PAYMENT', amount: 10694 }],
  out_by_type: [{ type: 'PURCHASE', amount: 33455 }, { type: 'EXPENSE', amount: 2880 }],
  accounts: [{ account_id: 'A-1', label: 'Cash drawer', type: 'CASH', money_in: 17395, money_out: 36335 },
    { account_id: 'A-2', label: 'Main bank', type: 'BANK', money_in: 9564, money_out: 0 }],
  daybook_in: 17395, daybook_out: 36335,
  unlisted: [{ type: 'PAYMENT', mode: 'CREDIT_SALE', direction: 'IN', amount: 9564 }],
  residual_in: 0, residual_out: 0,
};
// FUTURE DISPO, 9 Nov: the ledger and the Day Book agree to the paisa.
const CASH_9NOV = {
  ...CASH_31OCT, period_from: '2026-11-09', period_to: '2026-11-09', money_in: 23975.5, money_out: 30965, net: -6989.5,
  in_by_type: [{ type: 'SALE', amount: 21099.5 }, { type: 'PAYMENT', amount: 2876 }],
  out_by_type: [{ type: 'PURCHASE', amount: 27630 }, { type: 'EXPENSE', amount: 3335 }],
  daybook_in: 23975.5, daybook_out: 30965, unlisted: [],
};
// FUTURE DISPO, 3 Jul: manual entries, and bills the ledger holds differently.
const CASH_3JUL = {
  ...CASH_31OCT, money_in: 126644.07, money_out: 129205.22, daybook_in: 2000, daybook_out: 30215,
  unlisted: [{ type: 'MANUAL', mode: 'CASH', direction: 'IN', amount: 124719.07 }, { type: 'MANUAL', mode: 'CASH', direction: 'OUT', amount: 95890.22 }],
  residual_in: -75, residual_out: 3100,
};
const MIX_JUNE = {
  period_from: '2026-06-01', period_to: '2026-06-30', as_of: 'x', gross_sales: 115975.9, bill_count: 101, unrecorded_amount: 0,
  by_method: [{ method: 'CASH', amount: 47870.6, bill_count: 53, share_pct: 41.3 }, { method: 'UPI', amount: 43094, bill_count: 30, share_pct: 37.2 },
    { method: 'BANK', amount: 15236, bill_count: 10, share_pct: 13.1 }, { method: 'CREDIT', amount: 9464, bill_count: 7, share_pct: 8.2 },
    { method: 'CARD', amount: 311.3, bill_count: 1, share_pct: 0.3 }],
};

describe('dues and cash: registry and strings', () => {
  const reg = JSON.parse(read('../../shared/ai_chat/questions.json'));
  it('sit in the existing dues and cash categories, next to the questions already there', () => {
    expect(reg.questions.filter((q) => q.category === 'dues').map((q) => q.id))
      .toEqual(['top_dues', 'dues_age', 'collections_week', 'dues_overdue', 'credit_sales_month']);
    expect(reg.questions.filter((q) => q.category === 'cash').map((q) => q.id)).toEqual(['cash_bank', 'cash_today', 'payment_mix_month']);
    expect(reg.questions.find((q) => q.id === 'dues_overdue').screen.key).toBe('reports_customer_aging');
    expect(reg.questions.find((q) => q.id === 'cash_today').screen.key).toBe('daybook');
  });
  it('have every string a card needs, in both languages, with the same keys', () => {
    for (const lang of ['en', 'hi']) {
      for (const id of IDS) {
        expect(strings[lang].titles[id]).toBeTruthy();
        expect(strings[lang].hero[id]).toBeTruthy();
        expect(strings[lang].footnotes[id]).toBeTruthy();
        expect(strings[lang].no_data_by_question[id]).toBeTruthy();
      }
      expect(strings[lang].links.reports_customer_aging).toBeTruthy();
      expect(strings[lang].links.reports_business).toBeTruthy();
    }
    expect(Object.keys(strings.hi.ref_types).sort()).toEqual(Object.keys(strings.en.ref_types).sort());
    for (const id of IDS) expect(Object.keys(strings.hi.hero[id]).sort()).toEqual(Object.keys(strings.en.hero[id]).sort());
    // Hindi is paused: every new Hindi string waits for review.
    expect(strings.hi.review_pending).toContain('titles.cash_today');
    expect(strings.hi.review_pending).toContain('ref_types.LOAN_EMI');
  });
  it('the links open the matching screens, the Business Report on the answer\'s dates', () => {
    expect(screenPath('reports_customer_aging', { from: '2026-11-11', to: '2026-11-11' })).toBe('/reports?tab=AR_AGING');
    expect(screenPath('reports_business', { from: '2026-11-01', to: '2026-11-11' })).toBe('/reports?tab=BUSINESS&from=2026-11-01&to=2026-11-11');
    expect(read('../components/reports/BusinessReport.jsx')).toContain('useLinkedRange');
  });
  it('the prompt lets the model state the shares it is given, and nothing else new', () => {
    expect(SYSTEM_PROMPT).toContain('share_pct');
    expect(SYSTEM_PROMPT).toContain('Sales on credit are billed, not money received.');
  });
});

describe('dues_overdue', () => {
  const card = buildCard('dues_overdue', OVER60, strings.en);
  it('is the Customer Aging report\'s 61-90, 91-120 and 120+ columns, row by row', () => {
    expect(card.hero).toMatchObject({ value: 12323.04, kind: 'money', caption: 'Unpaid for over 60 days, 7 customers, 13 bills',
      detail: 'Oldest bill unpaid for 153 days' });
    expect(card.rows_after.map((r) => [r.label, r.value])).toEqual([
      ['61 to 90 days', 6629.04], ['91 to 120 days', 3734], ['More than 120 days', 1960],
      ['Unpaid over 60 days', 12323.04], ['All unpaid, any age', 71570.54]]);
    expect(card.table.rows[1]).toEqual(['Shop Two', '153 days', 3705]);
    expect(card.footnote).toContain("Top 3 of 7 customers shown. The total covers all 7. These are the Customer Aging report's 61-90, 91-120 and 120+ day columns");
  });
  it('the buckets add up to the total, as on the screen', () => {
    expect(Math.round((OVER60.aged_61_90 + OVER60.aged_91_120 + OVER60.aged_over_120) * 100) / 100).toBe(OVER60.total_over);
  });
  it('customer names go as stand-ins, and no id leaves', () => {
    const { view, map } = toModelFigures(OVER60);
    expect(view.customers.map((c) => c.name)).toEqual(['[C1]', '[C2]', '[C3]']);
    expect(map['[C2]']).toBe('Shop Two');
    expect(JSON.stringify(view)).not.toMatch(/Shop|C-1|client_id/);
    expect(checkReply('[C2] owes ₹3,705, with a bill unpaid for 153 days, ₹1,960 of it for more than 120 days.', view, map).ok).toBe(true);
    expect(checkReply('[C1] is overdue.', view, map).ok).toBe(false);
  });
  it('says plainly when nothing is that old', () => {
    expect(buildCard('dues_overdue', { ...OVER60, customers: [] }, strings.en, true).hero.caption).toBe('No bill has been unpaid for over 60 days.');
  });
});

describe('credit_sales_month', () => {
  it('matches the Business Report Credit bar, and says what Customer Aging counts', () => {
    const card = buildCard('credit_sales_month', CREDIT, strings.en);
    expect(card.hero).toMatchObject({ value: 26656, caption: 'Sold on credit, 1 to 11 Nov, 8 bills', detail: '25.7% of your sales of ₹1,03,617.50' });
    expect(card.rows.map((r) => r.value)).toEqual([26656, 0, 26656, 4213]);
    expect(card.footnote).toBe("Sold on credit and collected match the Business Report's Credit bar for these dates. Still unpaid is what the Customer Aging report counts for these bills.");
    expect(buildCard('credit_sales_month', CREDIT_JUNE, strings.en).rows.map((r) => r.value)).toEqual([9464, 2242, 7222, 0]);
  });
  it('says the exact gap when the report reads payment status differently', () => {
    const card = buildCard('credit_sales_month', { ...CREDIT_JUNE, screen_credit_collected: 4483 }, strings.en);
    expect(card.footnote).toBe("The Business Report's Credit bar shows ₹4,483.00 collected, ₹2,241.00 more: it counts a bill as collected from its payment status, not from the amount paid on it. Still unpaid is what the Customer Aging report counts for these bills.");
  });
});

describe('cash_today', () => {
  it('equals the Day Book when they agree, by type and in total', () => {
    const card = buildCard('cash_today', CASH_9NOV, strings.en);
    expect(card.hero).toMatchObject({ value: -6989.5, caption: 'Money in less money out, 9 Nov', detail: '₹23,975.50 in, ₹30,965.00 out' });
    expect(card.rows.map((r) => [r.label, r.value])).toEqual([
      ['Sales', 21099.5], ['Customer payments', 2876], ['Money in', 23975.5],
      ['Purchases', 27630], ['Expenses', 3335], ['Money out', 30965], ['Net today', -6989.5]]);
    expect(card.footnote).toBe("From your accounts' ledger. Transfers between your own accounts are left out.");
  });
  it('names each ledger entry the Day Book does not list, with its size', () => {
    expect(buildCard('cash_today', CASH_31OCT, strings.en).footnote).toBe(
      "From your accounts' ledger. Transfers between your own accounts are left out. The Day Book shows ₹17,395.00 in and ₹36,335.00 out today. "
      + 'It does not list these ledger entries: Customer payments by CREDIT_SALE, ₹9,564.00 in.'.replace('CREDIT_SALE', 'Credit sale'));
  });
  it('and whatever is left, each way', () => {
    const f = buildCard('cash_today', CASH_3JUL, strings.en).footnote;
    expect(f).toContain('It does not list these ledger entries: Manual entries, ₹1,24,719.07 in; Manual entries, ₹95,890.22 out.');
    expect(f).toContain('The Day Book shows another ₹75.00 in that is not in the ledger');
    expect(f).toContain('Another ₹3,100.00 out here is not in the Day Book');
  });
  it('the parts add up to the gap exactly', () => {
    for (const x of [CASH_31OCT, CASH_9NOV, CASH_3JUL]) {
      const unl = (d) => x.unlisted.filter((u) => u.direction === d).reduce((s, u) => s + u.amount, 0);
      expect(Math.round((x.money_in - unl('IN') - x.residual_in) * 100) / 100).toBe(x.daybook_in);
      expect(Math.round((x.money_out - unl('OUT') - x.residual_out) * 100) / 100).toBe(x.daybook_out);
    }
  });
  it('account names go as stand-ins', () => {
    const { view, map } = toModelFigures(CASH_31OCT);
    expect(view.accounts.map((a) => a.label)).toEqual(['[A1]', '[A2]']);
    expect(JSON.stringify(view)).not.toMatch(/Cash drawer|Main bank|account_id/);
    expect(checkReply('[A2] took in ₹9,564 today. The Day Book shows ₹17,395 in.', view, map).ok).toBe(true);
    expect(checkReply('You are ₹9,000 down today.', view, map).ok).toBe(false);
  });
});

describe('payment_mix_month', () => {
  it('splits sales by method with shares, as billed in the Business Report', () => {
    const card = buildCard('payment_mix_month', MIX_JUNE, strings.en);
    expect(card.hero).toMatchObject({ value: 115975.9, caption: 'Sales, 1 to 30 Jun, 101 bills' });
    expect(card.table.rows[0]).toEqual(['Cash', 53, 47870.6, 41.3]);
    expect(card.table.columns.map((c) => c.kind)).toEqual(['text', 'count', 'money', 'percent']);
    expect(card.table.bars).toEqual([41.3, 37.2, 13.1, 8.2, 0.3]);
    expect(card.footnote).not.toContain('no payment method');
  });
  it('says when the report counts bills with no method as cash', () => {
    const f = { ...MIX_JUNE, unrecorded_amount: 1200, by_method: [...MIX_JUNE.by_method, { method: 'UNKNOWN', amount: 1200, bill_count: 2, share_pct: 1 }] };
    const card = buildCard('payment_mix_month', f, strings.en);
    expect(card.table.rows.at(-1)[0]).toBe('Not recorded');
    expect(card.footnote).toContain('The Business Report counts the ₹1,200.00 with no payment method recorded as Cash.');
  });
  it('the guard allows the shares it is given and no others', () => {
    const { view } = toModelFigures(MIX_JUNE);
    expect(checkReply('Cash was ₹47,870.60, 41.3% of sales, and UPI 37.2%.', view, {}).ok).toBe(true);
    expect(checkReply('Cash and UPI were 78.5% of sales.', view, {}).ok).toBe(false);
  });
});

describe('dues and cash: reads', () => {
  const fake = (returns) => {
    const calls = [];
    return { calls, rpc: async (name, args) => { calls.push([name, args]); return { data: returns[name], error: null }; } };
  };
  it('ask for this month to date, and today', async () => {
    const db = fake({ ai_credit_sales: CREDIT, ai_payment_mix: MIX_JUNE, ai_cash_today: CASH_9NOV, ai_dues_over_60: OVER60 });
    const ctx = { tenantId: 't', today: '2026-11-11', taxMode: null };
    expect((await runQuestion('credit_sales_month', db, ctx)).params).toEqual({ from: '2026-11-01', to: '2026-11-11' });
    expect((await runQuestion('payment_mix_month', db, ctx)).params).toEqual({ from: '2026-11-01', to: '2026-11-11' });
    expect((await runQuestion('cash_today', db, ctx)).empty).toBe(false);
    const dues = await runQuestion('dues_overdue', db, ctx);
    expect(dues.figures.age_bounds).toEqual([60, 90, 120]);
    expect(db.calls.map((c) => c[0])).toEqual(['ai_credit_sales', 'ai_payment_mix', 'ai_cash_today', 'ai_dues_over_60']);
    expect(db.calls[0][1]).toEqual({ p_from: '2026-11-01', p_to: '2026-11-11' });
  });
  it('an empty day is empty, a failed read throws', async () => {
    const zero = { ...CASH_9NOV, money_in: 0, money_out: 0, daybook_in: 0, daybook_out: 0 };
    expect((await runQuestion('cash_today', fake({ ai_cash_today: zero }), { today: '2026-11-11' })).empty).toBe(true);
    const bad = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    await expect(runQuestion('dues_overdue', bad, { today: '2026-11-11' })).rejects.toThrow('ai_dues_over_60: boom');
  });
});
