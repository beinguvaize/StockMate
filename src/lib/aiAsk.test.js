import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkReply } from '../../supabase/functions/ai-ask/guard.ts';
import { toModelFigures, restoreNames, figuresHash } from '../../supabase/functions/ai-ask/standins.ts';
import { handle, CONTRACT_VERSION } from '../../supabase/functions/ai-ask/handler.ts';
import { buildCard, gstScreenChecks } from '../../supabase/functions/ai-ask/cards.ts';
import { SYSTEM_PROMPT } from '../../supabase/functions/ai-ask/prompt.ts';
import { priorWindow, mondayOf, lastMonth, shopToday, changePct, sameDaysLastWeek, sameDaysLastMonth } from '../../supabase/functions/ai-ask/periods.ts';
import { runQuestion } from '../../supabase/functions/ai-ask/runs.ts';
import strings from '../../shared/ai_chat/strings.json';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const SALES = {
  period_from: '2026-11-04', period_to: '2026-11-04', as_of: '2026-11-04T10:00:00Z',
  gross_sales: 234567.5, bill_count: 31, average_bill: 7566.69, returns_amount: 0,
  by_method: [{ method: 'CASH', amount: 234567.5 }], previous_gross_sales: 10000, change_pct: 24.5,
};
const ITEMS = { distinct_items_sold: 2, items: [{ product_name: 'Parle-G 500g', qty_sold: 12 }, { product_name: 'Rice', qty_sold: 3 }] };
const none = {};

describe('the shared registry', () => {
  it('the function bundles an exact copy of shared/ai_chat', () => {
    for (const f of ['questions.json', 'strings.json']) {
      expect(read(`../../supabase/functions/ai-ask/${f}`)).toBe(read(`../../shared/ai_chat/${f}`));
    }
  });
  it('every question has a label in every language, and every string set has the same keys', () => {
    const reg = JSON.parse(read('../../shared/ai_chat/questions.json'));
    expect(reg.questions).toHaveLength(23);
    for (const q of reg.questions) for (const l of reg.languages) expect(q.label[l]).toBeTruthy();
    for (const k of ['ui', 'card', 'hero', 'titles', 'notes', 'footnotes', 'links', 'methods', 'no_data_by_question']) {
      expect(Object.keys(strings.hi[k]).sort()).toEqual(Object.keys(strings.en[k]).sort());
    }
  });
  it('the system prompt is long enough for prompt caching', () => {
    // 512 tokens is the floor; words undercount tokens, so this is conservative.
    expect(SYSTEM_PROMPT.split(/\s+/).length).toBeGreaterThan(450);
  });
});

describe('number guard: allowed', () => {
  const ok = (t, f = SALES, m = none) => expect(checkReply(t, f, m)).toEqual({ ok: true });
  it('exact, comma-grouped and whole-rupee figures', () => {
    ok('You sold ₹2,34,567.50 across 31 bills.');
    ok('You sold ₹234567.50 today.');
    ok('You sold ₹2,34,568 today.');
  });
  it('lakh forms at 1 or 2 decimals, in both languages', () => {
    ok('Sales were ₹2.35 lakh.');
    ok('Sales were ₹2.3 lakh.', { gross_sales: 230000 });
    ok('बिक्री ₹2.35 लाख रही।');
  });
  it('percent from the figures, and negatives by absolute value', () => {
    ok('That is 24.5% more than last week.');
    ok('Down 12.5 percent.', { change_pct: -12.5 });
  });
  it('digits inside a product name do not count as numbers', () => {
    ok('Parle-G 500g sold 12 units, the most of your 2 items.', ITEMS);
  });
  it('dates in the figures, in the forms people write', () => {
    ok('As of 4 Nov you sold ₹234567.50.');
    ok('On 2026-11-04 you sold 31 bills.');
    ok('4 नवंबर को 31 बिल बने।');
  });
  it('a bucket label may be said', () => {
    ok('₹500 has been unpaid for 31 to 60 days.', { buckets: [{ label: '31-60', amount: 500, bill_count: 2 }] });
  });
  it('a stand-in that was issued', () => {
    ok('[C1] owes ₹500.', { customers: [{ name: '[C1]', outstanding: 500 }] }, { '[C1]': 'Ramesh' });
  });
});

