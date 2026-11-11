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
    expect(reg.questions).toHaveLength(33);
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

// ── Sales and stock, second set ─────────────────────────────────────────────
// Figures are what the new SQL's queries returned, run read-only on prod
// against FUTURE DISPO for 1-11 Nov 2026 (customer names replaced), and checked
// against each linked screen's own rule over the same rows.
const VS_MONTH = {
  period_from: '2026-11-01', period_to: '2026-11-11', as_of: 'x', gross_sales: 103617.5, bill_count: 106, average_bill: 977.52,
  previous_gross_sales: 128728.8, previous_bill_count: 112, previous_average_bill: 1149.36,
  previous_from: '2026-10-01', previous_to: '2026-10-11', change_pct: -19.5,
};
const WEEK = {
  period_from: '2026-11-09', period_to: '2026-11-11', as_of: 'x', gross_sales: 29060.5, bill_count: 34, average_bill: 854.72,
  days: [{ date: '2026-11-09', gross_sales: 23067.5, bill_count: 30 }, { date: '2026-11-10', gross_sales: 5993, bill_count: 4 },
    { date: '2026-11-11', gross_sales: 0, bill_count: 0 }],
  previous_gross_sales: 22726, previous_bill_count: 31, previous_from: '2026-11-02', previous_to: '2026-11-04', change_pct: 27.9,
};
const CUSTOMERS = {
  period_from: '2026-11-01', period_to: '2026-11-11', as_of: 'x', total_sales: 103617.5, bill_count: 106, customers_count: 19,
  customer_sales: 50413, walk_in_sales: 53204.5, walk_in_bills: 83, walk_in_named_sales: 0, walk_in_named_bills: 0,
  customers: [{ name: 'Asha Stores', sales_value: 15756, bill_count: 1 }, { name: 'Ravi Hotel', sales_value: 5805, bill_count: 1 },
    { name: 'Meena Bakery', sales_value: 4575, bill_count: 2 }],
};
const RETURNS = {
  period_from: '2026-09-01', period_to: '2026-09-30', as_of: 'x', returns_total: 894, return_count: 2,
  all_returns_total: 14608, all_return_count: 5, distinct_items_returned: 2,
  items: [{ product_name: 'Paper Cup 150 Ml', unit: 'PCS', qty_returned: 20, value: 600, return_count: 1 },
    { product_name: 'Tissue small', unit: 'PCS', qty_returned: 49, value: 294, return_count: 1 }],
};
const STOCK = {
  period_from: '2026-11-11', period_to: '2026-11-11', as_of: 'x', stock_value: 577499.05, products_total: 70, items_in_stock: 66,
  raw_value: 168358.2, batch_value: 580322.03, cost_gap: 2822.98, items_cost_off: 25, unbatched_value: 0, items_unbatched: 0,
  items: [{ product_id: 'P1', product_name: '210ml side wall', unit: 'PCS', stock: 800, cost_price: 102.38, value: 81904 }],
};
const OUT = {
  period_from: '2026-11-11', period_to: '2026-11-11', as_of: 'x', items_out: 3, items_zero: 3, items_negative: 0, items_stocked: 64,
  items: [{ product_name: '10*14 KERALA', unit: 'KG', stock: 0 }, { product_name: '13*16 KERALA', unit: 'PCS', stock: 0 },
    { product_name: '16*20 KERALA KG', unit: 'KG', stock: 0 }],
};
const FAST = {
  period_from: '2026-10-12', period_to: '2026-11-11', as_of: 'x', window_days: 30, top_n: 15, cover_days: 7, top_count: 15, items_low: 2,
  items: [{ product_name: 'Frootty plate 12"', unit: 'PCS', rank: 4, units_sold: 407, stock: 43, threshold: 10, days_left: 3, reason: 'days' },
    { product_name: '13*16Kg Cover', unit: 'KG', rank: 3, units_sold: 513, stock: 109, threshold: 10, days_left: 6, reason: 'days' }],
};

