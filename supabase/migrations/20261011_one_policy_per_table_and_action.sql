-- One policy per table and action
-- ============================================================================
--
-- Eight table/action pairs carry two PERMISSIVE policies each. Postgres ORs
-- permissive policies together, so BOTH expressions are evaluated for every row
-- examined -- and after 20261008 made each one cheap, the remaining waste is
-- running two where one would do.
--
-- They are not all the same case, and the difference decides what is safe:
--
--   A STRICT SUBSET can simply be dropped. `a OR b` where b implies a is just
--   `a`, so removing b changes nothing about which rows are visible.
--
--   TWO DIFFERENT RULES must be merged into one policy with OR between them,
--   which is exactly what Postgres was computing anyway -- in one pass instead
--   of two.
--
--   A PAIR SAYING THE SAME THING TWICE collapses to whichever states it fully.
--
-- Every change below is one of those three. None widens or narrows access, and
-- each says which case it is.

BEGIN;

-- Every ALTER below goes through this, because the databases this runs against
-- are not identical: dev has no tenant_isolation on bank_accounts at all. A
-- bare ALTER POLICY raises on a policy that is not there, which would take down
-- a migration whose job is tidying. Altering only what exists leaves a database
-- that never had the duplicate exactly as it is.
CREATE OR REPLACE FUNCTION pg_temp.merge_policies(
  p_table text, p_keep text, p_drop text, p_using text, p_check text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql AS $fn$
BEGIN
  -- Both halves or neither. Altering the survivor and dropping the other as two
  -- independent statements is how a table ends up with NO policy: on a database
  -- where the survivor is absent -- dev has no tenant_isolation on
  -- bank_accounts -- the ALTER would skip and the DROP would still fire, and a
  -- table with RLS on and no policy denies everything.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table AND policyname = p_keep
  ) THEN
    RAISE NOTICE 'skipped %: % is not present here, so % is left alone',
      p_table, p_keep, p_drop;
    RETURN false;
  END IF;

  IF p_check IS NULL THEN
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p_keep, p_table, p_using);
  ELSE
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                   p_keep, p_table, p_using, p_check);
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_drop, p_table);
  RETURN true;
END
$fn$;


-- ── Strict subsets: the broader policy already allows everything ───────────

-- estimates INSERT: tenant_insert is (tenant = current). estimates_insert is
-- (tenant = current OR is_global_admin) -- strictly broader.
DROP POLICY IF EXISTS tenant_insert ON public.estimates;

-- serial_numbers INSERT: the same shape, the same way round.
DROP POLICY IF EXISTS tenant_insert ON public.serial_numbers;

-- profiles SELECT: user_read_own is (id = auth.uid()). tenant_select is
-- (tenant = current OR id = auth.uid() OR is_global_admin) and contains it.
DROP POLICY IF EXISTS user_read_own ON public.profiles;

-- profiles UPDATE: both USING are (id = auth.uid()). self_update declares no
-- WITH CHECK, so its USING serves as the check; user_update_own declares the
-- same expression explicitly. Keeping the explicit one loses nothing.
DROP POLICY IF EXISTS self_update ON public.profiles;

-- ── The same rule written twice ────────────────────────────────────────────
--
-- `tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())` is the
-- body of current_tenant_id(), inlined. tenant_isolation says it by calling the
-- function; the tenant_rw pair says it by hand. They cannot disagree: a user
-- has one row in users, so IN and = select the same tenant.
--
-- tenant_isolation declares no WITH CHECK, which for a FOR ALL policy means its
-- USING is used for writes too -- the same expression either way. It is given
-- the check explicitly here so that nothing depends on knowing that rule.

SELECT pg_temp.merge_policies('bank_accounts', 'tenant_isolation', 'bank_accounts tenant_rw',
  'tenant_id = ( SELECT public.current_tenant_id() )',
  'tenant_id = ( SELECT public.current_tenant_id() )');

SELECT pg_temp.merge_policies('bank_transactions', 'tenant_isolation', 'bank_transactions tenant_rw',
  'tenant_id = ( SELECT public.current_tenant_id() )',
  'tenant_id = ( SELECT public.current_tenant_id() )');

-- ── Genuinely different rules, merged with the OR Postgres was applying ────

-- tenant_invitations: a global admin sees everything; a tenant admin sees their
-- own tenant's invitations. Neither contains the other.
SELECT pg_temp.merge_policies('tenant_invitations', 'tenant_admin_all', 'global_admin_all',
  '( SELECT public.is_global_admin() ) OR (tenant_id = ( SELECT public.current_tenant_id() ) AND ( SELECT public.is_tenant_admin() ))');

-- users SELECT: your tenant's users, or a global admin, or yourself. The third
-- is not covered by the first two -- a user whose own row is how the tenant is
-- resolved must be able to read it. current_tenant_id() is SECURITY DEFINER and
-- so does not re-enter this policy.
SELECT pg_temp.merge_policies('users', 'tenant_select', 'user_self_read',
  'tenant_id = ( SELECT public.current_tenant_id() ) OR ( SELECT public.is_global_admin() ) OR id = ( SELECT auth.uid() )::text');

-- ── Prove it ───────────────────────────────────────────────────────────────
DO $check$
DECLARE
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT tablename, cmd, roles::text
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
      AND tablename IN ('bank_accounts','bank_transactions','estimates','profiles',
                        'serial_numbers','tenant_invitations','users')
    GROUP BY tablename, cmd, roles::text
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION '% table/action pairs still carry two permissive policies', v_dupes;
  END IF;
END
$check$;

COMMIT;
