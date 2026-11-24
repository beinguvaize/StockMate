-- AI chat: cash_bank reports the loan accounts' balance alongside
-- ============================================================================
--
-- The Accounts screen's total includes LOAN accounts; the dashboard, mobile and
-- ai_cash_bank leave them out. Until the owner decides which total is right,
-- the card says so whenever a shop has a non-zero loan balance, with the exact
-- gap, instead of linking to a screen that silently reads differently.
-- Same signature, so no overload. No money is computed differently.

CREATE OR REPLACE FUNCTION public.ai_cash_bank()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_today  date := public.ai_shop_today();
  v_total  numeric; v_cash numeric; v_bank numeric;
  v_in     numeric; v_out  numeric;
  v_rows   jsonb;
  v_loans  numeric;
BEGIN
  WITH acc AS (
    SELECT a.id, a.name, upper(COALESCE(a.type, '')) AS type, a.opening_balance, a.linked_bank_account_id
      FROM public.accounts a
     WHERE a.tenant_id = v_tenant AND a.deleted_at IS NULL AND upper(COALESCE(a.type, '')) <> 'LOAN'
  ), moved AS (
    SELECT t.account_id,
           SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END) AS net
      FROM public.account_transactions t
     WHERE t.tenant_id = v_tenant
     GROUP BY t.account_id
  ), own AS (
    -- A UPI handle linked to a live bank account folds into it, as on both screens.
    SELECT CASE WHEN a.type = 'UPI' AND a.linked_bank_account_id IN (SELECT id FROM acc)
                THEN a.linked_bank_account_id ELSE a.id END AS home,
           COALESCE(a.opening_balance, 0) + COALESCE(m.net, 0) AS balance
      FROM acc a LEFT JOIN moved m ON m.account_id = a.id
  ), rolled AS (
    SELECT o.home, a.name, a.type, SUM(o.balance) AS balance
      FROM own o JOIN acc a ON a.id = o.home
     GROUP BY o.home, a.name, a.type
  )
  SELECT (SELECT COALESCE(SUM(balance), 0) FROM rolled),
         (SELECT COALESCE(SUM(balance), 0) FROM rolled WHERE type = 'CASH'),
         (SELECT COALESCE(SUM(balance), 0) FROM rolled WHERE type <> 'CASH'),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'account_id', r.home, 'label', r.name, 'type', r.type, 'balance', ROUND(r.balance, 2))
             ORDER BY r.balance DESC, r.name), '[]'::jsonb) FROM rolled r),
         (SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'IN'), 0)
            FROM public.account_transactions t JOIN acc a ON a.id = t.account_id
           WHERE t.tenant_id = v_tenant AND t.date = v_today AND COALESCE(t.ref_type, '') <> 'TRANSFER'),
         (SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction <> 'IN'), 0)
            FROM public.account_transactions t JOIN acc a ON a.id = t.account_id
           WHERE t.tenant_id = v_tenant AND t.date = v_today AND COALESCE(t.ref_type, '') <> 'TRANSFER')
    INTO v_total, v_cash, v_bank, v_rows, v_in, v_out;

  -- Loan accounts, balanced the way the Accounts screen does (opening + IN - OUT).
  -- Not part of the money here; reported only so the card can say why that
  -- screen's total, which includes them, reads differently.
  SELECT COALESCE(SUM(COALESCE(a.opening_balance, 0) + COALESCE((
           SELECT SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END)
             FROM public.account_transactions t
            WHERE t.tenant_id = v_tenant AND t.account_id = a.id), 0)), 0)
    INTO v_loans
    FROM public.accounts a
   WHERE a.tenant_id = v_tenant AND a.deleted_at IS NULL AND upper(COALESCE(a.type, '')) = 'LOAN';

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'total_balance', ROUND(v_total, 2), 'cash_total', ROUND(v_cash, 2), 'bank_total', ROUND(v_bank, 2),
    'accounts', v_rows, 'today_in', ROUND(v_in, 2), 'today_out', ROUND(v_out, 2),
    'loan_total', ROUND(v_loans, 2));
END
$fn$;
