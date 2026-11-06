import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkReply } from '../../supabase/functions/ai-ask/guard.ts';
import { toModelFigures, restoreNames, figuresHash } from '../../supabase/functions/ai-ask/standins.ts';
import { handle, CONTRACT_VERSION } from '../../supabase/functions/ai-ask/handler.ts';
import { buildCard } from '../../supabase/functions/ai-ask/cards.ts';
import { SYSTEM_PROMPT } from '../../supabase/functions/ai-ask/prompt.ts';
import { priorWindow, mondayOf, lastMonth, shopToday, changePct, sameDaysLastWeek } from '../../supabase/functions/ai-ask/periods.ts';
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
    expect(reg.questions).toHaveLength(12);
    for (const q of reg.questions) for (const l of reg.languages) expect(q.label[l]).toBeTruthy();
    for (const k of ['ui', 'card', 'titles', 'notes']) {
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
    const card = buildCard('collections_week', { collected: 1, receipt_count: 1, customers_paid: 1, previous_collected: 1, change_pct: 0, by_method: [] }, strings.en);
    expect(card.rows.map((r) => r.label)).toContain('Same days last week');
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
    expect(card.headline).toEqual({ label: strings.hi.card.sales, value: 234567.5, kind: 'money' });
    const kinds = new Set(['money', 'count', 'qty', 'percent', 'date', 'days', 'text']);
    for (const c of [card.headline, ...card.rows, ...card.table.columns]) {
      expect(kinds.has(c.kind)).toBe(true);
      expect(c.label).toBeTruthy();
    }
  });
});

// ── the whole flow, against a fake database and a fake model ────────────────

function fakeDb({
  owner = true, status = 'ACTIVE', aiOn = true, plan = 'PRO', tenant = 'T1',
  modules = ['sales', 'reports', 'inventory', 'clients', 'daybook', 'accounts'],
  cache = null, claim = { ok: true, id: 'U1' }, salesError = null,
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
    tenants: { status, settings: { ai_enabled: aiOn } },
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
  const res = await handle(req, { apiKey: () => key, db: () => db, askModel: model, now: () => new Date('2026-11-04T06:00:00Z'), cors: {} });
  return { status: res.status, json: await res.json(), model };
}

describe('ai-ask flow', () => {
  it('answers, closes the claim, saves the text with stand-ins, and sends no figures in the log', async () => {
    const db = fakeDb();
    const { status, json, model } = await call(db);
    expect(status).toBe(200);
    expect(json).toMatchObject({ contract_version: CONTRACT_VERSION, text: 'You sold ₹234567.50 across 31 bills.', reason: null });
    expect(json.card.headline.value).toBe(234567.5);
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
    expect(model.mock.calls[0][2]).not.toContain('Ramesh');
    expect(model.mock.calls[0][2]).not.toContain('CL-9');
    expect(db.calls.saved[0].p_text).toBe('[C1] owes you ₹900.');
  });

  it('refuses as JSON, with the status and reason the clients expect', async () => {
    const cases = [
      [fakeDb({ owner: false }), {}, 403, 'not_owner'],
      [fakeDb({ tenant: null }), {}, 403, 'not_owner'],
      [fakeDb({ status: 'SUSPENDED' }), {}, 403, 'suspended'],
      [fakeDb({ modules: ['dashboard'] }), {}, 403, 'module_locked'],
      [fakeDb(), { body: { action: 'ask', question_id: 'sales_today', lang: 'fr' } }, 400, 'lang_unsupported'],
      [fakeDb(), { body: { action: 'ask', question_id: 'nope', lang: 'en' } }, 400, 'unknown_question'],
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