describe('gst_collected gaps with the GSTR-3B screen', () => {
  const f = (extra) => ({ period_from: '2026-05-01', period_to: '2026-05-31', output_gst: 12381.21, taxable_sales: 147678.79,
    last_month_output_gst: 0, last_month_from: '2026-04-01', gstr3b_books_gst: 12381.21, gstr3b_bill_count: 149, ...extra });
  it('states the GST gap and the rounding gap, each with its size, when both exist', () => {
    const card = buildCard('gst_collected', f({ gstr3b_gst: 12381.5, bill_rounding: 6.79 }), strings.en);
    expect(card.footnote).toBe("GSTR-3B shows ₹0.29 more GST: it rounds CGST and SGST for each tax rate on a bill; your bills round GST once per bill. ₹6.79 of bill totals is rounding not recorded as round-off, so the sales row above is ₹6.79 more than GSTR-3B's taxable value.");
  });
  it('a gap of rupees within the rounding limit is stated as it is', () => {
    expect(buildCard('gst_collected', f({ gstr3b_gst: 12383.21, bill_rounding: 0 }), strings.en).footnote)
      .toBe('GSTR-3B shows ₹2.00 more GST: it rounds CGST and SGST for each tax rate on a bill; your bills round GST once per bill.');
    expect(buildCard('gst_collected', f({ gstr3b_gst: 12380.21, bill_rounding: 0 }), strings.hi).footnote)
      .toBe('GSTR-3B में GST ₹1.00 कम दिखता है: वह हर बिल पर हर टैक्स दर के लिए CGST और SGST अलग-अलग राउंड करता है; आपके बिल GST को पूरे बिल पर एक बार राउंड करते हैं।');
  });
  it('only the rounding line when GST agrees', () => {
    expect(buildCard('gst_collected', f({ gstr3b_gst: 12381.21, bill_rounding: 6.79 }), strings.en).footnote)
      .toMatch(/^₹6\.79 of bill totals/);
  });
  const PLAIN = "GSTR-3B works GST out again from each bill's lines, and does not match this figure for this period.";
  it('check (a): the check read a different GST from the card, so one plain line', () => {
    expect(gstScreenChecks(f({ gstr3b_gst: 12390.29, bill_rounding: 6.79, gstr3b_books_gst: 12390 }))).toEqual(['books_gst_matches_card']);
    expect(buildCard('gst_collected', f({ gstr3b_gst: 12390.29, bill_rounding: 6.79, gstr3b_books_gst: 12390 }), strings.en).footnote).toBe(PLAIN);
  });
  it('check (b): a GST gap over 2 paise a bill is not rounding', () => {
    // 149 bills allow ₹2.98; ₹3.00 does not pass.
    expect(gstScreenChecks(f({ gstr3b_gst: 12384.19, bill_rounding: 0 }))).toEqual([]);
    expect(gstScreenChecks(f({ gstr3b_gst: 12384.21, bill_rounding: 0 }))).toEqual(['screen_gap_within_rounding']);
    expect(buildCard('gst_collected', f({ gstr3b_gst: 12384.21, bill_rounding: 0 }), strings.en).footnote).toBe(PLAIN);
  });
  it('check (c): unrecorded rounding over 50 paise a bill is not rounding', () => {
    expect(gstScreenChecks(f({ gstr3b_gst: 12381.21, bill_rounding: 74.5 }))).toEqual([]);
    expect(gstScreenChecks(f({ gstr3b_gst: 12381.21, bill_rounding: 74.51 }))).toEqual(['bill_rounding_within_limit']);
    expect(buildCard('gst_collected', f({ gstr3b_gst: 12381.21, bill_rounding: 74.51 }), strings.hi).footnote)
      .toBe('GSTR-3B हर बिल की लाइनों से GST दोबारा निकालता है, और इस अवधि में यह आँकड़ा उससे मेल नहीं खाता।');
  });
  it('dev: no GST in the books but 18% invented by the screen fails (b) and (c)', () => {
    expect(gstScreenChecks(f({ output_gst: 0, gstr3b_books_gst: 0, gstr3b_gst: 3408.3, bill_rounding: 4925, gstr3b_bill_count: 18 })))
      .toEqual(['screen_gap_within_rounding', 'bill_rounding_within_limit']);
  });

  it('no footnote when both gaps are under a paisa', () => {
    expect(buildCard('gst_collected', f({ gstr3b_gst: 12381.214, bill_rounding: 0.004 }), strings.en).footnote).toBeNull();
  });
});

describe('expiring_stock is hidden for every shop until it ties', () => {
  it('is marked hidden in the registry', async () => {
    const reg = JSON.parse(read('../../shared/ai_chat/questions.json'));
    expect(reg.questions.find((q) => q.id === 'expiring_stock').hidden).toBe(true);
  });
});

describe('cash_bank and loan accounts', () => {
  const f = (loan) => ({ total_balance: 117846.08, cash_total: 215695.51, bank_total: -97849.43, today_in: 0, today_out: 0,
    accounts: [{ label: 'Cash', type: 'CASH', balance: 215695.51 }], loan_total: loan });
  it('says the exact gap when a loan account has a balance, in both languages', () => {
    expect(buildCard('cash_bank', f(-250000), strings.en).footnote)
      .toContain('The Accounts screen total also includes loan accounts, which owe ₹2,50,000.00, so it reads -₹1,32,153.92.');
    expect(buildCard('cash_bank', f(-250000), strings.hi).footnote)
      .toContain('Accounts स्क्रीन के कुल में लोन खाते भी जुड़े हैं, जिन पर ₹2,50,000.00 बाकी है, इसलिए वहाँ -₹1,32,153.92 दिखता है।');
    // A positive loan balance keeps the plain line.
    expect(buildCard('cash_bank', f(5000), strings.en).footnote)
      .toContain('The Accounts screen total also includes loan accounts (₹5,000.00), so it reads ₹1,22,846.08.');
  });
  it('says nothing when there is no loan balance', () => {
    for (const loan of [0, undefined]) expect(buildCard('cash_bank', f(loan), strings.en).footnote).not.toContain('loan');
  });
  it('the guard allows the loan figures the card states', () => {
    expect(checkReply('Your loan accounts stand at -₹2,50,000.00.', f(-250000), {}).ok).toBe(true);
  });
});

