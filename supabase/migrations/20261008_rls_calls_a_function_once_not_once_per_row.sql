-- RLS calls a function once, not once per row
-- ============================================================================
--
-- 196 of 319 policies call a function in their expression WITHOUT wrapping it
-- in a subselect. Postgres then treats it as row-dependent and evaluates it for
-- every row it examines.
--
-- current_tenant_id() is not a cheap read of a session variable. It is:
--
--     SELECT tenant_id FROM public.users WHERE id = (auth.uid())::text LIMIT 1
--
-- so a policy that names it directly runs that query once per row scanned.
-- Reading the 1,187 sales on the largest tenant performs 1,187 lookups against
-- users on top of the query actually asked for. Supabase's own advisor reports
-- it as auth_rls_initplan across 74 tables.
--
-- Wrapped as (select public.current_tenant_id()), Postgres hoists it into an
-- InitPlan and evaluates it ONCE per query. The functions involved are all
-- no-argument and STABLE, so the value cannot differ between rows of one
-- statement -- which is why this is a performance change and not a semantic
-- one.
--
-- It matters more than it did last week: fetchAllPages now reads whole tables
-- rather than the newest 500 rows, which is correct and which multiplies
-- exactly this per-row cost.
--
-- HOW
--
-- ALTER POLICY, not DROP and CREATE. A dropped policy is a table with one less
-- rule on it, and for the moment between the two statements the table is open.
-- ALTER swaps the expression in place.
--
-- Only no-argument calls to a known list are touched, and only where they are
-- not already wrapped. Anything the pattern does not recognise is left exactly
-- as it is. A second block then re-reads every policy and fails the migration
-- if any unwrapped call remains, so this cannot report success over a policy it
-- quietly skipped.

BEGIN;

DO $do$
DECLARE
  r          record;
  v_qual     text;
  v_check    text;
  v_new_q    text;
  v_new_c    text;
  v_done     int := 0;
  fn         text;
  -- Every one of these is no-argument and STABLE: the value is fixed for the
  -- whole statement, so hoisting it cannot change which rows match.
  fns        text[] := ARRAY[
    'auth.uid', 'auth.role', 'auth.jwt',
    'public.current_tenant_id', 'current_tenant_id',
    'public.is_global_admin', 'is_global_admin',
    'public.is_tenant_member', 'is_tenant_member',
    'public.is_tenant_admin', 'is_tenant_admin',
    'public.is_staff', 'is_staff',
    'public.is_admin_safe', 'is_admin_safe'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    v_qual  := r.qual;
    v_check := r.with_check;
    v_new_q := v_qual;
    v_new_c := v_check;

    FOREACH fn IN ARRAY fns LOOP
      -- `fn()` not already preceded by `select `. The negative lookbehind is
      -- what stops a second pass wrapping an already-wrapped call.
      IF v_new_q IS NOT NULL THEN
        v_new_q := regexp_replace(
          v_new_q,
          '(?<!select )' || replace(fn, '.', '\.') || '\(\)',
          '( SELECT ' || fn || '() )',
          'gi');
      END IF;
      IF v_new_c IS NOT NULL THEN
        v_new_c := regexp_replace(
          v_new_c,
          '(?<!select )' || replace(fn, '.', '\.') || '\(\)',
          '( SELECT ' || fn || '() )',
          'gi');
      END IF;
    END LOOP;

    CONTINUE WHEN v_new_q IS NOT DISTINCT FROM v_qual
              AND v_new_c IS NOT DISTINCT FROM v_check;

    IF v_new_q IS NOT NULL AND v_new_c IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_q, v_new_c);
    ELSIF v_new_q IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_q);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     r.policyname, r.schemaname, r.tablename, v_new_c);
    END IF;

    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'rewrote % policies', v_done;
END
$do$;

-- Prove it. Any policy still calling one of these per row fails the migration
-- rather than letting it report a success it did not achieve.
DO $check$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (qual       ~* '(?<!select )(auth\.(uid|role|jwt)|(public\.)?(current_tenant_id|is_global_admin|is_tenant_member|is_tenant_admin|is_staff|is_admin_safe))\(\)')
      OR
      (with_check ~* '(?<!select )(auth\.(uid|role|jwt)|(public\.)?(current_tenant_id|is_global_admin|is_tenant_member|is_tenant_admin|is_staff|is_admin_safe))\(\)')
    );

  IF v_left > 0 THEN
    RAISE EXCEPTION '% policies still evaluate a function per row', v_left;
  END IF;
END
$check$;

COMMIT;
