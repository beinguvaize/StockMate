-- AI chat: four more questions on dues and cash (docs/ai-chat-v1.md §3-§4)
-- ============================================================================
--
--   dues_overdue        ai_dues_over_60(p_limit)
--   credit_sales_month  ai_credit_sales(p_from, p_to)
--   cash_today          ai_cash_today()
--   payment_mix_month   ai_payment_mix(p_from, p_to)
--
-- New functions only, so no overload. The rules of 20261104_ai_chat_read_functions:
-- no tenant argument, ai_owner_tenant() first, SECURITY INVOKER and STABLE, an
-- explicit tenant filter as well as RLS, deleted_at IS NULL, lists capped while
-- totals cover every row. Nothing here writes, posts or touches profit.
--
-- Each one also returns what its linked screen shows for the same dates, worked
-- out by that screen's own rule, so the card can say the exact gap and why.

-- ── dues_overdue ───────────────────────────────────────────────────────────
-- Reads get_unpaid_sales, the one definition of an unpaid bill (ai_dues_ageing
-- and the Customer Aging report read it too). Rounded per bill and grouped per
-- customer exactly as receivableAging.js does, so the amounts are that screen's
-- 61-90, 91-120 and 120+ columns. Only the customer's name leaves.
CREATE OR REPLACE FUNCTION public.ai_dues_over_60(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_today  date := public.ai_shop_today();
  v_out    jsonb;
BEGIN
  WITH bills AS (
    SELECT COALESCE(NULLIF(g.client_id, ''), 'name:' || g.client_name) AS k,
           NULLIF(g.client_id, '') AS client_id, g.client_name AS name,
           ROUND(g.unpaid, 2) AS due, GREATEST(v_today - g.sale_date, 0) AS age
      FROM public.get_unpaid_sales(v_tenant) g
  ), old AS (
    SELECT * FROM bills WHERE age > 60
  ), per AS (
    SELECT k, (array_agg(client_id ORDER BY age DESC))[1] AS client_id,
           (array_agg(name ORDER BY age DESC))[1] AS name,
           SUM(due) AS amount, COUNT(*) AS bills, MAX(age) AS oldest
      FROM old GROUP BY k
  ), capped AS (
    SELECT * FROM per ORDER BY amount DESC, name LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(), 'days', 60,
    'total_over', COALESCE((SELECT SUM(due) FROM old), 0),
    'bills_over', (SELECT COUNT(*) FROM old),
    'customers_over', (SELECT COUNT(*) FROM per),
    'oldest_days', COALESCE((SELECT MAX(age) FROM old), 0),
    'aged_61_90', COALESCE((SELECT SUM(due) FROM old WHERE age <= 90), 0),
    'aged_91_120', COALESCE((SELECT SUM(due) FROM old WHERE age > 90 AND age <= 120), 0),
    'aged_over_120', COALESCE((SELECT SUM(due) FROM old WHERE age > 120), 0),
    'total_unpaid', COALESCE((SELECT SUM(due) FROM bills), 0),
    'customers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'client_id', c.client_id, 'name', c.name, 'amount_over', c.amount,
        'bills_over', c.bills, 'oldest_days', c.oldest) ORDER BY c.amount DESC, c.name) FROM capped c), '[]'::jsonb))
    INTO v_out;
  RETURN v_out;
END
$fn$;

