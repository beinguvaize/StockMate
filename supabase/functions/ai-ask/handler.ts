// ai-ask: the flow of docs/ai-chat-v1.md §5, free of Deno and npm imports so it
// can be tested. The figures never depend on the model: with no key, a model
// failure, a used-up quota or a tripped guard, the owner still gets them.
import registry from "./questions.json" with { type: "json" };
import allStrings from "./strings.json" with { type: "json" };
import { buildCard } from "./cards.ts";
import { checkReply } from "./guard.ts";
import { shopToday } from "./periods.ts";
import { SYSTEM_PROMPT, userPrompt } from "./prompt.ts";
import { ReadFailed, runQuestion } from "./runs.ts";
import { figuresHash, restoreNames, toModelFigures } from "./standins.ts";

export const MODEL = "claude-haiku-5-5";
export const CONTRACT_VERSION = registry.contract_version;
const LANGUAGE_NAME: Record<string, string> = { en: "English", hi: "Hindi" };
const strings = allStrings as Record<string, any>;

export interface ModelReply {
  text: string;
  stopReason: string | null;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export interface Deps {
  apiKey: () => string | undefined;
  db: (authHeader: string) => any;
  askModel: (apiKey: string, system: string, user: string) => Promise<ModelReply>;
  now: () => Date;
  cors: Record<string, string>;
}

const json = (deps: Deps, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ contract_version: CONTRACT_VERSION, ...body }), {
    status, headers: { ...deps.cors, "Content-Type": "application/json" },
  });

const refuse = (deps: Deps, status: number, reason: string, lang = "en") =>
  json(deps, status, { error: reason, reason, message: strings[lang]?.ui?.[`reason_${reason}`] ?? reason });

async function must(db: any, name: string, args?: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new ReadFailed(`${name}: ${error.message}`);
  return data;
}

async function loadContext(db: any) {
  const [tenantId, isOwner] = await Promise.all([must(db, "current_tenant_id"), must(db, "is_tenant_admin")]);
  if (!tenantId) return { tenantId: null };
  const plan = await must(db, "get_my_effective_plan");
  const modules: string[] = (await must(db, "plan_modules", { p_plan: plan })) || [];
  const t = await db.from("tenants").select("status, settings").eq("id", tenantId).maybeSingle();
  if (t.error) throw new ReadFailed(`tenants: ${t.error.message}`);
  const bp = await db.from("business_profile").select("tax_mode, timezone")
    .eq("tenant_id", tenantId).is("deleted_at", null).limit(1).maybeSingle();
  if (bp.error) throw new ReadFailed(`business_profile: ${bp.error.message}`);
  return {
    tenantId, isOwner, plan, modules,
    status: t.data?.status ?? null,
    aiOn: t.data?.settings?.ai_enabled === true,
    taxMode: bp.data?.tax_mode ?? null,
    tz: bp.data?.timezone || "Asia/Kolkata",
  };
}

function resolveScreen(q: any, modules: string[]) {
  const open = modules.includes(q.screen.module);
  return {
    key: open || !q.screen.fallback_key ? (open ? q.screen.key : null) : q.screen.fallback_key,
    fallback_key: q.screen.fallback_key,
    mobile: q.screen.mobile,
  };
}

async function hasExpiryBatches(db: any, tenantId: string) {
  const { data, error } = await db.from("product_batches").select("id")
    .eq("tenant_id", tenantId).is("deleted_at", null).not("expiry_date", "is", null).limit(1);
  if (error) throw new ReadFailed(`product_batches: ${error.message}`);
  return (data || []).length > 0;
}

const visibleLocked = (q: any, ctx: any) => !ctx.modules.includes(q.module);

async function list(deps: Deps, db: any, ctx: any, lang: string) {
  const hasExpiry = await hasExpiryBatches(db, ctx.tenantId);
  const questions = registry.questions
    .filter((q: any) => !visibleLocked(q, ctx))
    .filter((q: any) => !q.needs_expiry_batches || hasExpiry)
    .filter((q: any) => !q.needs_tax || String(ctx.taxMode ?? "").toUpperCase() !== "NONE")
    .map((q: any) => {
      const s = resolveScreen(q, ctx.modules);
      return {
        id: q.id, category: q.category, label: q.label[lang] ?? q.label.en,
        screen_key: s.key, fallback_screen_key: s.fallback_key, mobile: s.mobile,
      };
    });
  const state = !ctx.aiOn ? "off" : deps.apiKey() ? "on" : "not_configured";
  return json(deps, 200, { state, plan: ctx.plan, lang, languages: registry.languages, strings: strings[lang], questions });
}

async function logUsage(db: any, row: {
  id?: string | null; question: string; lang: string; model?: string | null;
  input?: number; cached?: number; output?: number; outcome: string; latency?: number;
}) {
  // A failed log must never cost the owner the answer, but it is not silent.
  const { error } = await db.rpc("ai_usage_record", {
    p_id: row.id ?? null, p_question_id: row.question, p_lang: row.lang, p_model: row.model ?? null,
    p_input_tokens: row.input ?? 0, p_cached_tokens: row.cached ?? 0, p_output_tokens: row.output ?? 0,
    p_outcome: row.outcome, p_latency_ms: row.latency ?? null,
  });
  if (error) console.error("[ai-ask] usage log failed:", row.question, row.outcome, error.message);
}

