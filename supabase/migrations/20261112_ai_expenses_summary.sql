-- AI chat: the read behind the three Expenses questions
-- ============================================================================
--
-- expenses_month, top_expenses and expenses_vs_last all call this one function.
-- It follows the rules of 20261104_ai_chat_read_functions.sql: no tenant
-- argument, ai_owner_tenant() first, SECURITY INVOKER and STABLE, an explicit
-- tenant_id filter as well as RLS, deleted_at IS NULL, lists capped by p_limit
-- (categories at 50), totals over every row. New function, so no overload.
--
-- Which rows count, so the card ties to get_pl_ranged's expenses line and to
-- the Expenses report's "Business Expenses (ties to P&L)" figure:
--
--   * deleted_at IS NULL. Soft-deleted rows are out, as on both screens.
--   * exclude_from_pl = false. Owner drawings, loan principal and the like are
--     real cash out but are kept out of profit; they come back on their own
--     (drawings_total, drawings_count) and are never in `total`.
--   * date::date BETWEEN p_from AND p_to, exactly as get_pl_ranged. Every
--     expenses.date on prod is a plain YYYY-MM-DD, so the report's text range
--     on the same column picks the same rows.
--   * amount as stored: what was paid, GST included. Expenses.jsx backs the
--     GST out of that amount into gst_amount; neither the P&L nor this
--     function subtracts it.
--   * Payroll-linked rows (payroll_id) and rows made by a recurring template
--     are ordinary expenses and count, as they do in the P&L.
--
-- Personal data: a payroll-linked row's note names the staff member paid, so
-- its description is never returned (from_payroll = true instead). payroll_id
-- is read through to_jsonb so the function also runs on a database whose
-- expenses table predates that column (dev).

CREATE OR REPLACE FUNCTION public.ai_expense_summary(p_from date, p_to date, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant    uuid := public.ai_owner_tenant();
  v_limit     int  := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_total     numeric; v_count bigint;
  v_out       numeric; v_out_count bigint;
  v_cats      jsonb;   v_cat_count bigint;
  v_top       jsonb;
BEGIN
  SELECT COALESCE(SUM(e.amount) FILTER (WHERE NOT COALESCE(e.exclude_from_pl, false)), 0),
         COUNT(*)              FILTER (WHERE NOT COALESCE(e.exclude_from_pl, false)),
         COALESCE(SUM(e.amount) FILTER (WHERE COALESCE(e.exclude_from_pl, false)), 0),
         COUNT(*)              FILTER (WHERE COALESCE(e.exclude_from_pl, false))
    INTO v_total, v_count, v_out, v_out_count
    FROM public.expenses e
   WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL
     AND e.date::date BETWEEN p_from AND p_to;

  -- By category, named as the Expenses report groups them (category || 'GENERAL').
  WITH c AS (
    SELECT COALESCE(NULLIF(e.category, ''), 'GENERAL') AS category,
           ROUND(SUM(e.amount), 2) AS amount, COUNT(*) AS entry_count
      FROM public.expenses e
     WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL
       AND NOT COALESCE(e.exclude_from_pl, false)
       AND e.date::date BETWEEN p_from AND p_to
     GROUP BY 1
  )
  SELECT (SELECT COUNT(*) FROM c),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.amount, 'entry_count', x.entry_count)
                                    ORDER BY x.amount DESC, x.category)
                     FROM (SELECT * FROM c ORDER BY amount DESC, category LIMIT 50) x), '[]'::jsonb)
    INTO v_cat_count, v_cats;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'date', t.d, 'category', t.category, 'amount', t.amount,
           'description', t.description, 'from_payroll', t.from_payroll)
           ORDER BY t.amount DESC, t.d DESC, t.created_at DESC, t.id), '[]'::jsonb)
    INTO v_top
    FROM (
      SELECT e.id, e.created_at, left(e.date, 10) AS d,
             COALESCE(NULLIF(e.category, ''), 'GENERAL') AS category,
             ROUND(e.amount, 2) AS amount,
             (to_jsonb(e) ->> 'payroll_id') IS NOT NULL AS from_payroll,
             CASE WHEN (to_jsonb(e) ->> 'payroll_id') IS NOT NULL THEN NULL
                  ELSE NULLIF(left(btrim(e.note), 80), '') END AS description
        FROM public.expenses e
       WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL
         AND NOT COALESCE(e.exclude_from_pl, false)
         AND e.date::date BETWEEN p_from AND p_to
       ORDER BY e.amount DESC, e.date DESC, e.created_at DESC, e.id
       LIMIT v_limit
    ) t;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'total', ROUND(v_total, 2),
    'entry_count', v_count,
    'categories', v_cats,
    'category_count', v_cat_count,
    'drawings_total', ROUND(v_out, 2),
    'drawings_count', v_out_count,
    'entries', v_top);
END
$fn$;

REVOKE ALL ON FUNCTION public.ai_expense_summary(date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_expense_summary(date, date, int) TO authenticated;
