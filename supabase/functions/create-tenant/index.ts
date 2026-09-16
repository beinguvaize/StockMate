import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get the caller's identity
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const {
      businessName,
      // STARTER was the default here long after it stopped being a plan we
      // sell, which is how the one legacy STARTER tenant got written. FREE is
      // the bottom of the current ladder.
      plan = "FREE",
      businessType = "RETAIL",
      phone = "",
      address = "",
      state = "",
      stateCode = "",
    } = await req.json();

    if (!businessName) {
      throw new Error("Business name is required");
    }

    // Both are printed on every GST invoice, so they are captured at signup
    // rather than left to a Settings page most tenants never open: of the
    // first twelve, three had an address and three had a phone.
    //
    // Deliberately NOT normalised through toE164: that rejects anything but a
    // mobile, and a shop's landline is a perfectly good number to print on an
    // invoice. Store what they typed, minus obvious padding.
    const bizPhone = String(phone || "").trim().slice(0, 20);
    const bizAddress = String(address || "").trim().slice(0, 500);

    // The state decides CGST+SGST versus IGST, and calculateGST falls back to
    // intra-state whenever the seller's state is blank — so a missing state
    // silently taxes every interstate sale as if it were local. The client
    // sends the name it showed and the code it derived; the code is kept to
    // two digits and never invented here.
    const bizState = String(state || "").trim().slice(0, 60);
    const bizStateCode = /^\d{2}$/.test(String(stateCode || "").trim())
      ? String(stateCode).trim()
      : null;

    // Vertical identity (Stage A). Guard to the allowed set; default RETAIL.
    const VALID_TYPES = ["RETAIL", "RESTAURANT", "SERVICES"];
    const business_type = VALID_TYPES.includes(String(businessType).toUpperCase())
      ? String(businessType).toUpperCase()
      : "RETAIL";

    // 1. Generate Slug
    let slug = businessName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check for slug uniqueness
    const { data: existingTenant } = await supabaseAdmin
      .from("tenants")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (existingTenant) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // 2. Create Tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: businessName,
        slug: slug,
        plan: plan,
        business_type: business_type,
        status: 'TRIAL',
        trial_end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        owner_id: user.id,
      })
      .select()
      .single();

    if (tenantError) throw tenantError;

    // 3. Upsert User Profile with tenant_id
    // Use upsert so it works even when public.users row doesn't exist yet
    // (e.g. after a DB wipe that cleared public.users but kept auth.users)
    const { error: profileError } = await supabaseAdmin
      .from("users")
      .upsert({
        id: user.id,
        email: user.email,
        tenant_id: tenant.id,
        roles: ["OWNER", "STAFF"],
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Owner',
      }, { onConflict: 'id' });

    if (profileError) throw profileError;

    // 4. Initialize Business Profile
    const { error: bizError } = await supabaseAdmin
      .from("business_profile")
      .insert({
        id: crypto.randomUUID(), // Assuming text ID for profiles in this project
        name: businessName,
        tenant_id: tenant.id,
        invoice_prefix: "INV",
        invoice_counter: 1,
        phone: bizPhone || null,
        address: bizAddress || null,
        state: bizState || null,
        state_code: bizStateCode,
      });

    if (bizError) throw bizError;

    // 5. Initialize Settings
    const { error: settingsError } = await supabaseAdmin
      .from("settings")
      .insert([
        { tenant_id: tenant.id, key: "theme", value: { mode: "dark" } },
        { tenant_id: tenant.id, key: "notifications", value: { email: true } }
      ]);

    if (settingsError) throw settingsError;


    return new Response(
      JSON.stringify(tenant),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