describe('Hindi month names in AI prose', () => {
  const f = { period_from: '2026-11-01', period_to: '2026-11-18', previous_from: '2026-10-14', previous_to: '2026-10-31', net_profit: 1000 };
  const ok = (t) => checkReply(t, f, {}).ok;
  it('accepts a date in the figures, however it is written', () => {
    expect(ok('18 नवंबर तक मुनाफ़ा ₹1,000.00 है।')).toBe(true);
    expect(ok('1 से 18 नवंबर में मुनाफ़ा ₹1,000.00 है।')).toBe(true);
    expect(ok('14 से 31 अक्टूबर से तुलना।')).toBe(true);
    expect(ok('नवंबर 2026 में मुनाफ़ा ₹1,000.00 है।')).toBe(true);
    expect(ok('नवम्बर 18 को मुनाफ़ा ₹1,000.00 है।')).toBe(true);
    expect(ok('पूरे अक्टूबर में।')).toBe(true);
  });
  it('rejects a Hindi date that is not in the figures', () => {
    expect(ok('19 नवंबर तक मुनाफ़ा ₹1,000.00 है।')).toBe(false);
    expect(ok('1 से 19 नवंबर में।')).toBe(false);
    expect(ok('दिसंबर 2026 में।')).toBe(false);
  });
  it('keeps stand-ins next to a Hindi date', () => {
    expect(checkReply('[C1] ने 18 नवंबर को भुगतान किया।', f, { '[C1]': 'Hotel Arya Bhavan' }).ok).toBe(true);
    expect(restoreNames('[C1] ने 18 नवंबर को भुगतान किया।', { '[C1]': 'Hotel Arya Bhavan' })).toBe('Hotel Arya Bhavan ने 18 नवंबर को भुगतान किया।');
  });
});

describe('number guard: rejected', () => {
  const bad = (t, f = SALES, m = none) => expect(checkReply(t, f, m).ok).toBe(false);
  it('a number not in the figures', () => {
    bad('You sold ₹2,34,999 today.');
    bad('Across 32 bills.');
    bad('That is 26% more.');
  });
  it('a wrong rounding', () => {
    bad('Sales were ₹2.36 lakh.');
    bad('You sold ₹2,34,567 today.');         // .50 rounds up
    bad('Sales were ₹2 lakh.');               // 0 decimals of 2.35 is not offered
  });
  it('a lakh figure that only matches as a plain number', () => {
    bad('Sales were 31 lakh.');
  });
  it('a sum the model worked out itself', () => {
    bad('Together that is ₹20,000.', { a: 8000, b: 12000 });
  });
  it('non-Western digits', () => {
    bad('बिक्री ३१ बिल रही।');
  });
  it('a stand-in that was never issued', () => {
    bad('[C2] owes ₹500.', { outstanding: 500 }, { '[C1]': 'Ramesh' });
  });
  it('spelled-out amounts', () => {
    bad('You sold two lakh rupees of stock.');
    bad('Nearly a lakh came in.');
    bad('बिक्री दो लाख रही।');
    bad('बिक्री पचास हज़ार रही।');
    bad('Sales doubled, about half came from one item, roughly twenty bills.');
  });
  it('a date that is not in the figures', () => {
    bad('As of 5 Nov you sold 31 bills.');
    bad('On 2026-11-05 you sold 31 bills.');
  });
  it('an empty reply', () => {
    bad('   ');
  });
  it('the words "one" and "give" alone are fine, but "one lakh" is not', () => {
    expect(checkReply('One item stands out.', SALES, none).ok).toBe(true);
    expect(checkReply('स्टॉक पर ध्यान दो।', SALES, none).ok).toBe(true);
    bad('Sales were one lakh.');
  });
});

describe('stand-ins', () => {
  const figures = {
    customers: [{ client_id: 'CL-9', name: 'Ramesh Stores', outstanding: 900 }, { client_id: 'CL-8', name: 'Asha', outstanding: 100 }],
    accounts: [{ account_id: 'AC-1', label: 'HDFC Current', type: 'UPI', balance: 5 }],
  };
  it('no name or id reaches the model, and accounts go as CASH or BANK', () => {
    const { view, map } = toModelFigures(figures);
    const sent = JSON.stringify(view);
    for (const secret of ['Ramesh', 'Asha', 'HDFC', 'CL-9', 'AC-1']) expect(sent).not.toContain(secret);
    expect(view.customers.map((c) => c.name)).toEqual(['[C1]', '[C2]']);
    expect(view.accounts[0]).toEqual({ label: '[A1]', type: 'BANK', balance: 5 });
    expect(map['[C1]']).toBe('Ramesh Stores');
  });
  it('real names come back, and [C1] never clips [C10]', () => {
    expect(restoreNames('[C10] and [C1]', { '[C1]': 'A', '[C10]': 'B' })).toBe('B and A');
  });
  it('the hash ignores as_of and key order, and moves with a figure', async () => {
    const a = await figuresHash({ x: 1, y: 2, as_of: 'now' });
    expect(await figuresHash({ y: 2, x: 1, as_of: 'later' })).toBe(a);
    expect(await figuresHash({ x: 1, y: 3, as_of: 'now' })).not.toBe(a);
  });
});

