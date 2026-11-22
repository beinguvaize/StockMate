-- Phone Dashboard: payment-method split on sales_period_summary
-- ============================================================================
--
-- Same signature, same keys and semantics as 20261122_sales_period_summary.sql
-- (including the ai_countable(...) filter prod already carries). Adds four
-- keys, each a SUM("totalAmount") over the same countable rows:
--
--   cash    upper("paymentMethod") = 'CASH'
--   upi     'UPI'
--   bank    'BANK', 'CARD', 'CHEQUE', 'ONLINE', and anything not listed here
--   credit  'CREDIT', 'CREDIT_SALE', 'UDHAAR'
--
-- Values seen in the phone/web code: CASH, UPI, BANK, CARD, CHEQUE, CREDIT
-- (the phone maps CREDIT_SALE to CREDIT before saving; UDHAAR is legacy).
-- cash + upi + bank + credit = total. The phone falls back to no split bar
-- when the keys are absent (older deployment).

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
  v_cash numeric; v_upi numeric; v_bank numeric; v_creditamt numeric;
BEGIN
  SELECT COALESCE(SUM(s."totalAmount"), 0),
         COUNT(*),
         COALESCE(SUM(d.due) FILTER (WHERE d.owes), 0),
         COUNT(*) FILTER (WHERE d.owes),
         COALESCE(SUM(s."totalAmount") FILTER (WHERE upper(COALESCE(s."paymentMethod", '')) = 'CASH'), 0),
         COALESCE(SUM(s."totalAmount") FILTER (WHERE upper(COALESCE(s."paymentMethod", '')) = 'UPI'), 0),
         COALESCE(SUM(s."totalAmount") FILTER (WHERE upper(COALESCE(s."paymentMethod", '')) NOT IN
                   ('CASH', 'UPI', 'CREDIT', 'CREDIT_SALE', 'UDHAAR')), 0),
         COALESCE(SUM(s."totalAmount") FILTER (WHERE upper(COALESCE(s."paymentMethod", '')) IN
                   ('CREDIT', 'CREDIT_SALE', 'UDHAAR')), 0)
    INTO v_total, v_bills, v_due, v_credit, v_cash, v_upi, v_bank, v_creditamt
    FROM public.sales s
   CROSS JOIN LATERAL (
     SELECT GREATEST(COALESCE(s."totalAmount", 0) - COALESCE(s."paidAmount", 0), 0) AS due,
            upper(COALESCE(s."paymentStatus", '')) NOT IN ('PAID', 'VOIDED', 'FAILED')
              AND COALESCE(s."totalAmount", 0) - COALESCE(s."paidAmount", 0) > 0 AS owes
   ) d
   WHERE s.tenant_id = v_tenant
     AND s.deleted_at IS NULL
     AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
     AND (p_from IS NULL OR s.date::date >= p_from)
     AND (p_to   IS NULL OR s.date::date <= p_to);

  RETURN jsonb_build_object(
    'total', ROUND(v_total, 2),
    'bills', v_bills,
    'due', ROUND(v_due, 2),
    'credit_bills', v_credit,
    'cash', ROUND(v_cash, 2),
    'upi', ROUND(v_upi, 2),
    'bank', ROUND(v_bank, 2),
    'credit', ROUND(v_creditamt, 2)
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.sales_period_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_period_summary(date, date) TO authenticated;