-- ── credit_sales_month ─────────────────────────────────────────────────────
-- A credit sale is a countable sale whose payment method is CREDIT, the rule
-- ai_sales_summary's by_method uses. Still unpaid is get_unpaid_sales on those
-- bills; collected is the rest. other_open is what is unpaid on this period's
-- bills of any other method (part-paid cash or UPI bills).
-- screen_* is the Business Report's "Billed vs Collected" CREDIT bar for the
-- same dates: it calls a bill collected from its payment status (PAID or
-- COMPLETED in full, PARTIAL up to paidAmount, anything else nothing).
CREATE OR REPLACE FUNCTION public.ai_credit_sales(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_out    jsonb;
BEGIN
  WITH sold AS (
    SELECT s.id::text AS id, s."totalAmount" AS total, COALESCE(s."paidAmount", 0) AS paid,
           upper(COALESCE(NULLIF(s."paymentMethod", ''), 'UNKNOWN')) = 'CREDIT' AS credit,
           upper(COALESCE(NULLIF(s."paymentStatus", ''), s.status, '')) AS pay_status
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date BETWEEN p_from AND p_to
  ), unpaid AS (
    SELECT g.sale_id, ROUND(g.unpaid, 2) AS due
      FROM public.get_unpaid_sales(v_tenant) g
     WHERE g.sale_date BETWEEN p_from AND p_to
  ), joined AS (
    SELECT sd.*, COALESCE(o.due, 0) AS due, o.sale_id IS NOT NULL AS is_open,
           CASE WHEN sd.pay_status IN ('PAID', 'COMPLETED') THEN sd.total
                WHEN sd.pay_status = 'PARTIAL' THEN LEAST(sd.paid, sd.total)
                ELSE 0 END AS screen_collected
      FROM sold sd LEFT JOIN unpaid o ON o.sale_id = sd.id
  ), t AS (
    SELECT COALESCE(SUM(total), 0) AS sales_total,
           COALESCE(SUM(total) FILTER (WHERE credit), 0) AS billed,
           COUNT(*) FILTER (WHERE credit) AS bills,
           COALESCE(SUM(due) FILTER (WHERE credit), 0) AS open_amt,
           COUNT(*) FILTER (WHERE credit AND is_open) AS open_bills,
           COALESCE(SUM(due) FILTER (WHERE NOT credit), 0) AS other_open,
           COUNT(*) FILTER (WHERE NOT credit AND is_open) AS other_bills,
           COALESCE(SUM(screen_collected) FILTER (WHERE credit), 0) AS screen_collected
      FROM joined
  )
  SELECT jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'credit_billed', ROUND(t.billed, 2), 'credit_bills', t.bills,
    'credit_collected', ROUND(t.billed - t.open_amt, 2),
    'credit_open', ROUND(t.open_amt, 2), 'credit_open_bills', t.open_bills,
    'other_open', ROUND(t.other_open, 2), 'other_open_bills', t.other_bills,
    'sales_total', ROUND(t.sales_total, 2),
    'credit_share_pct', CASE WHEN t.sales_total > 0 THEN ROUND(t.billed / t.sales_total * 100, 1) ELSE 0 END,
    'screen_credit_collected', ROUND(t.screen_collected, 2))
    INTO v_out FROM t;
  RETURN v_out;
END
$fn$;

-- ── cash_today ─────────────────────────────────────────────────────────────
-- Today's ledger (account_transactions, which has no deleted_at) on the live,
-- non-loan accounts, transfers left out: the rows ai_cash_bank's today_in and
-- today_out add up, so the two cards agree. A UPI handle linked to a live bank
-- account folds into it, as on the Accounts screen.
--
-- daybook_in / daybook_out are the Day Book's own totals for today, by its own
-- rules in DayBook.jsx and lib/dayBook.js, for the whole business:
--   in  = ledger SALE rows in cash or bank modes, signed (saleReceiptsByMode)
--       + client_payments in cash or bank methods
--       + money taken up front on CREDIT sales (receivedOnDay)
--   out = every expense + cash or bank purchases at bill value + supplier payments
-- unlisted is the ledger rows on this card that are not of a kind the Day Book
-- lists, and residual_* is whatever gap remains after them.
CREATE OR REPLACE FUNCTION public.ai_cash_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant  uuid := public.ai_owner_tenant();
  v_today   date := public.ai_shop_today();
  v_day     text;
  k_counted text[] := ARRAY['CASH', 'BANK', 'UPI', 'TRANSFER', 'NEFT', 'RTGS', 'CARD', 'CHEQUE'];
  v_in numeric; v_out numeric; v_unl_in numeric; v_unl_out numeric;
  v_in_types jsonb; v_out_types jsonb; v_accounts jsonb; v_unlisted jsonb;
  v_db_sale numeric; v_db_coll numeric; v_db_credit numeric;
  v_db_exp numeric; v_db_pur numeric; v_db_sup numeric;