describe('periods', () => {
  it('uses the shop timezone, not UTC', () => {
    expect(shopToday(new Date('2026-11-03T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-04');
  });
  it('matches priorRange: equal length, immediately before', () => {
    expect(priorWindow('2026-11-01', '2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-10-31' });
  });
  it('weeks start on Monday, and last month crosses the year', () => {
    expect(mondayOf('2026-11-04')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(lastMonth('2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('gives no percentage without a positive base', () => {
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(5, -2)).toBeNull();
    expect(changePct(150, 100)).toBe(50);
  });
});

describe('collections_week comparison', () => {
  const run = async (today) => {
    const calls = [];
    const db = {
      rpc: async (name, args) => {
        calls.push(args);
        return { data: { collected: calls.length === 1 ? 120 : 100, receipt_count: 1, by_method: [] }, error: null };
      },
    };
    const r = await runQuestion('collections_week', db, { tenantId: 'T', today, taxMode: null });
    return { calls, r };
  };

  it('compares Monday to today with the same days last week, not the days just before', async () => {
    // Wed 11 Nov 2026: 9-11 Nov against 2-4 Nov. The old window was 6-8 Nov.
    const { calls, r } = await run('2026-11-11');
    expect(calls[0]).toEqual({ p_from: '2026-11-09', p_to: '2026-11-11' });
    expect(calls[1]).toEqual({ p_from: '2026-11-02', p_to: '2026-11-04' });
    expect(r.figures).toMatchObject({ previous_from: '2026-11-02', previous_to: '2026-11-04', previous_collected: 100, change_pct: 20 });
  });

  it('holds on a Monday and on a Sunday', async () => {
    expect((await run('2026-11-09')).calls[1]).toEqual({ p_from: '2026-11-02', p_to: '2026-11-02' });
    expect((await run('2026-11-15')).calls[1]).toEqual({ p_from: '2026-11-02', p_to: '2026-11-08' });
  });

  it('leaves the profit comparison on the equal-length window before', () => {
    expect(priorWindow('2026-11-01', '2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-10-31' });
    expect(sameDaysLastWeek('2026-11-09', '2026-11-11')).toEqual({ from: '2026-11-02', to: '2026-11-04' });
  });

  it('labels it as the same days', () => {
    const card = buildCard('collections_week', { collected: 1, receipt_count: 1, customers_paid: 1, previous_collected: 1, change_pct: null, by_method: [], period_from: '2026-11-09', period_to: '2026-11-11', previous_from: '2026-11-02', previous_to: '2026-11-04' }, strings.en);
    expect(card.hero.detail).toBe('₹1.00, same days last week (2–4 Nov)');
  });
});

describe('the GST label', () => {
  it('is the one in the approved design', () => {
    const reg = JSON.parse(read('../../supabase/functions/ai-ask/questions.json'));
    expect(reg.questions.find((q) => q.id === 'gst_collected').label.hi).toBe('इस महीने मेरी बिक्री पर कितना GST आया?');
  });
});

describe('cards', () => {
  it('uses only the agreed kinds, in the chosen language', () => {
    const card = buildCard('sales_today', SALES, strings.hi);
    expect(card.title).toBe(strings.hi.titles.sales_today);
    expect(card.hero).toMatchObject({ value: 234567.5, kind: 'money', caption: 'आज की बिक्री, 31 बिल' });
    expect(card.hero.detail).toBe('▲ 24.5%, पिछले बुधवार ₹10,000.00 थी');
    const kinds = new Set(['money', 'count', 'qty', 'percent', 'date', 'days', 'text']);
    for (const c of [card.headline, ...card.rows]) {
      expect(kinds.has(c.kind)).toBe(true);
      expect(c.label).toBeTruthy();
    }
  });

  it('puts dates in the chosen language, and shortens the comparison range', () => {
    const f = { collected: 100, receipt_count: 2, customers_paid: 1, by_method: [], period_from: '2026-11-09', period_to: '2026-11-11',
      previous_collected: 80, previous_from: '2026-11-02', previous_to: '2026-11-04', change_pct: 25 };
    expect(buildCard('collections_week', f, strings.en).hero).toMatchObject({
      caption: 'Collected, 9 to 11 Nov', detail: '▲ 25.0% vs ₹80.00, same days last week (2–4 Nov)' });
    expect(buildCard('collections_week', f, strings.hi).hero.detail).toBe('▲ 25.0%, पिछले हफ़्ते के इन्हीं दिनों (2–4 नवंबर) में ₹80.00 थी');
  });

  it('marks only expired stock red, and the oldest dues in ink', () => {
    const exp = buildCard('expiring_stock', { expiring_value: 5, expiring_batches: 1, expired_value: 4, period_to: '2026-12-18',
      items: [{ product_name: 'A', expiry_date: '2026-11-12', days_left: -6, qty_remaining: 24, unit: 'KG', value: 4 },
        { product_name: 'B', expiry_date: '2026-12-02', days_left: 14, qty_remaining: 60, unit: 'KG', value: 5 }] }, strings.hi);
    expect(exp.table.tones).toEqual(['neg', null]);
    expect(exp.table.rows[0].slice(1, 3)).toEqual(['12 नवंबर, एक्सपायर', '24 KG']);
    const age = buildCard('dues_age', { total_outstanding: 100, oldest_days: 147, unmatched_amount: 0,
      buckets: [{ label: '0-30', amount: 75, bill_count: 1 }, { label: '31-60', amount: 0, bill_count: 0 }, { label: '61-90', amount: 0, bill_count: 0 }, { label: '90+', amount: 25, bill_count: 1 }] }, strings.en);
    expect(age.table.tones).toEqual([null, null, null, 'strong']);
    expect(age.table.bars).toEqual([75, 0, 0, 25]);
  });
});

// ── the whole flow, against a fake database and a fake model ────────────────

function fakeDb({
  owner = true, status = 'ACTIVE', aiOn = true, plan = 'PRO', tenant = 'T1',
  modules = ['sales', 'reports', 'inventory', 'clients', 'daybook', 'accounts'],
  cache = null, claim = { ok: true, id: 'U1' }, salesError = null, beta = true,
} = {}) {
  const calls = { rpc: [], usage: [], saved: [] };
  const handlers = {
    current_tenant_id: () => tenant,
    is_tenant_admin: () => owner,
    get_my_effective_plan: () => plan,
    plan_modules: () => modules,
    ai_sales_summary: () => SALES,
    ai_top_dues: () => ({
      as_of: 'x', total_outstanding: 900, customers_with_dues: 1,
      customers: [{ client_id: 'CL-9', name: 'Ramesh Stores', outstanding: 900, last_payment_date: null }],
    }),
    ai_usage_claim: () => claim,
    ai_usage_record: (a) => { calls.usage.push(a); return null; },
    ai_save_answer: (a) => { calls.saved.push(a); return null; },
  };
  const rows = {
    tenants: { status, settings: { ai_enabled: aiOn, ai_chat_available: beta } },
    business_profile: { tax_mode: 'EXCLUSIVE', timezone: 'Asia/Kolkata' },
    ai_answer_cache: cache,
    product_batches: [],
  };
  const chain = (table) => {
    const q = {};
    for (const m of ['select', 'eq', 'is', 'not', 'limit']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[table], error: null });
    q.then = (res) => res({ data: rows[table], error: null });
    return q;
  };
  return {
    calls,
    auth: { getUser: async (t) => (t === 'good' ? { data: { user: { id: 'USER' } } } : { data: {}, error: { message: 'bad' } }) },
    from: chain,
    rpc: async (name, args) => {
      calls.rpc.push(name);
      if (name === 'ai_sales_summary' && salesError) return { data: null, error: { message: salesError } };
      return { data: handlers[name]?.(args) ?? null, error: null };
    },
  };
}

const modelSays = (text, stopReason = 'end_turn') => vi.fn(async () => ({ text, stopReason, inputTokens: 10, cachedTokens: 0, outputTokens: 5 }));

async function call(db, { body = { action: 'ask', question_id: 'sales_today', lang: 'en' }, key = 'k', model = modelSays('You sold ₹234567.50 across 31 bills.'), token = 'good' } = {}) {
  const req = new Request('https://x/ai-ask', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const ai = { name: 'fake', model: 'm', configured: Boolean(key), ask: model };
  const res = await handle(req, { ai, db: () => db, now: () => new Date('2026-11-04T06:00:00Z'), cors: {} });
  return { status: res.status, json: await res.json(), model };
}

describe('ai-ask flow', () => {
  it('answers, closes the claim, saves the text with stand-ins, and sends no figures in the log', async () => {
    const db = fakeDb();
    const { status, json, model } = await call(db);
    expect(status).toBe(200);
    expect(json).toMatchObject({ contract_version: CONTRACT_VERSION, text: 'You sold ₹234567.50 across 31 bills.', reason: null });
    expect(json.card.hero.value).toBe(234567.5);
    expect(json.screen).toEqual({ key: 'reports_daily_sales', fallback_key: 'sales', mobile: true, params: { from: '2026-11-04', to: '2026-11-04' } });
    expect(model).toHaveBeenCalledOnce();
    expect(db.calls.usage[0]).toMatchObject({ p_id: 'U1', p_outcome: 'answered', p_input_tokens: 10 });
    expect(JSON.stringify(db.calls.usage)).not.toContain('234567');
    expect(db.calls.saved).toHaveLength(1);
  });

  it('with no key the owner still gets the figures', async () => {
    const db = fakeDb();
    const { status, json, model } = await call(db, { key: null });
    expect(status).toBe(200);
    expect(json).toMatchObject({ text: null, reason: 'ai_not_configured' });
    expect(json.figures.gross_sales).toBe(234567.5);
    expect(model).not.toHaveBeenCalled();
    expect(db.calls.rpc).not.toContain('ai_usage_claim');
  });

  it('a failed model call, a refusal and a tripped guard all keep the figures and drop the text', async () => {
    const failing = vi.fn(async () => { throw new Error('boom'); });
    for (const [model, reason] of [
      [failing, 'model_error'],
      [modelSays('', 'refusal'), 'refused'],
      [modelSays('You sold ₹999 today.'), 'guard_rejected'],
      [modelSays('You sold', 'max_tokens'), 'model_error'],
    ]) {
      const db = fakeDb();
      const { status, json } = await call(db, { model });
      expect(status).toBe(200);
      expect(json).toMatchObject({ text: null, reason });
      expect(json.figures.gross_sales).toBe(234567.5);
      expect(db.calls.saved).toHaveLength(0);
    }
  });

  it('AI off sends nothing to the model', async () => {
    const { json, model } = await call(fakeDb({ aiOn: false }));
    expect(json).toMatchObject({ text: null, reason: 'ai_off' });
    expect(model).not.toHaveBeenCalled();
  });

  it('quota and rate limits return the figures with no model call', async () => {
    for (const reason of ['quota_reached', 'rate_limited']) {
      const { json, model } = await call(fakeDb({ claim: { ok: false, reason } }));
      expect(json).toMatchObject({ text: null, reason });
      expect(model).not.toHaveBeenCalled();
    }
  });

  it('a cache hit reuses the text without a model call, and re-runs the guard', async () => {
    const { toModelFigures: tmf } = await import('../../supabase/functions/ai-ask/standins.ts');
    const figs = { ...SALES, previous_gross_sales: SALES.gross_sales, change_pct: 0 };
    const hash = await figuresHash(tmf(figs).view);
    const hit = await call(fakeDb({ cache: { figures_hash: hash, text_with_standins: 'You sold ₹234567.50.' } }));
    expect(hit.json.text).toBe('You sold ₹234567.50.');
    expect(hit.model).not.toHaveBeenCalled();

    const planted = await call(fakeDb({ cache: { figures_hash: hash, text_with_standins: 'You sold ₹1 crore.' } }));
    expect(planted.model).toHaveBeenCalledOnce();
    expect(planted.json.text).not.toContain('crore');
  });

  it('real names reach the owner, stand-ins reach the model', async () => {
    const model = modelSays('[C1] owes you ₹900.');
    const db = fakeDb();
    const { json } = await call(db, { body: { action: 'ask', question_id: 'top_dues', lang: 'en' }, model });
    expect(json.text).toBe('Ramesh Stores owes you ₹900.');
    expect(model.mock.calls[0][1]).not.toContain('Ramesh');
    expect(model.mock.calls[0][1]).not.toContain('CL-9');
    expect(db.calls.saved[0].p_text).toBe('[C1] owes you ₹900.');
  });

  it('refuses as JSON, with the status and reason the clients expect', async () => {
    const cases = [
      [fakeDb({ owner: false }), {}, 403, 'not_owner'],
      [fakeDb({ tenant: null }), {}, 403, 'not_owner'],
      [fakeDb({ status: 'SUSPENDED' }), {}, 403, 'suspended'],
      [fakeDb({ beta: false }), {}, 403, 'not_enabled'],
      [fakeDb({ beta: false }), { body: { action: 'list' } }, 403, 'not_enabled'],
      [fakeDb({ modules: ['dashboard'] }), {}, 403, 'module_locked'],
      [fakeDb(), { body: { action: 'ask', question_id: 'sales_today', lang: 'fr' } }, 400, 'lang_unsupported'],
      [fakeDb(), { body: { action: 'ask', question_id: 'nope', lang: 'en' } }, 400, 'unknown_question'],
      [fakeDb(), { body: { action: 'ask', question_id: 'expiring_stock', lang: 'en' } }, 400, 'unknown_question'],
      [fakeDb(), { token: 'bad' }, 401, 'not_signed_in'],
    ];
    for (const [db, opts, status, reason] of cases) {
      const r = await call(db, opts);
      expect([r.status, r.json.reason, r.json.contract_version]).toEqual([status, reason, CONTRACT_VERSION]);
    }
  });

  it('a failed read is a real error, never a zero', async () => {
    const { status, json } = await call(fakeDb({ salesError: 'denied' }));
    expect(status).toBe(500);
    expect(json.reason).toBe('read_failed');
    expect(json.figures).toBeUndefined();
  });

  it('never reads the service role key', () => {
    for (const f of ['index.ts', 'handler.ts', 'runs.ts']) {
      expect(read(`../../supabase/functions/ai-ask/${f}`).replace(/\/\/.*$/gm, '')).not.toMatch(/SERVICE_ROLE/i);
    }
  });

  it('list reports the state, the strings and only what this shop may see', async () => {
    const on = await call(fakeDb(), { body: { action: 'list', lang: 'hi' } });
    expect(on.json.state).toBe('on');
    expect(on.json.strings).toEqual(strings.hi);
    const ids = on.json.questions.map((q) => q.id);
    expect(ids).toContain('sales_today');
    expect(ids).not.toContain('expiring_stock');       // no batch has an expiry

    expect((await call(fakeDb({ aiOn: false }), { body: { action: 'list' } })).json.state).toBe('off');
    expect((await call(fakeDb(), { body: { action: 'list' }, key: null })).json.state).toBe('not_configured');

    const free = await call(fakeDb({ modules: ['sales', 'inventory', 'clients', 'daybook'] }), { body: { action: 'list' } });
    const q = Object.fromEntries(free.json.questions.map((x) => [x.id, x]));
    expect(q.profit_month).toBeUndefined();
    expect(q.sales_today.screen_key).toBe('sales');    // the fallback, since /reports is locked
    expect(q.cash_bank.screen_key).toBe('dashboard');
  });
});

// ── Purchases & suppliers ───────────────────────────────────────────────────
// Figures below are what the new SQL returned: Demo Kirana Store (prod, read
// only, 1-19 Jun 2026 against 1-19 May) and rolled-back seed rows on dev.
// Each was checked against the screen's own JS over the same rows.
const BOUGHT = {
  period_from: '2026-06-01', period_to: '2026-06-19', as_of: 'x', total_value: 88048, bill_count: 13, supplier_count: 4,
  previous_value: 48175, previous_bill_count: 10, previous_from: '2026-05-01', previous_to: '2026-05-19', change_pct: 82.8,
};
const OWED = {
  period_from: '2026-11-11', period_to: '2026-11-11', as_of: 'x', total_owed: 44363, suppliers_owing: 4, suppliers_total: 4, advance_total: 200,
  suppliers: [
    { supplier_id: 'S-DEMO-001', name: 'Kerala Paper Mills', owed: 18000, last_payment_date: null },
    { supplier_id: 'S-DEMO-002', name: 'Cochin Disposables Co.', owed: 15750, last_payment_date: null },
    { supplier_id: 'TIE-S-A', name: 'Alpha Traders', owed: 10150, last_payment_date: '2026-11-03' },
    { supplier_id: 'TIE-S-B', name: 'Beta Agency', owed: 463, last_payment_date: null },
  ],
};
const TOP_SUP = {
  period_from: '2026-06-01', period_to: '2026-06-19', as_of: 'x', total_value: 88048, bill_count: 13, supplier_count: 4,
  suppliers: [{ name: 'Metro Wholesale Distributors', value: 68174, bill_count: 6 }, { name: 'Dairy Fresh Distributors', value: 16962, bill_count: 5 },
    { name: 'Beverage Hub', value: 1456, bill_count: 1 }, { name: 'Cleanwell Household Co', value: 1456, bill_count: 1 }],
};
const COST = {
  period_from: '2026-08-13', period_to: '2026-11-11', as_of: 'x', items_up: 3, items_compared: 3,
  items: [
    { product_id: 'TIE-P-4', product_name: 'Tie Salt', unit: 'PCS', old_cost: 1.01, new_cost: 1.5, pct_rise: 48.51, old_date: '2026-11-09', new_date: '2026-11-09' },
    { product_id: 'TIE-P-2', product_name: 'Tie Oil 1L', unit: 'PCS', old_cost: 50, new_cost: 60, pct_rise: 20, old_date: '2026-11-04', new_date: '2026-11-05' },
    { product_id: 'TIE-P-1', product_name: 'Tie Rice 25kg', unit: 'BAG', old_cost: 33.33, new_cost: 33.67, pct_rise: 1.02, old_date: '2026-10-02', new_date: '2026-11-03' },
  ],
};

describe('purchases & suppliers', () => {
  const reg = JSON.parse(read('../../shared/ai_chat/questions.json'));
  const IDS = ['purchases_month', 'supplier_dues', 'top_suppliers', 'cost_up'];

  it('are one category, after stock, with every string a card needs', () => {
    expect(reg.questions.filter((q) => q.category === 'purchases').map((q) => q.id)).toEqual(IDS);
    expect(read('../components/ask/AskPanel.jsx')).toContain("const CATEGORIES = ['sales', 'stock', 'purchases', 'expenses', 'dues', 'cash', 'gst'];");
    for (const lang of ['en', 'hi']) {
      expect(strings[lang].ui.category_purchases).toBeTruthy();
      for (const id of IDS) {
        expect(strings[lang].titles[id]).toBeTruthy();
        expect(strings[lang].hero[id]).toBeTruthy();
        expect(strings[lang].footnotes[id]).toBeTruthy();
        expect(strings[lang].no_data_by_question[id]).toBeTruthy();
      }
    }
    expect(strings.en.ui.category_purchases).toBe('Purchases & suppliers');
  });

  it('every new Hindi string waits for review', () => {
    const pending = new Set(strings.hi.review_pending);
    for (const k of ['ui.category_purchases', 'card.invoice_value', 'footnotes.cost_up', 'hero.supplier_dues.caption', 'no_data_by_question.top_suppliers']) {
      expect(pending.has(k)).toBe(true);
    }
  });

  it('purchases_month: the register total, its bills, and the same days last month', () => {
    const card = buildCard('purchases_month', BOUGHT, strings.en);
    expect(card.title).toBe('Bought this month');
    expect(card.hero).toMatchObject({ value: 88048, kind: 'money', caption: 'Bought, 1 to 19 Jun, 13 bills', detail: '▲ 82.8% vs ₹48,175.00 for 1 to 19 May' });
    expect(card.rows).toEqual([
      { label: 'Invoice value, with GST', value: 88048, kind: 'money', tone: 'total' },
      { label: 'Bills', value: 13, kind: 'count' }, { label: 'Suppliers', value: 4, kind: 'count' }]);
    expect(card.footnote).toContain('Invoice value includes GST, as on the Purchase Register');
    expect(buildCard('purchases_month', { ...BOUGHT, change_pct: null }, strings.en).hero.detail).toBe('₹48,175.00 for 1 to 19 May');
  });

  it('supplier_dues: owed per supplier, last paid, and the advance the screen nets', () => {
    const card = buildCard('supplier_dues', OWED, strings.en);
    expect(card.hero).toMatchObject({ value: 18000, caption: 'Kerala Paper Mills is owed the most', detail: '₹44,363.00 owed to 4 suppliers' });
    expect(card.table.rows[2]).toEqual(['Alpha Traders', '3 Nov', 10150]);
    expect(card.table.rows[0][1]).toBe('Never');
    expect(card.rows_after).toEqual([
      { label: 'Total you owe', value: 44363, kind: 'money', tone: 'total' },
      { label: 'Paid ahead, already taken off', value: 200, kind: 'money' }]);
    expect(card.footnote).toMatch(/^Top 4 of 4 shown\. .*as on the Suppliers screen/);
    expect(buildCard('supplier_dues', { ...OWED, advance_total: 0 }, strings.en).rows_after).toHaveLength(1);
  });

  it('top_suppliers: by value, with the register total', () => {
    const card = buildCard('top_suppliers', TOP_SUP, strings.en);
    expect(card.hero).toMatchObject({ value: 68174, caption: 'Top supplier: Metro Wholesale Distributors',
      detail: '₹88,048.00 from 4 suppliers in 13 bills, 1 to 19 Jun' });
    expect(card.table.rows[0]).toEqual(['Metro Wholesale Distributors', 6, 68174]);
    expect(card.rows_after[0]).toMatchObject({ value: 88048, tone: 'total' });
    expect(card.footnote).toContain("the total equals the register's Invoice Value");
  });

  it('cost_up: was, now and the rise, per base unit, with the footnote saying what is compared', () => {
    const card = buildCard('cost_up', COST, strings.en);
    expect(card.hero).toMatchObject({ value: 3, kind: 'count', unit: 'items', caption: 'Cost more on the latest purchase, of 3 compared since 13 Aug' });
    expect(card.table.columns.map((c) => c.kind)).toEqual(['text', 'money', 'money', 'percent']);
    expect(card.table.rows[0]).toEqual(['Tie Salt (PCS)', 1.01, 1.5, 48.51]);
    expect(card.footnote).toContain("in the item's base unit");
    expect(card.footnote).toContain('price history');
  });

  it('nothing to say reads plainly, with no AI slot', () => {
    for (const id of IDS) {
      const f = { purchases_month: BOUGHT, supplier_dues: OWED, top_suppliers: TOP_SUP, cost_up: COST }[id];
      const card = buildCard(id, f, strings.en, true);
      expect(card.hero.caption).toBe(strings.en.no_data_by_question[id]);
      expect(card.footnote).toBeNull();
    }
  });

  it('supplier names go to the model as [S1].., ids never', () => {
    const { view, map } = toModelFigures(OWED);
    const sent = JSON.stringify(view);
    for (const secret of ['Kerala Paper', 'Alpha', 'S-DEMO-001', 'TIE-S-A']) expect(sent).not.toContain(secret);
    expect(view.suppliers.map((x) => x.name)).toEqual(['[S1]', '[S2]', '[S3]', '[S4]']);
    expect(map['[S3]']).toBe('Alpha Traders');
    expect(toModelFigures(TOP_SUP).view.suppliers[0]).toEqual({ name: '[S1]', value: 68174, bill_count: 6 });
    expect(JSON.stringify(toModelFigures(COST).view)).not.toContain('TIE-P-');
  });

  it('the guard holds on the new figures', () => {
    const ok = (text, f) => { const { view, map } = toModelFigures(f); return checkReply(text, view, map).ok; };
    expect(ok('You bought ₹88,048 in 13 bills from 4 suppliers, 82.8% more than the same days last month.', BOUGHT)).toBe(true);
    expect(ok('You bought ₹88,048, 82.8% less than last month.', BOUGHT)).toBe(false);
    expect(ok('You bought ₹88,050 this month.', BOUGHT)).toBe(false);
    expect(ok('You owe ₹44,363 to 4 suppliers; [S1] is owed ₹18,000.', OWED)).toBe(true);
    expect(ok('[S5] is owed ₹463.', OWED)).toBe(false);
    expect(ok('[S1] supplied ₹68,174 of your ₹88,048.', TOP_SUP)).toBe(true);
    expect(ok('Tie Salt now costs ₹1.50 against ₹1.01, a 48.51% rise.', COST)).toBe(true);
    expect(ok('Tie Salt rose 49.5%.', COST)).toBe(false);
    expect(ok('Tie Rice 25kg now costs ₹34.', COST)).toBe(true);    // 33.67 to a whole rupee
    expect(ok('Tie Rice 25kg now costs ₹35.', COST)).toBe(false);
  });

  it('runs: this month to today against the same days last month', async () => {
    const calls = [];
    const db = { rpc: async (name, args) => { calls.push([name, args]); return { data: { total_value: calls.length === 1 ? 120 : 100, bill_count: 1, supplier_count: 1 }, error: null }; } };
    const r = await runQuestion('purchases_month', db, { tenantId: 'T', today: '2026-11-10', taxMode: null });
    expect(calls).toEqual([['ai_purchases_summary', { p_from: '2026-11-01', p_to: '2026-11-10' }], ['ai_purchases_summary', { p_from: '2026-10-01', p_to: '2026-10-10' }]]);
    expect(r.figures).toMatchObject({ previous_value: 100, change_pct: 20, previous_from: '2026-10-01', previous_to: '2026-10-10' });
    expect(r.params).toEqual({ from: '2026-11-01', to: '2026-11-10' });
    expect(sameDaysLastMonth('2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(sameDaysLastMonth('2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-15' });
  });

  it('runs: the other three read once, and a failed read throws', async () => {
    const seen = [];
    const db = (data) => ({ rpc: async (name, args) => { seen.push([name, args]); return { data, error: null }; } });
    expect((await runQuestion('supplier_dues', db(OWED), { tenantId: 'T', today: '2026-11-11' })).empty).toBe(false);
    expect((await runQuestion('top_suppliers', db(TOP_SUP), { tenantId: 'T', today: '2026-11-11' })).params).toEqual({ from: '2026-11-01', to: '2026-11-11' });
    expect((await runQuestion('cost_up', db({ ...COST, items_up: 0, items: [] }), { tenantId: 'T', today: '2026-11-11' })).empty).toBe(true);
    expect(seen.map((x) => x[0])).toEqual(['ai_supplier_dues', 'ai_top_suppliers', 'ai_cost_up']);
    expect(seen[2][1]).toEqual({ p_days: 90, p_limit: 10 });
    const bad = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    await expect(runQuestion('supplier_dues', bad, { tenantId: 'T', today: '2026-11-11' })).rejects.toThrow('ai_supplier_dues: boom');
  });
});