async function ask(deps: Deps, db: any, ctx: any, q: any, lang: string, userId: string) {
  const started = Date.now();
  const today = shopToday(deps.now(), ctx.tz);
  const run = await runQuestion(q.id, db, { tenantId: ctx.tenantId, today, taxMode: ctx.taxMode });
  const screen = resolveScreen(q, ctx.modules);
  const langStrings = strings[lang];

  const respond = (text: string | null, reason: string | null) => json(deps, 200, {
    text, figures: run.figures, card: buildCard(q.id, run.figures, langStrings),
    screen: { ...screen, params: run.params },
    as_of: run.figures.as_of, label: q.label[lang] ?? q.label.en, reason,
    reason_message: reason ? langStrings.ui[`reason_${reason}`] ?? null : null,
  });
  const cardOnly = async (reason: string) => {
    await logUsage(db, { question: q.id, lang, outcome: reason, latency: Date.now() - started });
    return respond(null, reason);
  };

  if (run.empty) {
    await logUsage(db, { question: q.id, lang, outcome: "no_data", latency: Date.now() - started });
    return respond(langStrings.no_data, "no_data");
  }
  if (!ctx.aiOn) return cardOnly("ai_off");

  const { view, map } = toModelFigures(run.figures);
  const hash = await figuresHash(view);

  const cached = await db.from("ai_answer_cache").select("figures_hash, text_with_standins")
    .eq("tenant_id", ctx.tenantId).eq("user_id", userId).eq("question_id", q.id).eq("lang", lang).maybeSingle();
  if (cached.error) console.error("[ai-ask] cache read failed:", cached.error.message);
  if (cached.data?.figures_hash === hash) {
    const again = checkReply(cached.data.text_with_standins, view, map);
    if (again.ok) {
      await logUsage(db, { question: q.id, lang, outcome: "cached", latency: Date.now() - started });
      return respond(restoreNames(cached.data.text_with_standins, map), null);
    }
    console.error("[ai-ask] cached reply failed the guard:", q.id, again.reason);
  }

  const key = deps.apiKey();
  if (!key) return cardOnly("ai_not_configured");

  const claim = await db.rpc("ai_usage_claim", { p_question_id: q.id, p_lang: lang, p_model: MODEL });
  if (claim.error) {
    console.error("[ai-ask] quota check failed:", claim.error.message);
    return respond(null, "model_error");
  }
  if (!claim.data?.ok) return cardOnly(claim.data?.reason ?? "quota_reached");
  const claimId = claim.data.id;

  const close = (outcome: string, r?: ModelReply) => logUsage(db, {
    id: claimId, question: q.id, lang, model: MODEL, outcome, latency: Date.now() - started,
    input: r?.inputTokens, cached: r?.cachedTokens, output: r?.outputTokens,
  });

  let reply: ModelReply;
  try {
    reply = await deps.askModel(key, SYSTEM_PROMPT, userPrompt(q.label.en, LANGUAGE_NAME[lang], view));
  } catch (e) {
    console.error("[ai-ask] model call failed:", q.id, (e as Error)?.message);
    await close("model_error");
    return respond(null, "model_error");
  }
  if (reply.stopReason === "refusal") {
    await close("refused", reply);
    return respond(null, "refused");
  }
  if (reply.stopReason !== "end_turn") {
    console.error("[ai-ask] model stopped early:", q.id, reply.stopReason);
    await close("model_error", reply);
    return respond(null, "model_error");
  }

  const verdict = checkReply(reply.text, view, map);
  if (!verdict.ok) {
    console.error("[ai-ask] guard rejected:", q.id, verdict.reason.split(":")[0]);
    await close("guard_rejected", reply);
    return respond(null, "guard_rejected");
  }

  await close("answered", reply);
  const saved = await db.rpc("ai_save_answer", {
    p_question_id: q.id, p_lang: lang, p_figures_hash: hash, p_text: reply.text, p_model: MODEL,
  });
  if (saved.error) console.error("[ai-ask] cache write failed:", saved.error.message);
  return respond(restoreNames(reply.text, map), null);
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: deps.cors });
  if (req.method !== "POST") return refuse(deps, 405, "bad_request");

  const auth = req.headers.get("Authorization");
  if (!auth) return refuse(deps, 401, "not_signed_in");

  let body: any;
  try { body = await req.json(); } catch { return refuse(deps, 400, "bad_request"); }
  const lang = body?.lang ?? "en";
  if (!registry.languages.includes(lang)) return refuse(deps, 400, "lang_unsupported");

  const db = deps.db(auth);
  try {
    const { data: who, error: whoErr } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (whoErr || !who?.user) return refuse(deps, 401, "not_signed_in", lang);

    const ctx: any = await loadContext(db);
    if (!ctx.tenantId || !ctx.isOwner) return refuse(deps, 403, "not_owner", lang);
    if (String(ctx.status ?? "").toUpperCase() === "SUSPENDED") return refuse(deps, 403, "suspended", lang);

    if (body?.action === "list") return await list(deps, db, ctx, lang);
    if (body?.action !== "ask") return refuse(deps, 400, "bad_request", lang);

    const q: any = registry.questions.find((x: any) => x.id === body.question_id);
    if (!q) return refuse(deps, 400, "unknown_question", lang);
    if (visibleLocked(q, ctx)) return refuse(deps, 403, "module_locked", lang);
    return await ask(deps, db, ctx, q, lang, who.user.id);
  } catch (e) {
    if (e instanceof ReadFailed) {
      console.error("[ai-ask] read failed:", e.message);
      return refuse(deps, 500, "read_failed", lang);
    }
    throw e;
  }
}