describe('sales and stock, second set', () => {
  const reg = JSON.parse(read('../../shared/ai_chat/questions.json'));
  const SALES_IDS = ['sales_vs_last_month', 'sales_week', 'best_customers', 'returns_month'];
  const STOCK_IDS = ['stock_value', 'out_of_stock', 'fast_movers_low'];
  const FIG = { sales_vs_last_month: VS_MONTH, sales_week: WEEK, best_customers: CUSTOMERS, returns_month: RETURNS,
    stock_value: STOCK, out_of_stock: OUT, fast_movers_low: FAST };

  it('join the existing sales and stock categories, after the questions already there', () => {
    expect(reg.questions.filter((q) => q.category === 'sales').map((q) => q.id)).toEqual(['sales_today', 'profit_month', 'top_items', ...SALES_IDS]);
    expect(reg.questions.filter((q) => q.category === 'stock').map((q) => q.id)).toEqual(['low_stock', 'expiring_stock', 'dead_stock', ...STOCK_IDS]);
    for (const lang of ['en', 'hi']) {
      for (const id of [...SALES_IDS, ...STOCK_IDS]) {
        expect(strings[lang].titles[id]).toBeTruthy();
        expect(strings[lang].hero[id]).toBeTruthy();
        expect(strings[lang].no_data_by_question[id]).toBeTruthy();
      }
    }
    const pending = new Set(strings.hi.review_pending);
    for (const k of ['titles.stock_value', 'notes.fast_movers_low', 'footnotes.stock_cost_off', 'hero.best_customers.caption', 'card.days_n']) {
      expect(pending.has(k)).toBe(true);
    }
  });

  it('sales_vs_last_month: month to date against the same dates last month', () => {
    const card = buildCard('sales_vs_last_month', VS_MONTH, strings.en);
    expect(card.hero).toMatchObject({ value: 103617.5, caption: 'Sold 1 to 11 Nov, 106 bills', detail: '▼ 19.5% vs ₹1,28,728.80 for 1 to 11 Oct' });
    expect(card.rows).toEqual([
      { label: 'Sales, 1–11 Nov', value: 103617.5, kind: 'money', tone: 'total' },
      { label: 'Bills, 1–11 Nov', value: 106, kind: 'count' }, { label: 'Average bill, 1–11 Nov', value: 977.52, kind: 'money' }]);
    expect(card.rows_after.map((r) => r.value)).toEqual([128728.8, 112, 1149.36]);
    expect(card.footnote).toBe('Daily Sales shows a total for each day from 1–11 Nov, not one figure for the period. Last month is compared on 1–11 Oct.');
  });

  it('sales_week: day by day, with the total and the same days last week', () => {
    const card = buildCard('sales_week', WEEK, strings.en);
    expect(card.hero).toMatchObject({ value: 29060.5, caption: 'Sold 9 to 11 Nov, 34 bills', detail: '▲ 27.9% vs ₹22,726.00, same days last week (2–4 Nov)' });
    expect(card.table.rows).toEqual([['Monday 9 Nov', 30, 23067.5], ['Tuesday 10 Nov', 4, 5993], ['Wednesday 11 Nov', 0, 0]]);
    expect(card.rows_after).toEqual([{ label: 'Total sold', value: 29060.5, kind: 'money', tone: 'total' }]);
  });

  it('best_customers: top customers, walk-in apart, and the Sales by Party total', () => {
    const card = buildCard('best_customers', CUSTOMERS, strings.en);
    expect(card.hero).toMatchObject({ value: 15756, caption: 'Top customer: Asha Stores', detail: 'Sales by customer, 1 to 11 Nov' });
    expect(card.table.rows[2]).toEqual(['Meena Bakery', 2, 4575]);
    expect(card.rows_after).toEqual([
      { label: '19 customers with an account', value: 50413, kind: 'money' },
      { label: 'Walk-in, 83 bills', value: 53204.5, kind: 'money' },
      { label: 'Total sales', value: 103617.5, kind: 'money', tone: 'total' }]);
    expect(card.footnote).toBe('Top 3 of 19 customers shown. Total sales matches Sales by Party, which lists walk-in sales as one row.');
    // A walk-in bill with a typed name is its own row on the screen: say so, with the screen's Walk-in figure.
    expect(buildCard('best_customers', { ...CUSTOMERS, walk_in_named_bills: 2, walk_in_named_sales: 230 }, strings.en).footnote)
      .toContain('2 walk-in bills (₹230.00) carry a typed name, so Sales by Party lists them under that name and its Walk-in row reads ₹52,974.50.');
  });

  it('best_customers: names go to the model as [C1].., never phone or GSTIN', () => {
    const { view, map } = toModelFigures({ ...CUSTOMERS, customers: [{ ...CUSTOMERS.customers[0], phone: '9876543210', gstin: '32ABCDE1234F1Z5' }] });
    const sent = JSON.stringify(view);
    for (const secret of ['Asha', '9876543210', '32ABCDE']) expect(sent).not.toContain(secret);
    expect(view.customers[0]).toEqual({ name: '[C1]', sales_value: 15756, bill_count: 1 });
    expect(map['[C1]']).toBe('Asha Stores');
    expect(read('../../supabase/migrations/20261113_ai_sales_stock_read_functions.sql')).not.toMatch(/'phone'|gstin'|address'/);
  });

  it('returns_month: total, count, top items, and what the Returns list shows', () => {
    const card = buildCard('returns_month', RETURNS, strings.en);
    expect(card.hero).toMatchObject({ value: 894, caption: 'Returned 1 to 30 Sep, 2 returns' });
    expect(card.table.rows).toEqual([['Paper Cup 150 Ml', '20 PCS', 600], ['Tissue small', '49 PCS', 294]]);
    expect(card.footnote).toBe('Sales › Returns lists every return on every date: 5 returns, Total Returned ₹14,608.00.');
    expect(buildCard('returns_month', { ...RETURNS, all_returns_total: 894, all_return_count: 2 }, strings.en).footnote)
      .toBe('Sales › Returns shows the same ₹894.00: all 2 returns fall in this period.');
  });

  it('stock_value: the Inventory figure, and the exact gap with the open batches', () => {
    const card = buildCard('stock_value', STOCK, strings.en);
    expect(card.hero).toMatchObject({ value: 577499.05, caption: 'Stock at cost now, 66 items in stock' });
    expect(card.table.rows[0]).toEqual(['210ml side wall', '800 PCS', 102.38, 81904]);
    expect(card.rows_after).toEqual([
      { label: 'Total at cost', value: 577499.05, kind: 'money', tone: 'total' },
      { label: 'Of which raw material', value: 168358.2, kind: 'money' }, { label: 'Products', value: 70, kind: 'count' }]);
    expect(card.footnote).toBe('Top 1 items by value. Stock × cost price, as the Inventory screen counts its Stock Value, which it rounds to the rupee. '
      + 'Your open cost batches value this stock at ₹5,80,322.03, ₹2,822.98 more. '
      + 'On 25 items the cost price is not the average of their open batches: ₹2,822.98 of the gap.');
    const even = buildCard('stock_value', { ...STOCK, batch_value: 577499.05, cost_gap: 0, items_cost_off: 0 }, strings.en);
    expect(even.footnote).not.toContain('batches');
    const both = buildCard('stock_value', { ...STOCK, batch_value: 570000, cost_gap: 500, unbatched_value: 7999.05, items_unbatched: 2 }, strings.en);
    expect(both.footnote).toContain('₹7,499.05 less');
    expect(both.footnote).toContain('On 2 items the stock and the open batches hold different quantities: ₹7,999.05 of the gap.');
  });

  it('out_of_stock: zero or below, and the Low Stock count stated when negatives exist', () => {
    const card = buildCard('out_of_stock', OUT, strings.en);
    expect(card.hero).toMatchObject({ value: 3, kind: 'count', unit: 'items', caption: 'At zero or below now, of 64 stocked items' });
    expect(card.footnote).toBe('Raw material and services are left out, as on Low Stock.');
    const neg = buildCard('out_of_stock', { ...OUT, items_zero: 2, items_negative: 1, items: [{ product_name: 'A', unit: 'PCS', stock: -4 }, ...OUT.items.slice(1)] }, strings.en);
    expect(neg.footnote).toContain("Low Stock's Items Out of Stock counts only items at exactly 0, so it reads 2; 1 more are below 0.");
    expect(neg.table.tones).toEqual(['neg', null, null]);
  });

  it('fast_movers_low: the rule is on the card, with days left as the screen rounds it', () => {
    const card = buildCard('fast_movers_low', FAST, strings.en);
    expect(card.hero).toMatchObject({ value: 2, kind: 'count', caption: 'Running low among your top 15 sellers since 12 Oct' });
    expect(card.table.rows[0]).toEqual(['Frootty plate 12"', '407 PCS', '43 PCS', '3 days']);
    expect(card.note).toBe('Best sellers are your top 15 items by units sold since 12 Oct. One is running low when its stock is at or below its low-stock limit, '
      + 'or it has 7 days or fewer left. Days left is stock divided by units sold over 30 days, as Days Cover on Fast / Slow Movers.');
    expect(card.footnote).toBe('Fast / Slow Movers shows Units Sold, Stock and Days Cover for each of these.');
  });

  it('nothing to say reads plainly, with no footnote', () => {
    for (const [id, f] of Object.entries(FIG)) {
      const card = buildCard(id, f, strings.en, true);
      expect(card.hero.caption).toBe(strings.en.no_data_by_question[id]);
      expect(card.footnote).toBeNull();
    }
  });

  it('runs: dates are worked out server-side, and each reads its own function', async () => {
    const seen = [];
    const db = (data) => ({ rpc: async (name, args) => { seen.push([name, args]); return { data, error: null }; } });
    const ctx = { tenantId: 'T', today: '2026-11-11', taxMode: null };
    const vs = await runQuestion('sales_vs_last_month', db({ gross_sales: 120, bill_count: 2, average_bill: 60 }), ctx);
    expect(seen.slice(0, 2)).toEqual([['ai_sales_summary', { p_from: '2026-11-01', p_to: '2026-11-11' }], ['ai_sales_summary', { p_from: '2026-10-01', p_to: '2026-10-11' }]]);
    expect(vs.figures).toMatchObject({ previous_from: '2026-10-01', previous_to: '2026-10-11', change_pct: 0 });
    await runQuestion('sales_week', db({ gross_sales: 1, bill_count: 1, days: [] }), ctx);
    expect(seen.slice(2, 4)).toEqual([['ai_sales_by_day', { p_from: '2026-11-09', p_to: '2026-11-11' }], ['ai_sales_summary', { p_from: '2026-11-02', p_to: '2026-11-04' }]]);
    await runQuestion('best_customers', db(CUSTOMERS), ctx);
    await runQuestion('returns_month', db(RETURNS), ctx);
    expect((await runQuestion('stock_value', db(STOCK), ctx)).empty).toBe(false);
    expect((await runQuestion('out_of_stock', db({ ...OUT, items_out: 0, items: [] }), ctx)).empty).toBe(true);
    expect((await runQuestion('fast_movers_low', db(FAST), ctx)).params).toEqual({ from: '2026-10-12', to: '2026-11-11' });
    expect(seen.slice(4)).toEqual([
      ['ai_best_customers', { p_from: '2026-11-01', p_to: '2026-11-11', p_limit: 10 }],
      ['ai_sales_returns', { p_from: '2026-11-01', p_to: '2026-11-11', p_limit: 5 }],
      ['ai_stock_value', { p_limit: 10 }], ['ai_out_of_stock', { p_limit: 20 }],
      ['ai_fast_movers_low', { p_days: 30, p_top: 15, p_cover_days: 7, p_limit: 15 }]]);
    const bad = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    await expect(runQuestion('stock_value', bad, ctx)).rejects.toThrow('ai_stock_value: boom');
  });

  it('the guard holds on the new figures', () => {
    const ok = (text, f) => { const { view, map } = toModelFigures(f); return checkReply(text, view, map).ok; };
    expect(ok('You sold ₹1,03,617.50 this month, 19.5% less than the same days last month.', VS_MONTH)).toBe(true);
    expect(ok('Sales are 19.5% higher than last month.', VS_MONTH)).toBe(false);
    expect(ok('[C1] bought ₹15,756 this month.', CUSTOMERS)).toBe(true);
    expect(ok('[C4] bought ₹15,756 this month.', CUSTOMERS)).toBe(false);
    expect(ok('Your stock is worth ₹5.77 lakh at cost.', STOCK)).toBe(true);
    expect(ok('Your stock is worth ₹6 lakh at cost.', STOCK)).toBe(false);
    expect(ok('Frootty plate 12" has 3 days left.', FAST)).toBe(true);
    expect(ok('Frootty plate 12" has 5 days left.', FAST)).toBe(false);
  });
});

