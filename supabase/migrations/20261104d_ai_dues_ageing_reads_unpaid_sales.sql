-- ai_dues_ageing reads get_unpaid_sales, the one definition of a client's unpaid bills
-- ============================================================================
--
-- It held its own copy of the rule, and the copy had already drifted: > 0 here,
-- > 0.005 there, so a fraction of a paisa counted as a bill on this screen and
-- not on the Customer Aging report. Same signature, so no overload.

CREATE OR REPLACE FUNCTION public.ai_dues_ageing()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant  uuid := public.ai_owner_tenant();
  v_today   date := public.ai_shop_today();
  v_total   numeric;
  v_bucket  numeric;
  v_oldest  int;
  v_buckets jsonb;
BEGIN
  SELECT COALESCE(SUM(c.outstanding_balance), 0) INTO v_total
    FROM public.clients c
   WHERE c.tenant_id = v_tenant AND c.deleted_at IS NULL;

  WITH unpaid AS (
    SELECT g.unpaid AS due, v_today - g.sale_date AS age
      FROM public.get_unpaid_sales(v_tenant) g
  ), slots(ord, label, lo, hi) AS (
    VALUES (1, '0-30', NULL::int, 30), (2, '31-60', 31, 60), (3, '61-90', 61, 90), (4, '90+', 91, NULL::int)
  ), filled AS (
    SELECT sl.ord, sl.label, COALESCE(SUM(u.due), 0) AS amount, COUNT(u.due) AS bill_count
      FROM slots sl
      LEFT JOIN unpaid u ON (sl.lo IS NULL OR u.age >= sl.lo) AND (sl.hi IS NULL OR u.age <= sl.hi)
     GROUP BY sl.ord, sl.label
  )
  SELECT (SELECT COALESCE(SUM(due), 0) FROM unpaid),
         (SELECT MAX(age) FROM unpaid),
         (SELECT jsonb_agg(jsonb_build_object('label', f.label, 'amount', ROUND(f.amount, 2), 'bill_count', f.bill_count) ORDER BY f.ord) FROM filled f)
    INTO v_bucket, v_oldest, v_buckets;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'total_outstanding', ROUND(v_total, 2),
    'buckets', v_buckets,
    'oldest_days', COALESCE(v_oldest, 0),
    'unmatched_amount', ROUND(v_total - v_bucket, 2));
END
$fn$;
