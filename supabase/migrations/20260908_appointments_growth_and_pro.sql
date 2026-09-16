-- Sell appointments to the customers who actually want them.
--
-- `appointments` sat in the ENTERPRISE list alone, so a salon or a tuition
-- centre — this vertical's entire market — got the Upgrade Required screen on
-- the feature they signed up for. tenancy.js records that Enterprise was a
-- conservative default, to be moved down if it should sell lower.
--
-- It goes into GROWTH *and* PRO. The module arrays are explicit, not
-- cumulative: adding it to GROWTH alone would still leave every PRO tenant
-- locked out, and every TRIAL resolves to PRO through effectivePlan() — so the
-- one services tenant on prod would have stayed blocked for its whole trial.
--
-- plan_modules is re-emitted WHOLE rather than appended to. The function
-- returns a literal array per branch, and the JS list and the SQL list drifting
-- apart is exactly the bug 20260904_plan_gate_knows_current_plans.sql was
-- written to fix. plan_rank, get_my_effective_plan and has_module_access are
-- untouched, and no parameter changes, so no new overload.

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
      'estimates','manufacturing','accounts','appointments']
    WHEN 'GROWTH' THEN ARRAY[
      'dashboard','inventory','sales','clients','expenses','daybook','invoices',
      'purchases','suppliers','payroll','reports','estimates','appointments']
    -- FREE, and any unrecognised value. The client resolves an unknown plan to
    -- FREE the same way (PLANS[stored] ? stored : 'FREE').
    ELSE ARRAY[
      'dashboard','inventory','sales','clients','expenses','daybook','invoices']
  END;
$$;