// ── GST: purchases, rough net, sales by rate ─────────────────────────────────
// Figures below are what the new read functions returned, read-only, on prod
// (Demo Kirana Store, FUTURE DISPO) and on dev, for the dates shown.

// PurchaseRegisterReport.jsx's row and total maths, copied as it is, so the
// tie-out is proved against the screen's own arithmetic.
const registerTotals = (rows, home) => {
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const rs = rows.map((p) => {
    const gross = Number(p.total_amount || 0);
    const taxRate = Number(p.tax_rate ?? p.taxRate ?? 18);
    const taxable = gross / (1 + taxRate / 100);
    const tax = gross - taxable;
    const inter = p.gstin ? String(p.gstin).slice(0, 2) !== String(home || '').slice(0, 2) : false;
    return { taxable: r2(taxable), cgst: inter ? 0 : r2(tax / 2), sgst: inter ? 0 : r2(tax / 2), igst: inter ? r2(tax) : 0, gross: r2(gross) };
  });
  const t = rs.reduce((a, x) => ({ taxable: a.taxable + x.taxable, cgst: a.cgst + x.cgst, sgst: a.sgst + x.sgst, igst: a.igst + x.igst, gross: a.gross + x.gross }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, gross: 0 });
  return { bills: rs.length, gross: r2(t.gross), taxable: r2(t.taxable), itc: r2(t.cgst + t.sgst + t.igst) };
};