BEGIN
  v_day := to_char(v_today, 'YYYY-MM-DD');

  WITH acc AS (
    SELECT a.id, a.name, upper(COALESCE(a.type, '')) AS type, a.linked_bank_account_id
      FROM public.accounts a
     WHERE a.tenant_id = v_tenant AND a.deleted_at IS NULL AND upper(COALESCE(a.type, '')) <> 'LOAN'
  ), home AS (
    SELECT a.id, CASE WHEN a.type = 'UPI' AND a.linked_bank_account_id IN (SELECT id FROM acc)
                      THEN a.linked_bank_account_id ELSE a.id END AS home
      FROM acc a
  ), led AS (
    SELECT t.amount, COALESCE(t.direction = 'IN', false) AS is_in,
           COALESCE(NULLIF(t.ref_type, ''), 'OTHER') AS kind,
           upper(COALESCE(NULLIF(t.mode, ''), 'CASH')) AS mode, h.home
      FROM public.account_transactions t JOIN home h ON h.id = t.account_id
     WHERE t.tenant_id = v_tenant AND t.date = v_today AND COALESCE(t.ref_type, '') <> 'TRANSFER'
  ), tagged AS (
    -- Listed: a kind of row the Day Book reads, in a mode it counts. Money
    -- taken up front on a credit sale it reads from the sale instead.
    SELECT l.*, CASE WHEN l.is_in THEN (l.kind IN ('SALE', 'PAYMENT') AND l.mode = ANY(k_counted))
                                    OR (l.kind = 'SALE' AND l.mode = 'CREDIT')
                     ELSE l.kind IN ('EXPENSE', 'SUPPLIER_PAYMENT', 'SALE')
                       OR (l.kind = 'PURCHASE' AND l.mode = ANY(k_counted)) END AS listed
      FROM led l
  )
  SELECT COALESCE(SUM(amount) FILTER (WHERE is_in), 0),
         COALESCE(SUM(amount) FILTER (WHERE NOT is_in), 0),
         COALESCE(SUM(amount) FILTER (WHERE is_in AND NOT listed), 0),
         COALESCE(SUM(amount) FILTER (WHERE NOT is_in AND NOT listed), 0),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', x.kind, 'amount', x.amount) ORDER BY x.amount DESC, x.kind), '[]'::jsonb)
            FROM (SELECT kind, ROUND(SUM(amount), 2) AS amount FROM tagged WHERE is_in GROUP BY kind) x),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', x.kind, 'amount', x.amount) ORDER BY x.amount DESC, x.kind), '[]'::jsonb)
            FROM (SELECT kind, ROUND(SUM(amount), 2) AS amount FROM tagged WHERE NOT is_in GROUP BY kind) x),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('account_id', x.home, 'label', a.name, 'type', a.type,
                   'money_in', x.money_in, 'money_out', x.money_out) ORDER BY x.money_in + x.money_out DESC, a.name), '[]'::jsonb)
            FROM (SELECT home, ROUND(COALESCE(SUM(amount) FILTER (WHERE is_in), 0), 2) AS money_in,
                         ROUND(COALESCE(SUM(amount) FILTER (WHERE NOT is_in), 0), 2) AS money_out
                    FROM tagged GROUP BY home) x JOIN acc a ON a.id = x.home),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('type', x.kind, 'mode', x.mode,
                   'direction', CASE WHEN x.is_in THEN 'IN' ELSE 'OUT' END, 'amount', x.amount)
                   ORDER BY x.amount DESC, x.kind, x.mode), '[]'::jsonb)
            FROM (SELECT kind, mode, is_in, ROUND(SUM(amount), 2) AS amount FROM tagged WHERE NOT listed
                   GROUP BY kind, mode, is_in) x)
    INTO v_in, v_out, v_unl_in, v_unl_out, v_in_types, v_out_types, v_accounts, v_unlisted
    FROM tagged;

  -- The Day Book's own totals. Its reads, its filters, its rules.
  SELECT COALESCE(SUM(CASE WHEN upper(COALESCE(t.direction, 'IN')) = 'OUT' THEN -t.amount ELSE t.amount END), 0)
    INTO v_db_sale
    FROM public.account_transactions t
   WHERE t.tenant_id = v_tenant AND t.date = v_today AND t.ref_type = 'SALE'
     AND upper(COALESCE(NULLIF(t.mode, ''), 'CASH')) = ANY(k_counted);

  SELECT COALESCE(SUM(cp.amount), 0) INTO v_db_coll
    FROM public.client_payments cp
   WHERE cp.tenant_id = v_tenant AND cp.deleted_at IS NULL AND left(cp.date, 10) = v_day
     AND upper(COALESCE(cp.payment_method, '')) = ANY(k_counted);

  -- receivedOnDay for a CREDIT sale: nothing once it was written to on a later
  -- day; all of it when marked paid; else what was paid, up to the bill.
  SELECT COALESCE(SUM(CASE
           WHEN s.updated_at IS NOT NULL AND to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') > left(s.date, 10) THEN 0
           WHEN upper(COALESCE(s."paymentStatus", '')) IN ('PAID', 'COMPLETED') THEN COALESCE(s."totalAmount", 0)
           ELSE LEAST(COALESCE(s."paidAmount", 0), COALESCE(s."totalAmount", 0)) END), 0)
    INTO v_db_credit
    FROM public.sales s
   WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL AND left(s.date, 10) = v_day
     AND upper(COALESCE(s."paymentMethod", '')) = 'CREDIT';

  SELECT COALESCE(SUM(e.amount), 0) INTO v_db_exp
    FROM public.expenses e
   WHERE e.tenant_id = v_tenant AND e.deleted_at IS NULL AND left(e.date, 10) = v_day;

  SELECT COALESCE(SUM(p.total_amount), 0) INTO v_db_pur
    FROM public.purchases p
   WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL AND left(p.date, 10) = v_day
     AND upper(COALESCE(NULLIF(p.payment_type, ''), 'CASH')) = ANY(k_counted);

  SELECT COALESCE(SUM(sp.amount), 0) INTO v_db_sup
    FROM public.supplier_payments sp
   WHERE sp.tenant_id = v_tenant AND sp.deleted_at IS NULL AND sp.date = v_today;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'money_in', ROUND(v_in, 2), 'money_out', ROUND(v_out, 2), 'net', ROUND(v_in - v_out, 2),
    'in_by_type', v_in_types, 'out_by_type', v_out_types, 'accounts', v_accounts,
    'daybook_in', ROUND(v_db_sale + v_db_coll + v_db_credit, 2),
    'daybook_out', ROUND(v_db_exp + v_db_pur + v_db_sup, 2),
    'unlisted', v_unlisted,
    'residual_in', ROUND(v_in - v_unl_in - (v_db_sale + v_db_coll + v_db_credit), 2),
    'residual_out', ROUND(v_out - v_unl_out - (v_db_exp + v_db_pur + v_db_sup), 2));
