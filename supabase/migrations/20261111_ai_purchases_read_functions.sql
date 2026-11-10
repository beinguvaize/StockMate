-- AI chat: the read functions behind the Purchases & suppliers questions
-- ============================================================================
--
-- Four new questions, four new functions. None changes an existing function,
-- so no overload is created. They follow 20261104_ai_chat_read_functions.sql:
--
--   * No tenant argument. ai_owner_tenant() resolves the shop, and refuses a
--     user who is not its owner.
--   * RLS AND an explicit tenant_id filter on every read. A global admin's call
--     must not add up every shop.
--   * SECURITY INVOKER and STABLE. No writes. Lists capped by p_limit; totals
--     always cover every row.
--   * Soft-deleted rows are left out everywhere.
--
-- Each one copies the rule of the screen its card links to, so the card and
-- the screen show the same number for the same dates:
--
--   ai_purchases_summary   Purchase Register (PurchaseRegisterReport.jsx):
--                          live purchases with from <= date <= to, compared as
--                          text exactly as the report's query does; Invoice
--                          Value = SUM of each bill's total_amount rounded to
--                          paise the way JavaScript's round2 rounds it;
--                          Bills = row count. No status filter and no return
--                          netting, because the report has neither.
--   ai_top_suppliers       the same rows, grouped by the register's Supplier
--                          column: supplier_name, else the live supplier's
--                          name, else 'Direct'.
--   ai_supplier_dues       Suppliers screen (SupplierWorkspace.jsx): each live
--                          purchase belongs to the first live supplier, by name,
--                          whose id is its supplier_id or whose name is its
--                          supplier_name. Owed = max(0, SUM(total - paid)).
--                          Not suppliers.balance: the screen does not read it.
--   ai_cost_up             Price history on Purchases (priceHistory.js): unit
--                          cost = round2(total_amount / quantity), per base
--                          unit, in double precision as the screen works it;
--                          rows ordered by date then entry time; deleted and
--                          CANCELLED purchases left out.
--
-- No function here names a supplier's phone, e-mail, GSTIN, PAN, address or
-- bank details.

-- ── purchases_month ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_purchases_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_value numeric; v_bills bigint; v_suppliers bigint;
BEGIN
  WITH s AS (
    SELECT s.id, s.name FROM public.suppliers s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
  ), p AS (
    -- round2() as the report does it: Math.round(x * 100) / 100 in doubles.
    SELECT ROUND((floor(COALESCE(p.total_amount, 0)::float8 * 100 + 0.5) / 100)::numeric, 2) AS amount,
           COALESCE(NULLIF(p.supplier_name, ''), s.name, 'Direct') AS who
      FROM public.purchases p
      LEFT JOIN s ON s.id = p.supplier_id
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND p.date >= p_from::text AND p.date <= p_to::text
  )
  SELECT COALESCE(SUM(amount), 0), COUNT(*), COUNT(DISTINCT who)
    INTO v_value, v_bills, v_suppliers
    FROM p;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'total_value', v_value, 'bill_count', v_bills, 'supplier_count', v_suppliers);
END
$fn$;

-- ── top_suppliers ──────────────────────────────────────────────────────────
-- Totals are over every supplier in the period; only the list is capped.
CREATE OR REPLACE FUNCTION public.ai_top_suppliers(p_from date, p_to date, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_value numeric; v_bills bigint; v_n bigint; v_rows jsonb;
BEGIN
  WITH s AS (
    SELECT s.id, s.name FROM public.suppliers s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
  ), p AS (
    -- round2() as the report does it: Math.round(x * 100) / 100 in doubles.
    SELECT ROUND((floor(COALESCE(p.total_amount, 0)::float8 * 100 + 0.5) / 100)::numeric, 2) AS amount,
           COALESCE(NULLIF(p.supplier_name, ''), s.name, 'Direct') AS who
      FROM public.purchases p
      LEFT JOIN s ON s.id = p.supplier_id
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND p.date >= p_from::text AND p.date <= p_to::text
  ), g AS (
    SELECT who, SUM(amount) AS value, COUNT(*) AS bills FROM p GROUP BY who
  )
  SELECT COALESCE((SELECT SUM(value) FROM g), 0),
         COALESCE((SELECT SUM(bills) FROM g), 0),
         (SELECT COUNT(*) FROM g),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('name', t.who, 'value', t.value, 'bill_count', t.bills)
                                    ORDER BY t.value DESC, t.who)
                     FROM (SELECT * FROM g ORDER BY value DESC, who LIMIT v_limit) t), '[]'::jsonb)
    INTO v_value, v_bills, v_n, v_rows;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'total_value', v_value, 'bill_count', v_bills, 'supplier_count', v_n, 'suppliers', v_rows);
END
$fn$;

-- ── supplier_dues ──────────────────────────────────────────────────────────
-- What the Suppliers screen shows. A bill paid more than its total leaves an
-- advance; the screen nets it against the same supplier's open bills and floors
-- the supplier at zero, and so does this. last_payment_date is the newest live
-- supplier payment, as in the screen's Payments tab.
CREATE OR REPLACE FUNCTION public.ai_supplier_dues(p_limit int DEFAULT 10)
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
  v_total numeric; v_advance numeric; v_n bigint; v_all bigint; v_rows jsonb;
