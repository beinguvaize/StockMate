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

    // Get the caller's profile to find their tenant_id
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (callerError || !caller) throw new Error("Unauthorized");

    const { data: adminProfile } = await supabaseAdmin
      .from("users")
      .select("tenant_id, roles")
      .eq("id", caller.id)
      .single();

    if (!adminProfile?.tenant_id) throw new Error("Admin must belong to a tenant");

    const { email, password, name, roles, permissions, tenant_id: requestedTenantId } = await req.json();

    // Determine target tenant: Default to caller's tenant, but allow override if GLOBAL_ADMIN
    let targetTenantId = adminProfile.tenant_id;
    const isGlobalAdmin = (adminProfile.roles || []).includes('GLOBAL_ADMIN');
    
    if (isGlobalAdmin && requestedTenantId) {
      targetTenantId = requestedTenantId;
    }

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "email, password, and name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Create auth user with admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, roles, permissions, tenant_id: targetTenantId },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // Step 2: Create profile in public.profiles (source of truth for RLS)
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      name,
      roles: roles || ["STAFF"],
      status: "ACTIVE",
      tenant_id: targetTenantId
    });

    // Step 3: Upsert into legacy public.users (for frontend compatibility)
    const { error: profileError } = await supabaseAdmin.from("users").upsert({
      id: userId,
      email,
      name,
      roles: roles || ["STAFF"],
      permissions: permissions || {},
      status: "ACTIVE",
      tenant_id: targetTenantId
    });

    if (profileError) {
      console.error("Profile save error:", profileError);
    }

    return new Response(
      JSON.stringify({ id: userId, email, name, roles, permissions, tenant_id: targetTenantId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
