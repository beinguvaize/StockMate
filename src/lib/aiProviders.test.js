import { describe, it, expect, vi } from 'vitest';
import {
  geminiRequest, geminiReply, geminiProvider, makeProvider, ProviderBusy, GEMINI_DEFAULT_MODEL,
} from '../../supabase/functions/ai-ask/providers.ts';
import { handle } from '../../supabase/functions/ai-ask/handler.ts';

const env = (vars) => (k) => vars[k];
const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const geminiText = (text, finishReason = 'STOP', extra = {}) => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }],
  usageMetadata: { promptTokenCount: 900, cachedContentTokenCount: 100, candidatesTokenCount: 40 },
  ...extra,
});

describe('Gemini request', () => {
  it('is a plain generateContent body: system, one user turn, low temperature, short output, no tools', () => {
    const body = geminiRequest('SYS', 'USER');
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'USER' }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
    });
    expect(body.tools).toBeUndefined();
    expect(geminiRequest('S', 'U', 'MINIMAL').generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('sends the key in a header, never in the URL', async () => {
    const fetchFn = vi.fn(async () => ok(geminiText('Hi')));
    await geminiProvider(env({ GEMINI_CHAT_API_KEY: 'secret-key', GEMINI_MODEL: 'gemini-x' }), fetchFn).ask('S', 'U');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect(url).not.toContain('secret-key');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body).contents[0].parts[0].text).toBe('U');
  });
});

describe('Gemini response', () => {
  it('reads the text and the token counts, and leaves out thought parts', () => {
    const r = geminiReply({
      candidates: [{ content: { parts: [{ text: 'plan', thought: true }, { text: 'You sold ₹10.' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
    });
    expect(r).toEqual({ text: 'You sold ₹10.', stopReason: 'end_turn', inputTokens: 5, cachedTokens: 0, outputTokens: 3 });
  });
  it('maps Gemini stop reasons onto the ones ai-ask handles', () => {
    expect(geminiReply(geminiText('x', 'MAX_TOKENS')).stopReason).toBe('max_tokens');
    expect(geminiReply(geminiText('x', 'SAFETY')).stopReason).toBe('refusal');
    expect(geminiReply({ promptFeedback: { blockReason: 'SAFETY' } }).stopReason).toBe('refusal');
    expect(geminiReply(geminiText('x', 'OTHER')).stopReason).toBe('OTHER');
  });
});

describe('Gemini limits', () => {
  it('a 429, an overload or RESOURCE_EXHAUSTED is the provider being busy, not a model error', async () => {
    for (const [status, body] of [[429, { error: { status: 'RESOURCE_EXHAUSTED' } }], [503, { error: { status: 'UNAVAILABLE' } }], [400, { error: { status: 'RESOURCE_EXHAUSTED' } }]]) {
      const p = geminiProvider(env({ GEMINI_CHAT_API_KEY: 'k' }), async () => ok(body, status));
      await expect(p.ask('S', 'U')).rejects.toBeInstanceOf(ProviderBusy);
    }
  });
  it('a reply Google blocks (HTTP 400) is a refusal, so the card shows with a reason', async () => {
    const p = geminiProvider(env({ GEMINI_CHAT_API_KEY: 'k' }), async () => ok({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Response was blocked due to safety' } }, 400));
    expect((await p.ask('S', 'U')).stopReason).toBe('refusal');
  });

  it('any other failure is a plain error', async () => {
    const p = geminiProvider(env({ GEMINI_CHAT_API_KEY: 'k' }), async () => ok({ error: { status: 'INVALID_ARGUMENT' } }, 400));
    const err = await p.ask('S', 'U').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ProviderBusy);
  });
});

describe('choosing the provider', () => {
  it('defaults to Gemini with the placeholder model, and is unconfigured without its key', () => {
    const p = makeProvider(env({}));
    expect([p.name, p.model, p.configured]).toEqual(['gemini', GEMINI_DEFAULT_MODEL, false]);
    expect(makeProvider(env({ GEMINI_CHAT_API_KEY: 'k' })).configured).toBe(true);
    // extract-bill's key is never borrowed: limits are per Google project.
    expect(makeProvider(env({ GEMINI_API_KEY: 'k' })).configured).toBe(false);
  });
  it('switches back to Claude with one setting', () => {
    const p = makeProvider(env({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'k' }));
    expect([p.name, p.model, p.configured]).toEqual(['claude', 'claude-haiku-5-5', true]);
    expect(makeProvider(env({ AI_PROVIDER: 'claude', GEMINI_CHAT_API_KEY: 'k' })).configured).toBe(false);
  });
});

// ── the whole flow, with Gemini's real request shape and a fake network ─────

const SECRETS = ['Ramesh Traders', 'Sita Stores', 'Arun Wholesale', '9876543210', '+91 98765 43210', '27AAPFU0939F1ZV', 'HDFC0001234', '50100123456789', 'ramesh@shop.in', 'Main Road, Kollam'];

function db(rpcs) {
  const rows = {
    tenants: { status: 'ACTIVE', settings: { ai_enabled: true, ai_chat_available: true } },
    business_profile: { tax_mode: 'EXCLUSIVE', timezone: 'Asia/Kolkata' },
    ai_answer_cache: null, product_batches: [],
  };
  const chain = (t) => {
    const q = {};
    for (const m of ['select', 'eq', 'is', 'not', 'limit']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[t], error: null });
    q.then = (r) => r({ data: rows[t], error: null });
    return q;
  };
  const calls = { usage: [] };
  const base = {
    current_tenant_id: 'T1', is_tenant_admin: true, get_my_effective_plan: 'PRO',
    plan_modules: ['sales', 'reports', 'inventory', 'clients', 'daybook', 'accounts'],
    ai_usage_claim: { ok: true, id: 'U1', used: 1, limit: 500, resets_on: '2026-12-01' },
  };
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: 'USER' } } }) },
    from: chain,
    rpc: async (name, args) => {
      if (name === 'ai_usage_record') { calls.usage.push(args); return { data: null, error: null }; }
      if (name === 'ai_save_answer') return { data: null, error: null };
      const v = rpcs[name] ?? base[name];
      return { data: typeof v === 'function' ? v(args) : v ?? null, error: null };
    },
  };
}

