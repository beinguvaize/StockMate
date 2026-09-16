-- Teach the server-side plan gate the plans we actually sell.
--
-- has_module_access() recognised only PRO and ENTERPRISE. Every other value —
-- FREE, GROWTH, the one legacy STARTER row — fell to an ELSE branch granting
-- seven modules. RLS policies on employees, payroll, purchases, suppliers,
-- vehicles and settings call it, so a Growth tenant could open Payroll in a UI
-- that had granted it and take an RLS denial on the first write.
--
-- It is wider than the plan matrix. get_my_tenant_plan() returns the stored
-- plan and knows nothing about trials, while the client grants every trial PRO
-- via effectivePlan(). So the UI and the database disagreed for every
-- non-Enterprise trial tenant, not only Growth ones.
--
-- FUTURE DISPO is ENTERPRISE and ACTIVE: it took the unconditional true before
-- this change and takes it after. No paying customer's access moves.
--
-- Everything here mirrors src/lib/tenancy.js. Where the two must agree, the
-- comment says so — a second, subtly different copy of this logic is the bug
-- being fixed, not a thing to add more of.

-- Ladder order. Mirrors PLAN_ORDER.
CREATE OR REPLACE FUNCTION public.plan_rank(p_plan text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE upper(coalesce(p_plan, 'FREE'))
    WHEN 'FREE'       THEN 0
    WHEN 'GROWTH'     THEN 1
    WHEN 'PRO'        THEN 2
    WHEN 'ENTERPRISE' THEN 3
    ELSE 0
  END;
$$;

-- Module matrix. Mirrors PLANS[*].modules exactly.
CREATE OR REPLACE FUNCTION public.plan_modules(p_plan text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE upper(coalesce(p_plan, 'FREE'))
    WHEN 'ENTERPRISE' THEN ARRAY[
      'dashboard','inventory','sales','clients','expenses','daybook','invoices',
      'purchases','suppliers','vehicles','orders','payroll','reports',
      'estimates','manufacturing','accounts',
      'appointments','kds','labels','users','settings','audit-log']
    WHEN 'PRO' THEN ARRAY[
      'dashboard','inventory','sales','clients','expenses','daybook','invoices',
      'purchases','suppliers','vehicles','orders','payroll','reports',
      'estimates','manufacturing','accounts']
    WHEN 'GROWTH' THEN ARRAY[
      'dashboard','inventory','sales','clients','expenses','daybook','invoices',
      'purchases','suppliers','payroll','reports','estimates']
    -- FREE, and any unrecognised value. The client resolves an unknown plan to
    -- FREE the same way (PLANS[stored] ? stored : 'FREE'), which is what the
    -- surviving legacy STARTER row gets on both sides.
    ELSE ARRAY[
      'dashboard','inventory','sales','clients','expenses','daybook','invoices']
  END;
$$;

-- The plan a tenant is actually gated on. Mirrors effectivePlan().
--
--   not on trial            -> exactly what they pay for
--   trial running           -> the BETTER of stored plan and the trial grant,
--                              so an early signup written straight to
--                              ENTERPRISE is not resolved DOWN to PRO
--   trial lapsed past grace -> FREE; data is untouched, only modules close
--
-- Grace runs from the later of the trial's own end and TRIAL_ENFORCEMENT_START,
-- so a trial that lapsed before enforcement existed still gets the full window.
CREATE OR REPLACE FUNCTION public.get_my_effective_plan()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH t AS (
    SELECT plan, status, trial_end_date
      FROM public.tenants
     WHERE id = public.current_tenant_id()
     LIMIT 1
  ), k AS (
    SELECT t.*,
           CASE WHEN upper(coalesce(t.plan,'FREE'))
                     IN ('FREE','GROWTH','PRO','ENTERPRISE')
                THEN upper(t.plan) ELSE 'FREE' END AS known
      FROM t
  )
  SELECT CASE
    WHEN k.status IS DISTINCT FROM 'TRIAL' OR k.trial_end_date IS NULL
      THEN k.known
    WHEN now() > greatest(k.trial_end_date, timestamptz '2026-08-20T00:00:00Z')
                 + interval '7 days'                      -- TRIAL_GRACE_DAYS
      THEN 'FREE'
    WHEN public.plan_rank('PRO') > public.plan_rank(k.known)  -- TRIAL_PLAN
      THEN 'PRO'
    ELSE k.known
  END
  FROM k;
$$;

-- Same signature as before: CREATE OR REPLACE, never a second overload.
-- Adding a parameter here would create one and break every caller with
-- PGRST203, which is exactly what the schema guard exists to catch.
CREATE OR REPLACE FUNCTION public.has_module_access(p_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_global_admin()
      OR p_module = ANY(public.plan_modules(public.get_my_effective_plan()));
$$;
