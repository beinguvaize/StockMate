-- ==============================================================
-- RLS-01 regression test — plan-tier enforcement matrix
-- ==============================================================
-- Asserts has_module_access() answers correctly for a non-GLOBAL_ADMIN
-- owner under STARTER / PRO / ENTERPRISE plans. Every policy added by
-- the RLS-01 migrations delegates to this function, so if the matrix
-- is correct here, all 22 plan_gate_* policies are correct too.
--
-- Side-effect-free: BEGIN / ROLLBACK wraps everything. Fails loud with
-- RAISE EXCEPTION if any assertion breaks. Emits 'OK:' notices on pass.
--
-- Test subject:
--   tenant: 2985e65a-65ac-4a80-b261-8d53348d734c  (future dispo trading)
--   user:   61cd12e8-8637-4d92-b05c-7eda3cdfa297  (OWNER, not GLOBAL_ADMIN)

BEGIN;

DO $test$
DECLARE
  k_tenant uuid := '2985e65a-65ac-4a80-b261-8d53348d734c';
  k_user   text := '61cd12e8-8637-4d92-b05c-7eda3cdfa297';
  -- expected matrix: rows = plan, cols = (inventory, purchases, payroll, settings, audit-log)
  expected jsonb := jsonb_build_object(
    'STARTER',    jsonb_build_object('inventory',true,  'purchases',false,'payroll',false,'settings',false,'audit-log',false),
    'PRO',        jsonb_build_object('inventory',true,  'purchases',true, 'payroll',true, 'settings',false,'audit-log',false),
    'ENTERPRISE', jsonb_build_object('inventory',true,  'purchases',true, 'payroll',true, 'settings',true, 'audit-log',true)
  );
  plan_key text;
  mod_key  text;
  exp_val  boolean;
  got_val  boolean;
  passed   int := 0;
BEGIN
  -- Sanity: subject user exists and is not GLOBAL_ADMIN
  PERFORM 1 FROM public.users
  WHERE id = k_user AND NOT ('GLOBAL_ADMIN' = ANY(roles));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RLS-01 FAIL: test subject user missing or is GLOBAL_ADMIN; update test ids';
  END IF;

  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', k_user), true);

  FOR plan_key IN SELECT jsonb_object_keys(expected) LOOP
    UPDATE public.tenants SET plan = plan_key WHERE id = k_tenant;

    FOR mod_key IN SELECT jsonb_object_keys(expected -> plan_key) LOOP
      exp_val := (expected -> plan_key ->> mod_key)::boolean;
      got_val := public.has_module_access(mod_key);
      IF got_val IS DISTINCT FROM exp_val THEN
        RAISE EXCEPTION 'RLS-01 FAIL: %.% — expected %, got %',
          plan_key, mod_key, exp_val, got_val;
      END IF;
      passed := passed + 1;
    END LOOP;

    RAISE NOTICE 'OK: % — 5/5', plan_key;
  END LOOP;

  RAISE NOTICE 'OK: RLS-01 plan-gate matrix — %/15 assertions pass', passed;
END
$test$;

ROLLBACK;
