-- ==============================================================
-- RLS-01: Server-side plan-tier enforcement
-- ==============================================================
-- Context (verified against DB before writing):
--   * Tenant isolation is ALREADY enforced on every table via the
--     existing `tenant_{select,insert,update,delete}` policies using
--     `current_tenant_id()` + `is_tenant_admin()` / `is_global_admin()`.
--   * Helper functions `current_tenant_id`, `is_admin`, `is_tenant_admin`,
--     `is_global_admin` already exist.
--   * What is MISSING is plan-tier enforcement — a STARTER tenant can
--     still insert/update/delete rows in PRO-gated tables because the
--     existing policies only check tenant + admin role.
--
-- This migration is purely ADDITIVE. It does not drop or replace any
-- existing policy. It:
--   1. Adds `get_my_tenant_plan()` and `has_module_access(text)` helpers.
--   2. Adds `RESTRICTIVE` INSERT/UPDATE/DELETE policies on PRO-gated
--      tables. Restrictive policies are AND'd with the permissive
--      `tenant_*` policies, so the existing behaviour is preserved for
--      tenants whose plan includes the module and blocked otherwise.
--   3. SELECT is intentionally NOT gated — historical read access is
--      preserved on downgrade (users can still view past purchases
--      after a plan downgrade; they just cannot create new ones).
--   4. GLOBAL_ADMIN bypasses every gate via `is_global_admin()`.

-- ── 1. Helpers ────────────────────────────────────────────────────────────────

-- Resolve the plan of the calling user's tenant. Returns NULL if the
-- user is not attached to a tenant (treat as STARTER).
CREATE OR REPLACE FUNCTION public.get_my_tenant_plan()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.plan
  FROM public.tenants t
  WHERE t.id = public.current_tenant_id()
  LIMIT 1
$$;

-- Plan → module matrix. Mirrors src/lib/tenancy.js PLANS definition.
-- ENTERPRISE ⊃ PRO ⊃ STARTER. Returns TRUE for GLOBAL_ADMIN always.
CREATE OR REPLACE FUNCTION public.has_module_access(p_module text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_plan text;
BEGIN
  IF public.is_global_admin() THEN
    RETURN true;
  END IF;

  SELECT public.get_my_tenant_plan() INTO v_plan;

  CASE v_plan
    WHEN 'ENTERPRISE' THEN
      RETURN true;
    WHEN 'PRO' THEN
      RETURN p_module = ANY(ARRAY[
        'dashboard','inventory','sales','clients','expenses','daybook',
        'purchases','suppliers','vehicles','orders','payroll','reports','invoices'
      ]);
    ELSE  -- STARTER or NULL
      RETURN p_module = ANY(ARRAY[
        'dashboard','inventory','sales','clients','expenses','daybook','invoices'
      ]);
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_plan()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(text)      TO authenticated;

-- ── 2. Restrictive plan-gate policies ────────────────────────────────────────
-- Applied to PRO-gated tables. SELECT remains ungated (historical access).

DO $$
DECLARE
  rec record;
  module_mapping jsonb := '{
    "purchases":          "purchases",
    "suppliers":          "suppliers",
    "vehicles":           "vehicles",
    "routes":             "vehicles",
    "payroll":            "payroll",
    "employees":          "payroll",
    "mechanic_payments":  "vehicles"
  }';
BEGIN
  FOR rec IN SELECT * FROM jsonb_each_text(module_mapping) LOOP
    -- Drop prior attempts from earlier iterations so this migration is
    -- idempotent even if a partial run landed from a parallel session.
    EXECUTE format(
      'DROP POLICY IF EXISTS "plan_gate_insert" ON public.%I', rec.key);
    EXECUTE format(
      'DROP POLICY IF EXISTS "plan_gate_update" ON public.%I', rec.key);
    EXECUTE format(
      'DROP POLICY IF EXISTS "plan_gate_delete" ON public.%I', rec.key);

    EXECUTE format($f$
      CREATE POLICY "plan_gate_insert" ON public.%I
        AS RESTRICTIVE
        FOR INSERT TO authenticated
        WITH CHECK (public.has_module_access(%L))
    $f$, rec.key, rec.value);

    EXECUTE format($f$
      CREATE POLICY "plan_gate_update" ON public.%I
        AS RESTRICTIVE
        FOR UPDATE TO authenticated
        USING      (public.has_module_access(%L))
        WITH CHECK (public.has_module_access(%L))
    $f$, rec.key, rec.value, rec.value);

    EXECUTE format($f$
      CREATE POLICY "plan_gate_delete" ON public.%I
        AS RESTRICTIVE
        FOR DELETE TO authenticated
        USING (public.has_module_access(%L))
    $f$, rec.key, rec.value);
  END LOOP;
END $$;

-- ── 3. ENTERPRISE-only: settings ─────────────────────────────────────────────
-- `settings` is already tenant-isolated (tenant_select/insert/update exist).
-- Add a restrictive gate so only ENTERPRISE tenants can write.

DROP POLICY IF EXISTS "plan_gate_insert" ON public.settings;
DROP POLICY IF EXISTS "plan_gate_update" ON public.settings;
DROP POLICY IF EXISTS "plan_gate_delete" ON public.settings;

CREATE POLICY "plan_gate_insert" ON public.settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.has_module_access('settings'));

CREATE POLICY "plan_gate_update" ON public.settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING      (public.has_module_access('settings'))
  WITH CHECK (public.has_module_access('settings'));

CREATE POLICY "plan_gate_delete" ON public.settings
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.has_module_access('settings'));