BEGIN
  WITH s AS (
    SELECT s.id, s.name FROM public.suppliers s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
  ), p AS (
    -- The screen's match: the first supplier, in name order, by id or by name.
    SELECT COALESCE(p.total_amount, 0) - COALESCE(p.paid_amount, 0) AS raw,
           (SELECT s.id FROM s WHERE s.id = p.supplier_id OR s.name = p.supplier_name
             ORDER BY s.name, s.id LIMIT 1) AS sid
      FROM public.purchases p
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
  ), f AS (
    SELECT s.id, s.name,
           GREATEST(0, COALESCE(SUM(p.raw), 0)) AS owed,
           COALESCE(SUM(-p.raw) FILTER (WHERE p.raw < 0), 0) AS advance
      FROM s LEFT JOIN p ON p.sid = s.id
     GROUP BY s.id, s.name
  )
  SELECT COALESCE(SUM(owed), 0), COALESCE(SUM(advance), 0),
         COUNT(*) FILTER (WHERE owed > 0.01), COUNT(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'supplier_id', t.id, 'name', t.name, 'owed', ROUND(t.owed, 2),
                     'last_payment_date', t.last_payment_date) ORDER BY t.owed DESC, t.name, t.id)
                     FROM (SELECT f2.*, (SELECT MAX(sp.date) FROM public.supplier_payments sp
                                          WHERE sp.tenant_id = v_tenant AND sp.deleted_at IS NULL
                                            AND sp.supplier_id = f2.id) AS last_payment_date
                             FROM f f2 WHERE f2.owed > 0.01
                            ORDER BY f2.owed DESC, f2.name, f2.id LIMIT v_limit) t), '[]'::jsonb)
    INTO v_total, v_advance, v_n, v_all, v_rows
    FROM f;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'total_owed', ROUND(v_total, 2), 'suppliers_owing', v_n, 'suppliers_total', v_all,
    'advance_total', ROUND(v_advance, 2), 'suppliers', v_rows);
END
$fn$;

-- ── cost_up ────────────────────────────────────────────────────────────────
-- Per item, the newest price-history row against the one before it. The newest
-- must be dated in the last p_days days; the one before may be older. Unit cost
-- and the rise are worked in double precision with JavaScript's rounding
-- (floor(x * 100 + 0.5) / 100), so they equal the Price history screen to the
-- paisa. Only items that cost more are listed; items_compared counts every item
-- with two purchases whose newest is in the window.
CREATE OR REPLACE FUNCTION public.ai_cost_up(p_days int DEFAULT 90, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_days   int  := LEAST(GREATEST(COALESCE(p_days, 90), 1), 3660);
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_today  date := public.ai_shop_today();
  v_up bigint; v_compared bigint; v_rows jsonb;
BEGIN
  WITH h AS (
    SELECT p.linked_product_id AS product_id, left(p.date, 10) AS day,
           floor((p.total_amount::float8 / p.quantity::float8) * 100 + 0.5) / 100 AS unit_cost,
           row_number() OVER (PARTITION BY p.linked_product_id
                              ORDER BY left(p.date, 10) DESC, p.created_at DESC NULLS LAST, p.id DESC) AS rn
      FROM public.purchases p
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND p.linked_product_id IS NOT NULL
       AND upper(COALESCE(p.status, '')) <> 'CANCELLED'
       AND p.quantity > 0 AND p.total_amount > 0
  ), pair AS (
    SELECT n.product_id, n.day AS new_date, n.unit_cost AS new_cost, o.day AS old_date, o.unit_cost AS old_cost
      FROM h n JOIN h o ON o.product_id = n.product_id AND o.rn = 2
     WHERE n.rn = 1 AND n.day >= (v_today - v_days)::text AND n.day <= v_today::text
  ), c AS (
    SELECT pair.*, pr.name, pr.unit,
           -- A cost that rounds to 0 has no rise to state; the screen shows none either.
           CASE WHEN pair.old_cost > 0
                THEN floor(((pair.new_cost - pair.old_cost) / pair.old_cost) * 100 * 100 + 0.5) / 100 END AS pct
      FROM pair
      JOIN public.products pr ON pr.id = pair.product_id AND pr.tenant_id = v_tenant AND pr.deleted_at IS NULL
  )
  SELECT COUNT(*) FILTER (WHERE new_cost > old_cost AND pct IS NOT NULL), COUNT(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'product_id', t.product_id, 'product_name', t.name, 'unit', t.unit,
                     'old_cost', ROUND(t.old_cost::numeric, 2), 'new_cost', ROUND(t.new_cost::numeric, 2),
                     'pct_rise', ROUND(t.pct::numeric, 2), 'old_date', t.old_date, 'new_date', t.new_date)
                     ORDER BY t.pct DESC, t.name, t.product_id)
                     FROM (SELECT * FROM c WHERE c.new_cost > c.old_cost AND c.pct IS NOT NULL
                            ORDER BY c.pct DESC, c.name, c.product_id LIMIT v_limit) t), '[]'::jsonb)
    INTO v_up, v_compared, v_rows
    FROM c;

  RETURN jsonb_build_object(
    'period_from', v_today - v_days, 'period_to', v_today, 'as_of', now(),
    'items_up', v_up, 'items_compared', v_compared, 'items', v_rows);
END
$fn$;

-- ── grants: Postgres gives PUBLIC EXECUTE by default ───────────────────────
DO $g$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'ai_purchases_summary(date,date)', 'ai_top_suppliers(date,date,int)',
    'ai_supplier_dues(int)', 'ai_cost_up(int,int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $g$;
