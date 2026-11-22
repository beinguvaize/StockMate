-- Phone Sales history: period summary computed on the server
-- ============================================================================
--
-- The phone listed at most 500 sales and summed them client-side, so "Total"
-- and "N bills" were wrong for any tenant with more than 500 sales. This
-- function returns the figures for a date range over ALL rows.
--
-- Rules of 20261104_ai_chat_read_functions.sql, except the tenant: no tenant
-- argument, taken from the session via current_tenant_id() (NOT
-- ai_owner_tenant(): staff see Sales on the phone, so staff must be allowed).
-- SECURITY INVOKER + STABLE, search_path pinned, explicit tenant_id filter as
-- well as RLS, deleted_at IS NULL. New function, single signature.
--
-- The mapping mirrors sales_screen.dart as it stood before this change:
--
--   countable  every row with deleted_at IS NULL and date::date in
--              [p_from, p_to]. The screen summed totalAmount over every row in
--              range (it excluded only local 'refused' outbox rows, which are
--              not on the server). It did NOT drop VOIDED/FAILED rows, so
--              neither does this. (ai_countable() would drop them: not used,
--              to keep the figure equal to what the phone showed.)
--   total      SUM("totalAmount")
--   bills      COUNT(*)
--   due        the screen's per-row Collect strip: rows whose upper
--              "paymentStatus" is not PAID, VOIDED or FAILED, each
--              GREATEST("totalAmount" - "paidAmount", 0), summed
--   credit_bills  count of those rows with that due > 0
--
-- p_from / p_to NULL = no bound on that side (the "All time" period).
-- Pending sales still queued on the phone are not on the server; the app adds
-- them on top locally.

CREATE OR REPLACE FUNCTION public.sales_period_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_total numeric; v_bills bigint; v_due numeric; v_credit bigint;
BEGIN
  SELECT COALESCE(SUM(s."totalAmount"), 0),
         COUNT(*),
         COALESCE(SUM(d.due) FILTER (WHERE d.owes), 0),
         COUNT(*) FILTER (WHERE d.owes)
    INTO v_total, v_bills, v_due, v_credit
    FROM public.sales s
   CROSS JOIN LATERAL (
     SELECT GREATEST(COALESCE(s."totalAmount", 0) - COALESCE(s."paidAmount", 0), 0) AS due,
            upper(COALESCE(s."paymentStatus", '')) NOT IN ('PAID', 'VOIDED', 'FAILED')
              AND COALESCE(s."totalAmount", 0) - COALESCE(s."paidAmount", 0) > 0 AS owes
   ) d
   WHERE s.tenant_id = v_tenant
     AND s.deleted_at IS NULL
     AND (p_from IS NULL OR s.date::date >= p_from)
     AND (p_to   IS NULL OR s.date::date <= p_to);

  RETURN jsonb_build_object(
    'total', ROUND(v_total, 2),
    'bills', v_bills,
    'due', ROUND(v_due, 2),
    'credit_bills', v_credit
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.sales_period_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_period_summary(date, date) TO authenticated;
