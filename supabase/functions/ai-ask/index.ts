// ai-ask: answers the 12 set questions about a shop's books.
//
// Every shop-data read runs with the caller's JWT through the anon key, so RLS
// and the functions' own tenant filter apply. The service role is not used here
// at all. The AI provider comes from providers.ts (AI_PROVIDER, default gemini);
// without its key the function still returns the figures, with reason
// ai_not_configured.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { handle } from "./handler.ts";
import { makeProvider } from "./providers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => handle(req, {
  ai: makeProvider((k) => Deno.env.get(k)),
  db: (authHeader) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  now: () => new Date(),
  cors,
}));