const ITC_FD_NOV = {   // FUTURE DISPO, 1-10 Nov 2026: ai_gst_input
  period_from: '2026-11-01', period_to: '2026-11-10', as_of: 'x', assumed_rate: 18, bill_count: 10,
  invoice_value: 49500, taxable_value: 41949.15, cgst: 3775.42, sgst: 3775.42, igst: 0, input_gst: 7550.84,
  no_gstin_bills: 10, no_gstin_gst: 7550.84, no_bill_no_bills: 10, no_bill_no_gst: 7550.84,
  in_doubt_bills: 10, in_doubt_gst: 7550.84, gstr3b_itc: 0,
};
const ITC_DEMO_JUN = {  // Demo Kirana Store, June 2026
  period_from: '2026-06-01', period_to: '2026-06-30', as_of: 'x', assumed_rate: 18, bill_count: 13,
  invoice_value: 88048, taxable_value: 74616.95, cgst: 6715.52, sgst: 6715.52, igst: 0, input_gst: 13431.04,
  no_gstin_bills: 0, no_gstin_gst: 0, no_bill_no_bills: 2, no_bill_no_gst: 506.14, in_doubt_bills: 2, in_doubt_gst: 506.14, gstr3b_itc: 13431.06,
};
const NET_DEMO_MAY = {  // Demo, May 2026: get_pl_ranged, ai_gst_input, ai_gst_screen_check
  period_from: '2026-05-01', period_to: '2026-05-31', as_of: 'x', tax_mode: 'EXCLUSIVE',
  output_gst: 12381.21, input_gst: 8455.28, net_estimate: 3925.93, assumed_rate: 18, purchase_bill_count: 13,
  no_gstin_gst: 0, gstr3b_itc: 8455.28, gstr3b_gst: 12381.5, bill_rounding: 6.79, gstr3b_books_gst: 12381.21, gstr3b_bill_count: 149,
};
const RATE_DEMO_MAY = {  // Demo, May 2026: ai_gst_by_rate
  period_from: '2026-05-01', period_to: '2026-05-31', as_of: 'x', tax_mode: 'EXCLUSIVE', bill_count: 149, line_count: 377,
  sales_gst: 12381.21, rows_gst: 12381.21, not_set_lines: 0, not_set_bills: 0, not_set_taxable: 0, no_lines_bills: 0, no_lines_value: 0,
  rates: [
    { rate: 0, rate_not_set: false, lines: 29, bills: 25, taxable: 6551, gst: 0 },
    { rate: 5, rate_not_set: false, lines: 137, bills: 93, taxable: 99453, gst: 4972.65 },
    { rate: 12, rate_not_set: false, lines: 33, bills: 28, taxable: 5088, gst: 610.56 },
    { rate: 18, rate_not_set: false, lines: 159, bills: 102, taxable: 34444, gst: 6199.92 },
    { rate: 28, rate_not_set: false, lines: 19, bills: 19, taxable: 2136, gst: 598.08 }],
  output_gst: 12381.21, returns_gst: 0,
};
const RATE_FD_MAY = {  // FUTURE DISPO, May 2026: every line saved with no rate
  period_from: '2026-05-01', period_to: '2026-05-31', as_of: 'x', tax_mode: 'NONE', bill_count: 76, line_count: 206,
  sales_gst: 0, rows_gst: 0, not_set_lines: 206, not_set_bills: 76, not_set_taxable: 110009, no_lines_bills: 0, no_lines_value: 0,
  rates: [{ rate: null, rate_not_set: true, lines: 206, bills: 76, taxable: 110009, gst: 0 }], output_gst: 0, returns_gst: 0,
};

