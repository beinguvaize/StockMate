// ai-ask: answers the 12 set questions about a shop's books.
//
// Every shop-data read runs with the caller's JWT through the anon key, so RLS
// and the functions' own tenant filter apply. The service role is not used here
// at all. ANTHROPIC_API_KEY is a Supabase secret; without it the function still
// returns the figures, with reason ai_not_configured.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { handle, MODEL, type ModelReply } from "./handler.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function askModel(apiKey: string, system: string, user: string): Promise<ModelReply> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return {
    text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim(),
    stopReason: res.stop_reason,
    inputTokens: res.usage.input_tokens,
    cachedTokens: res.usage.cache_read_input_tokens ?? 0,
    outputTokens: res.usage.output_tokens,
  };
}

Deno.serve((req) => handle(req, {
  apiKey: () => Deno.env.get("ANTHROPIC_API_KEY") || undefined,
  db: (authHeader) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  askModel,
  now: () => new Date(),
  cors,
}));
