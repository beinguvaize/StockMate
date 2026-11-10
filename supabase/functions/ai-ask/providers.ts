// The one place that knows which AI writes the explanation. Everything around it
// (stand-ins, number guard, cache, quota, the card that never needs the model)
// is the same whichever provider runs.
//
// AI_PROVIDER picks it: "gemini" (the default) or "claude". Each reads its own
// key from a Supabase secret the owner sets; with no key the provider reports
// itself unconfigured and ai-ask returns the figures with ai_not_configured.

import type { ModelReply } from "./handler.ts";

export interface Provider {
  name: string;
  model: string;
  configured: boolean;
  ask: (system: string, user: string) => Promise<ModelReply>;
}

/** Google's limit, or Anthropic's: shared by every shop on the project, so never the shop's quota. */
export class ProviderBusy extends Error {}

type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

// The AI Researcher's pick (2026-11-07): a stable model, not a preview.
// GEMINI_MODEL overrides it.
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_OUTPUT_TOKENS = 600;
const TIMEOUT_MS = 20_000;

const GEMINI_REFUSALS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

export function geminiRequest(system: string, user: string, thinkingLevel?: string) {
  // temperature is silently ignored by Gemini 3.6 Flash and newer; harmless.
  // No prompt caching: this prompt is under Gemini's minimum, so none is asked for.
  const generationConfig: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS };
  // Thinking spends output tokens before the answer. thinkingLevel is for Gemini
  // 3 and later, and an earlier model rejects it, so it is sent only when set.
  if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig,
  };
}

/** Gemini's answer in the shape the rest of ai-ask reads. */
export function geminiReply(body: any): ModelReply {
  const blocked = body?.promptFeedback?.blockReason;
  const cand = body?.candidates?.[0];
  const finish = String(cand?.finishReason ?? "");
  const stopReason = blocked || GEMINI_REFUSALS.has(finish)
    ? "refusal"
    : finish === "STOP" ? "end_turn"
    : finish === "MAX_TOKENS" ? "max_tokens"
    : finish || "unknown";
  const text = (cand?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === "string" && !p.thought)
    .map((p: any) => p.text).join("").trim();
  const u = body?.usageMetadata ?? {};
  return {
    text, stopReason,
    inputTokens: Number(u.promptTokenCount ?? 0),
    cachedTokens: Number(u.cachedContentTokenCount ?? 0),
    outputTokens: Number(u.candidatesTokenCount ?? 0),
  };
}

export function geminiProvider(env: Env, fetchFn: Fetch = fetch): Provider {
  // Its own key, in its own Google project: limits are per project, so chat must
  // not share extract-bill's GEMINI_API_KEY quota. No fallback to that key.
  const key = env("GEMINI_CHAT_API_KEY");
  const model = env("GEMINI_MODEL") || GEMINI_DEFAULT_MODEL;
  const thinkingLevel = env("GEMINI_THINKING_LEVEL");
  return {
    name: "gemini",
    model,
    configured: Boolean(key),
    async ask(system, user) {
      const res = await fetchFn(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        // The key goes in a header, never the URL, so it stays out of request logs.
        headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
        body: JSON.stringify(geminiRequest(system, user, thinkingLevel)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      // 429 is the free tier's per-project limit; 503 is Google's own load. Neither
      // is anything the shop did.
      if (res.status === 429 || res.status === 503 || body?.error?.status === "RESOURCE_EXHAUSTED") {
        throw new ProviderBusy(`gemini ${res.status} ${body?.error?.status ?? ""}`.trim());
      }
      // A reply Google blocks for safety comes back as a 400. It is a refusal:
      // the owner gets the figures with a reason, never a blank.
      if (res.status === 400 && /block|safety|prohibited/i.test(String(body?.error?.message ?? ""))) {
        return { text: "", stopReason: "refusal", inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
      }
      if (!res.ok) throw new Error(`gemini ${res.status} ${body?.error?.status ?? ""}`.trim());
      return geminiReply(body);
    },
  };
}

// Kept so that switching back is AI_PROVIDER=claude. Loaded only when chosen.
export function claudeProvider(env: Env): Provider {
  const key = env("ANTHROPIC_API_KEY");
  const model = "claude-haiku-5-5";
  return {
    name: "claude",
    model,
    configured: Boolean(key),
    async ask(system, user) {
      const spec = "npm:@anthropic-ai/sdk@1.5.0";
      const { default: Anthropic } = await import(spec);
      const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: TIMEOUT_MS });
      try {
        const res = await client.messages.create({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          thinking: { type: "disabled" },
          output_config: { effort: "low" },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
        });
        return {
          text: res.content.flatMap((b: any) => (b.type === "text" ? [b.text] : [])).join("").trim(),
          stopReason: res.stop_reason,
          inputTokens: res.usage.input_tokens,
          cachedTokens: res.usage.cache_read_input_tokens ?? 0,
          outputTokens: res.usage.output_tokens,
        };
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError && (e as any).status === 529) {
          throw new ProviderBusy(`claude ${(e as any).status}`);
        }
        throw e;
      }
    },
  };
}

export function makeProvider(env: Env, fetchFn: Fetch = fetch): Provider {
  return (env("AI_PROVIDER") || "gemini").toLowerCase() === "claude" ? claudeProvider(env) : geminiProvider(env, fetchFn);
}
