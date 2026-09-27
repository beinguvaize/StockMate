/**
 * Start a Razorpay subscription for the caller's tenant.
 * ===========================================================================
 * The client asks for a PLAN KEY, never a price and never a Razorpay plan id.
 * Both are resolved here from billing_plan_map, so a browser cannot ask to be
 * billed ₹1 for PRO by editing the request.
 *
 * This function does NOT change tenants.plan. Nothing is paid for yet at this
 * point — the subscription is only authorised when Razorpay says so, and that
 * arrives at the webhook. Granting the plan here is the classic mistake: the
 * user closes the checkout and keeps the upgrade.
 *
 *   supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) return json({ error: "billing is not configured" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authError } =
      await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { plan } = await req.json();
    if (!["GROWTH", "PRO"].includes(plan)) {
      // FREE needs no subscription; ENTERPRISE is a conversation, not a
      // checkout. Anything else is someone probing the endpoint.
      return json({ error: "unsupported plan" }, 400);
    }

    // The caller's tenant, from the database — never from the request body.
    const { data: profile } = await admin
      .from("users").select("tenant_id, role").eq("id", user.id).maybeSingle();
    if (!profile?.tenant_id) return json({ error: "no tenant" }, 403);
    if (!["OWNER", "ADMIN"].includes(String(profile.role))) {
      // Buying a plan is an owner's decision. Staff should not be able to put
      // a bill on the business.
      return json({ error: "not permitted" }, 403);
    }

    const mode = Deno.env.get("RAZORPAY_MODE") ?? "test";
    const { data: mapped } = await admin
      .from("billing_plan_map")
      .select("razorpay_plan_id")
      .eq("plan", plan).eq("mode", mode)
      .maybeSingle();
    if (!mapped?.razorpay_plan_id) return json({ error: `no ${mode} plan configured for ${plan}` }, 500);

    const rz = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
      },
      body: JSON.stringify({
        plan_id: mapped.razorpay_plan_id,
        customer_notify: 1,
        total_count: 10,           // ten yearly cycles; Razorpay requires a count
        notes: { tenant_id: profile.tenant_id, plan },
      }),
    });

    const sub = await rz.json();
    if (!rz.ok) {
      console.error("razorpay subscription create failed", sub?.error?.description);
      return json({ error: sub?.error?.description ?? "razorpay error" }, 502);
    }

    // Record it BEFORE the user pays. The webhook needs a row to attach to,
    // and an authorised payment arriving for a subscription we never stored
    // is a payment we cannot credit to anyone.
    const { error: insErr } = await admin.from("billing_subscriptions").insert({
      tenant_id: profile.tenant_id,
      razorpay_subscription_id: sub.id,
      razorpay_plan_id: mapped.razorpay_plan_id,
      plan,
      status: sub.status ?? "created",
    });
    if (insErr) {
      console.error("could not record subscription", insErr.message);
      return json({ error: "could not record subscription" }, 500);
    }

    // key_id is publishable; the secret stays here.
    return json({ subscriptionId: sub.id, keyId, plan });
  } catch (e) {
    console.error(e);
    return json({ error: "unexpected error" }, 500);
  }
});
