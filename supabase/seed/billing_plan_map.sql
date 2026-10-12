-- The Razorpay plan map
-- ============================================================================
--
-- One row per (plan, mode). `create-subscription` reads it to turn a plan KEY
-- from the browser into a Razorpay plan id, which is the whole reason a client
-- cannot ask to be billed Rs 1 for PRO by editing the request body.
--
-- NOT A MIGRATION, and deliberately not one. The ids below belong to one
-- Razorpay account; a migration carrying them would try to install this
-- account's plans on every database that ever runs it, including a scratch one
-- in CI. The table's shape is the migration (20260927_razorpay_billing.sql);
-- its contents are configuration.
--
-- ── Fill this in before running it ──────────────────────────────────────────
--
-- Every `plan_XXXX_…` id below is a placeholder. The real ids come from
-- the Razorpay dashboard -> Subscriptions -> Plans, and they look like
-- `plan_NaBcDeFgHiJkLm`. There are two sets of them: test-mode plans exist
-- only under the test keys and live-mode plans only under the live ones, which
-- is why `mode` is part of the row and why RAZORPAY_MODE selects between them.
--
-- Create the plans in Razorpay with the SAME amounts as the rows below, in
-- paise, yearly. If they disagree, Razorpay's figure is the one the customer
-- is charged -- this table does not price anything, it only maps.
--
--   bookledger.in/pricing      amount_paise
--   Growth   Rs 1,999 / yr       199900
--   Pro      Rs 2,999 / yr       299900
--   Enterprise Rs 3,999 / yr     399900
--
-- Running it with a placeholder still in place is not dangerous -- Razorpay
-- rejects an unknown plan id and the checkout returns a 502 -- but it is a
-- checkout that fails for a customer rather than for you, so the guard at the
-- bottom refuses to leave one behind.
--
--   psql "$SUPABASE_DB_URL" -f supabase/seed/billing_plan_map.sql
--
-- ON CONFLICT, so re-running it after a price change updates rather than
-- duplicating. Rotating a plan id is an INSERT of the new one and a DELETE of
-- the old; never an UPDATE of the primary key, because billing_subscriptions
-- rows still point at the old id and should keep resolving.

BEGIN;

-- The placeholders differ from each other on purpose: razorpay_plan_id is the
-- primary key, so six rows carrying one placeholder would collapse into one
-- row through the ON CONFLICT below rather than failing, and the table would
-- end up with a single ENTERPRISE/live row and no sign that five were lost.
INSERT INTO public.billing_plan_map (razorpay_plan_id, plan, mode, amount_paise, period) VALUES
  ('plan_XXXX_GROWTH_TEST', 'GROWTH',     'test', 199900, 'yearly'),
  ('plan_XXXX_PRO_TEST',    'PRO',        'test', 299900, 'yearly'),
  ('plan_XXXX_ENT_TEST',    'ENTERPRISE', 'test', 399900, 'yearly'),
  ('plan_XXXX_GROWTH_LIVE', 'GROWTH',     'live', 199900, 'yearly'),
  ('plan_XXXX_PRO_LIVE',    'PRO',        'live', 299900, 'yearly'),
  ('plan_XXXX_ENT_LIVE',    'ENTERPRISE', 'live', 399900, 'yearly')
ON CONFLICT (razorpay_plan_id) DO UPDATE
  SET plan         = EXCLUDED.plan,
      mode         = EXCLUDED.mode,
      amount_paise = EXCLUDED.amount_paise,
      period       = EXCLUDED.period;

-- ── Refuse to finish with a placeholder in the table ───────────────────────
DO $check$
DECLARE
  v_bad text[];
BEGIN
  SELECT array_agg(plan || '/' || mode ORDER BY mode, plan) INTO v_bad
  FROM public.billing_plan_map
  WHERE razorpay_plan_id LIKE 'plan\_X%';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Still a placeholder plan id for: %. Paste the real ids from the Razorpay dashboard and run this again.',
      array_to_string(v_bad, ', ');
  END IF;
END
$check$;

-- A second pair of eyes on the thing nobody notices until a customer is
-- charged: two plans sharing one Razorpay id would bill them the same amount
-- for different access.
DO $dupes$
DECLARE
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT plan, mode FROM public.billing_plan_map GROUP BY plan, mode HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION '% plan/mode pairs map to more than one Razorpay plan; create-subscription picks one at random', v_dupes;
  END IF;
END
$dupes$;

COMMIT;

-- Check what is live:
--   SELECT plan, mode, amount_paise/100.0 AS rupees, razorpay_plan_id
--     FROM public.billing_plan_map ORDER BY mode, plan;