describe('gst_itc_month ties to the Purchase Register', () => {
  it('equals the register maths for the same purchases', () => {
    const fdNov = [13800, 8280, 5550, 5700, 2820, 1000, 1710, 1710, 3480, 5450].map((t) => ({ total_amount: t }));
    expect(registerTotals(fdNov, '32')).toEqual({ bills: 10, gross: 49500, taxable: 41949.15, itc: 7550.84 });
    const f = ITC_FD_NOV;
    expect([f.bill_count, f.invoice_value, f.taxable_value, f.input_gst]).toEqual([10, 49500, 41949.15, 7550.84]);
    // Another state's GSTIN goes to IGST, as on the screen.
    expect(registerTotals([{ total_amount: 1180, gstin: '29ABCDE1234F1Z5' }], '32').itc).toBe(180);
  });

  it('shows the split, the bills in doubt, and says the 18% is assumed', () => {
    const card = buildCard('gst_itc_month', ITC_DEMO_JUN, strings.en);
    expect(card.hero).toMatchObject({ value: 13431.04, kind: 'money', caption: 'GST on purchases, 1 to 30 Jun, 13 bills' });
    expect(card.rows.map((r) => r.label)).toEqual(['Purchase bills, with GST', 'Before GST, at 18%', 'CGST', 'SGST', 'GST on purchases']);
    expect(card.rows_after.map((r) => [r.label, r.value])).toEqual([
      ['No valid supplier GSTIN, 0 bills', 0], ['No bill number, 2 bills', 506.14], ['Credit in doubt, either reason, 2 bills', 506.14]]);
    expect(card.note).toContain('take it as 18% of each bill total');
    expect(card.footnote).toBe('Purchase Register shows the same ₹13,431.04 as Tax (ITC candidate) for these dates. It does not mark which bills are in doubt.');
  });

  it('an IGST row appears only when there is IGST', () => {
    expect(buildCard('gst_itc_month', { ...ITC_DEMO_JUN, igst: 90 }, strings.en).rows.map((r) => r.label)).toContain('IGST');
  });
});