END
$fn$;

-- ── payment_mix_month ──────────────────────────────────────────────────────
-- Countable sales by payment method, the rule of ai_sales_summary's by_method,
-- with each method's share of the period's sales. The Business Report's
-- "Billed vs Collected" reads a missing method as CASH; unrecorded_amount is
-- that amount, so the card can say so.
CREATE OR REPLACE FUNCTION public.ai_payment_mix(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_out    jsonb;
BEGIN
  WITH sold AS (
    SELECT upper(COALESCE(NULLIF(s."paymentMethod", ''), 'UNKNOWN')) AS method, s."totalAmount" AS total
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date BETWEEN p_from AND p_to
  ), t AS (
    SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS bills FROM sold
  ), m AS (
    SELECT method, ROUND(SUM(total), 2) AS amount, COUNT(*) AS bills FROM sold GROUP BY method
  )
  SELECT jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'gross_sales', ROUND(t.total, 2), 'bill_count', t.bills,
    'by_method', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'method', m.method, 'amount', m.amount, 'bill_count', m.bills,
        'share_pct', CASE WHEN t.total > 0 THEN ROUND(m.amount / t.total * 100, 1) ELSE 0 END)
        ORDER BY m.amount DESC, m.method) FROM m), '[]'::jsonb),
    'unrecorded_amount', COALESCE((SELECT m.amount FROM m WHERE m.method = 'UNKNOWN'), 0))
    INTO v_out FROM t;
  RETURN v_out;
END
$fn$;

-- ── grants: Postgres gives PUBLIC EXECUTE by default ───────────────────────
DO $g$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'ai_dues_over_60(int)', 'ai_credit_sales(date,date)', 'ai_cash_today()', 'ai_payment_mix(date,date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $g$;