async function ask(question, rpcs, fetchFn) {
  const d = db(rpcs);
  const req = new Request('https://x/ai-ask', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ action: 'ask', question_id: question, lang: 'en' }) });
  const res = await handle(req, { ai: geminiProvider(env({ GEMINI_CHAT_API_KEY: 'k' }), fetchFn), db: () => d, now: () => new Date('2026-11-07T06:00:00Z'), cors: {} });
  return { json: await res.json(), d };
}

// Product names DO leave, by design: they are sent as shop data (spec §6) and the
// privacy note says so. Customer and supplier names, phones, GSTINs, email,
// addresses and bank details must not.
describe('nothing private reaches Gemini', () => {
  const dues = {
    as_of: 'x', total_outstanding: 1500, customers_with_dues: 2,
    customers: [
      // Fields no SQL function returns today, planted to prove the second line holds.
      { client_id: 'CL-1', name: 'Ramesh Traders', outstanding: 1000, last_payment_date: null, phone: '9876543210', gstin: '27AAPFU0939F1ZV', email: 'ramesh@shop.in', address: 'Main Road, Kollam' },
      { client_id: 'CL-2', name: 'Sita Stores', outstanding: 500, last_payment_date: null, contact: '+91 98765 43210' },
    ],
    suppliers: [{ supplier_id: 'S-1', name: 'Arun Wholesale', note: 'call 9876543210' }],
    supplier_name: 'Arun Wholesale',
  };
  const cash = {
    as_of: 'x', period_from: '2026-11-07', period_to: '2026-11-07', total_balance: 10, cash_total: 0, bank_total: 10, today_in: 0, today_out: 0,
    accounts: [{ account_id: 'A-1', label: 'HDFC Current', type: 'BANK', balance: 10, account_no: '50100123456789', ifsc: 'HDFC0001234' }],
  };

  for (const [question, rpcs] of [['top_dues', { ai_top_dues: dues }], ['cash_bank', { ai_cash_bank: cash }]]) {
    it(`${question}: the request body holds no name, phone, GSTIN, email, address or account detail`, async () => {
      const fetchFn = vi.fn(async () => ok(geminiText('[C1] owes ₹1,000.00.')));
      await ask(question, rpcs, fetchFn);
      expect(fetchFn).toHaveBeenCalledOnce();
      const sent = fetchFn.mock.calls[0][1].body;
      for (const s of SECRETS) expect(sent).not.toContain(s);
      expect(sent).not.toContain('HDFC Current');
    });
  }

  it('the owner still sees the real names', async () => {
    const { json } = await ask('top_dues', { ai_top_dues: dues }, async () => ok(geminiText('[C1] owes ₹1,000.00.')));
    expect(json.text).toBe('Ramesh Traders owes ₹1,000.00.');
  });
});

describe('provider busy', () => {
  it('returns the figures, does not cost the shop an explanation, and says why', async () => {
    const { json, d } = await ask('top_dues', { ai_top_dues: { as_of: 'x', total_outstanding: 0, customers_with_dues: 1, customers: [{ name: 'A', outstanding: 5 }] } },
      async () => ok({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, 429));
    expect(json).toMatchObject({ text: null, reason: 'provider_busy' });
    expect(json.card.hero.value).toBe(5);
    expect(json.reason_message).toMatch(/did not use one of your explanations/);
    expect(d.calls.usage).toEqual([expect.objectContaining({ p_id: 'U1', p_outcome: 'provider_busy' })]);
  });
});