describe('gst_net_month is an estimate, and says why GSTR-3B can differ', () => {
  it('Demo May: the sales gap is rounding, the purchase side agrees', () => {
    const card = buildCard('gst_net_month', NET_DEMO_MAY, strings.en);
    expect(card.hero).toMatchObject({ value: 3925.93, caption: 'Rough GST on sales less GST on purchases, 1 to 31 May' });
    expect(card.rows.map((r) => r.value)).toEqual([12381.21, 8455.28, 3925.93]);
    expect(card.note).toContain('not what to file or pay');
    expect(card.footnote).toBe('GSTR-3B shows ₹0.29 more GST on sales: it rounds CGST and SGST for each tax rate on a bill; your bills round GST once per bill. '
      + 'GSTR-3B also sets each tax head against its own credit and never shows one below zero.');
  });

  it('names the input credit GSTR-3B counts, with its cause', () => {
    const round = buildCard('gst_net_month', { ...NET_DEMO_MAY, input_gst: 13431.04, gstr3b_itc: 13431.06, net_estimate: -1049.83 }, strings.en);
    expect(round.footnote).toContain('GSTR-3B counts input credit of ₹13,431.06: it rounds CGST and SGST once for the month; here each bill is rounded.');
    const left = buildCard('gst_net_month', { ...NET_DEMO_MAY, input_gst: 7550.84, gstr3b_itc: 0, no_gstin_gst: 7550.84 }, strings.en);
    expect(left.footnote).toContain('GSTR-3B counts input credit of ₹0.00: it leaves out bills from suppliers with no valid GSTIN (₹7,550.84 here)');
  });

  it('more GST on purchases than on sales reads as that, never as a minus', () => {
    const card = buildCard('gst_net_month', { ...NET_DEMO_MAY, net_estimate: -1049.83 }, strings.en);
    expect(card.hero).toMatchObject({ value: 1049.83, caption: 'GST on purchases is more than on sales by this, 1 to 31 May' });
  });

  it('a sales gap bigger than rounding gets the one plain line', () => {
    const card = buildCard('gst_net_month', { ...NET_DEMO_MAY, gstr3b_gst: 32182.83 }, strings.en);
    expect(card.footnote.startsWith(strings.en.footnotes.gst_screen_unmatched)).toBe(true);
  });

  it('works out the estimate on the server from the two book figures', async () => {
    const seen = [];
    const data = {
      get_pl_ranged: [{ output_gst: 12381.21, revenue_net: 1 }],
      ai_gst_input: { input_gst: 8455.28, bill_count: 13, assumed_rate: 18, no_gstin_gst: 0, gstr3b_itc: 8455.28 },
      ai_gst_screen_check: { screen_gst: 12381.5, bill_rounding: 6.79, books_gst: 12381.21, bill_count: 149 },
    };
    const db = { rpc: async (name, args) => { seen.push([name, args]); return { data: data[name], error: null }; } };
    const r = await runQuestion('gst_net_month', db, { tenantId: 'T', today: '2026-11-11', taxMode: 'EXCLUSIVE' });
    expect(r.figures).toMatchObject({ output_gst: 12381.21, input_gst: 8455.28, net_estimate: 3925.93, gstr3b_bill_count: 149 });
    expect(seen.map((s) => s[0])).toEqual(['get_pl_ranged', 'ai_gst_input', 'ai_gst_screen_check']);
    expect(seen[1][1]).toEqual({ p_from: '2026-11-01', p_to: '2026-11-11' });
    expect(r.params).toEqual({ from: '2026-11-01', to: '2026-11-11' });
  });
});

