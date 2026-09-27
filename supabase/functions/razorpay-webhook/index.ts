/**
 * Razorpay webhook → tenants.plan
 * ===========================================================================
 * This is the only thing in the system that turns money into an entitlement.
 * Everything it does is therefore written defensively:
 *
 *  1. The signature is verified over the RAW body. Parsing first and
 *     re-serialising produces a different byte string — different key order,
 *     different whitespace — and the HMAC will not match. This is the single
 *     most common way a Razorpay webhook integration ends up "verifying"
 *     nothing.
 *  2. The comparison is constant-time. A === on hex strings leaks, through
 *     timing, how many leading characters of a forged signature were right.
 *  3. The signing key is the WEBHOOK SECRET from the dashboard, not the API
 *     key secret. They are different values and mixing them up fails closed.
 *  4. Idempotency lives in the database, keyed on Razorpay's event id.
 *     Razorpay retries until it gets a 2xx, so duplicates are routine.
 *
 * Secrets are read from the environment and never appear in this repository:
 *   supabase secrets set RAZORPAY_WEBHOOK_SECRET=...
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
}

/** Constant time for equal-length strings; length mismatch fails immediately. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) {
    // Fail closed. A missing secret must never mean "skip verification".
    console.error("RAZORPAY_WEBHOOK_SECRET is not set");
    return new Response("misconfigured", { status: 500 });
  }

  // RAW body. Do not touch it before the signature is checked.
  const raw = await req.text();
  const given = req.headers.get("x-razorpay-signature") ?? "";

  if (!safeEqual(await sign(raw, secret), given)) {
    // 400, not 401: Razorpay should not retry a body that will never verify.
    console.warn("razorpay webhook: signature mismatch");
    return new Response("invalid signature", { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const eventType = String(body.event ?? "");
  // Razorpay sends the event id in a header; fall back to a deterministic key
  // so idempotency still holds if that header is ever absent.
  const eventId = req.headers.get("x-razorpay-event-id")
    ?? `${eventType}:${(body as any)?.payload?.subscription?.entity?.id}:${body.created_at}`;

  const sub = (body as any)?.payload?.subscription?.entity;
  if (!sub?.id) {
    // Payment-only events share this endpoint; acknowledge so Razorpay stops
    // retrying something we have deliberately chosen not to act on.
    return new Response(JSON.stringify({ ok: true, ignored: eventType }), { status: 200 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Razorpay sends seconds; Postgres wants an instant.
  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;

  const { data, error } = await admin.rpc("apply_subscription_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_subscription_id: sub.id,
    p_plan_id: sub.plan_id ?? null,
    p_status: sub.status ?? "unknown",
    p_period_end: periodEnd,
    p_payload: body,
  });

  if (error) {
    // 500 so Razorpay retries: a database blip should not silently lose a
    // payment someone has already made.
    console.error("apply_subscription_event failed", error.message);
    return new Response("rpc failed", { status: 500 });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