describe('gst_by_rate', () => {
  it('Demo May: the rates add up to the GST collected figure', () => {
    const card = buildCard('gst_by_rate', RATE_DEMO_MAY, strings.en);
    expect(card.hero).toMatchObject({ value: 12381.21, caption: 'GST on your sales by rate, 1 to 31 May', detail: null });
    expect(card.table.rows.map((r) => r[0])).toEqual(['0%', '5%', '12%', '18%', '28%']);
    expect(RATE_DEMO_MAY.rates.reduce((s, r) => s + r.gst, 0)).toBeCloseTo(12381.21, 6);
    expect(card.rows_after.map((r) => [r.label, r.value])).toEqual([['GST on these sales', 12381.21]]);
    expect(card.footnote).toBe(strings.en.footnotes.gst_by_rate);
  });

  it('FUTURE DISPO May: a rate that was never set is its own row, never 18%', () => {
    const card = buildCard('gst_by_rate', RATE_FD_MAY, strings.en);
    expect(card.table.rows).toEqual([['Rate not set', 206, 110009, 0]]);
    expect(card.table.tones).toEqual(['strong']);
    expect(card.hero.detail).toBe('206 lines worth ₹1,10,009.00 have no GST rate set');
    expect(card.footnote).toContain('GSTR-3B counts a line with no rate set as 18%');
  });

  it('returns and per-bill rounding are each shown with their size', () => {
    const card = buildCard('gst_by_rate', { ...RATE_DEMO_MAY, rows_gst: 12381.23, output_gst: 12000, returns_gst: 381.21 }, strings.en);
    expect(card.rows_after.map((r) => [r.label, r.value])).toEqual([
      ['GST on these sales', 12381.21], ['Less GST on returns', 381.21], ['GST after returns', 12000]]);
    expect(card.footnote).toContain('The rates add up to ₹0.02 more than the total');
  });

  it('reads GST after returns from get_pl_ranged, as gst_collected does', async () => {
    const db = { rpc: async (name) => ({ data: name === 'get_pl_ranged' ? [{ output_gst: 12000 }] : { ...RATE_DEMO_MAY, output_gst: undefined, returns_gst: undefined }, error: null }) };
    const r = await runQuestion('gst_by_rate', db, { tenantId: 'T', today: '2026-11-11', taxMode: 'EXCLUSIVE' });
    expect(r.figures).toMatchObject({ sales_gst: 12381.21, output_gst: 12000, returns_gst: 381.21 });
  });

  it('every new card has its strings in both languages', () => {
    for (const [id, f] of [['gst_itc_month', ITC_DEMO_JUN], ['gst_net_month', NET_DEMO_MAY], ['gst_by_rate', RATE_FD_MAY]]) {
      for (const lang of ['en', 'hi']) {
        const c = buildCard(id, f, strings[lang]);
        expect(c.title).toBeTruthy();
        expect(c.hero.caption).toBeTruthy();
        expect(c.note).toBeTruthy();
        expect(JSON.stringify(c)).not.toMatch(/undefined|\{\w+\}/);
      }
    }
  });

  it('the guard allows the assumed rate and stored rates, and nothing invented', () => {
    expect(checkReply('GST on your purchases is ₹7,550.84, taken as 18% of each bill total.', ITC_FD_NOV, {}).ok).toBe(true);
    expect(checkReply('GST on purchases is ₹7,550.84 at 28%.', ITC_FD_NOV, {}).ok).toBe(false);
    expect(checkReply('206 lines worth ₹1,10,009 have no rate set.', RATE_FD_MAY, {}).ok).toBe(true);
    expect(checkReply('At 18% they would carry ₹19,801.62 of GST.', RATE_FD_MAY, {}).ok).toBe(false);
  });
});
