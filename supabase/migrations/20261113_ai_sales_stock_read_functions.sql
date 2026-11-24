-- AI chat: read functions for seven more sales and stock questions
-- ============================================================================
--
-- sales_vs_last_month reuses ai_sales_summary as it is. The other six get a
-- function each, under the rules of 20261104_ai_chat_read_functions.sql:
--
--   * No tenant argument. ai_owner_tenant() is the first line: owner only.
--   * RLS AND an explicit tenant_id filter, and deleted_at IS NULL everywhere.
--   * SECURITY INVOKER and STABLE, search_path = public.
--   * Lists are capped by p_limit; totals always cover every row.
--
-- All new functions: no existing signature changes, so no overload. Nothing
-- here writes, and costPrice is read, never written.

-- ── sales_week: one row per day, zero days included (Daily Sales) ─────────
CREATE OR REPLACE FUNCTION public.ai_sales_by_day(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_gross  numeric;
  v_bills  bigint;
  v_days   jsonb;
BEGIN
  WITH s AS (
    SELECT s.date::date AS d, s."totalAmount" AS amt
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date BETWEEN p_from AND p_to
  ), days AS (
    SELECT g::date AS d FROM generate_series(p_from, p_to, interval '1 day') g
  )
  SELECT (SELECT COALESCE(SUM(amt), 0) FROM s),
         (SELECT COUNT(*) FROM s),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'date', x.d, 'gross_sales', x.gross, 'bill_count', x.bills) ORDER BY x.d), '[]'::jsonb)
            FROM (SELECT days.d, ROUND(COALESCE(SUM(s.amt), 0), 2) AS gross, COUNT(s.amt) AS bills
                    FROM days LEFT JOIN s ON s.d = days.d GROUP BY days.d) x)
    INTO v_gross, v_bills, v_days;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'gross_sales', ROUND(v_gross, 2), 'bill_count', v_bills,
    'average_bill', CASE WHEN v_bills > 0 THEN ROUND(v_gross / v_bills, 2) ELSE 0 END,
    'days', v_days);
END
$fn$;

-- ── best_customers (Sales by Party) ────────────────────────────────────────
-- A customer is the account on the bill, sales."customerInfo"->>'id', as on
-- Sales by Party. Bills with no account are walk-in and are counted apart.
-- walk_in_named_*: walk-in bills with a typed name, which Sales by Party lists
-- under that name instead of its Walk-in row. Selects the name only: never
-- phone, GSTIN or an address.
CREATE OR REPLACE FUNCTION public.ai_best_customers(p_from date, p_to date, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
  v_total  numeric; v_bills bigint; v_n bigint;
  v_walk   numeric; v_walk_n bigint;
  v_named  numeric; v_named_n bigint;
  v_rows   jsonb;
BEGIN
  WITH s AS (
    SELECT s."totalAmount" AS amt,
           NULLIF(s."customerInfo" ->> 'id', '') AS cid,
           NULLIF(s."customerInfo" ->> 'name', '') AS cname
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date BETWEEN p_from AND p_to
  ), per AS (
    SELECT cid, COUNT(*) AS bills, SUM(amt) AS val, MAX(cname) AS cname
      FROM s WHERE cid IS NOT NULL GROUP BY cid
  ), named AS (
    SELECT per.cid, per.bills, per.val,
           COALESCE(NULLIF(c.name, ''), per.cname, 'Customer') AS name
      FROM per
      LEFT JOIN public.clients c ON c.id = per.cid AND c.tenant_id = v_tenant AND c.deleted_at IS NULL
  ), capped AS (
    SELECT * FROM named ORDER BY val DESC, name LIMIT v_limit
  )
  SELECT (SELECT COALESCE(SUM(amt), 0) FROM s),
         (SELECT COUNT(*) FROM s),
         (SELECT COUNT(*) FROM per),
         (SELECT COALESCE(SUM(amt), 0) FROM s WHERE cid IS NULL),
         (SELECT COUNT(*) FROM s WHERE cid IS NULL),
         (SELECT COALESCE(SUM(amt), 0) FROM s WHERE cid IS NULL AND COALESCE(cname, 'Walk-in') <> 'Walk-in'),
         (SELECT COUNT(*) FROM s WHERE cid IS NULL AND COALESCE(cname, 'Walk-in') <> 'Walk-in'),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', c.name, 'sales_value', ROUND(c.val, 2), 'bill_count', c.bills)
             ORDER BY c.val DESC, c.name), '[]'::jsonb) FROM capped c)
    INTO v_total, v_bills, v_n, v_walk, v_walk_n, v_named, v_named_n, v_rows;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'total_sales', ROUND(v_total, 2), 'bill_count', v_bills,
    'customers_count', v_n,
    'customer_sales', ROUND(v_total - v_walk, 2),
    'walk_in_sales', ROUND(v_walk, 2), 'walk_in_bills', v_walk_n,
    'walk_in_named_sales', ROUND(v_named, 2), 'walk_in_named_bills', v_named_n,
    'customers', v_rows);
END
$fn$;

-- ── returns_month (Sales › Returns; returns_total of get_pl_ranged) ────────
-- The total is the same rows and sum as get_pl_ranged's returns_total:
-- sales_returns.total_amount, deleted_at IS NULL, by date. The item list reads
-- the line table. all_* cover every date, which is what the Returns list shows.
CREATE OR REPLACE FUNCTION public.ai_sales_returns(p_from date, p_to date, p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 100);
  v_total  numeric; v_n bigint;
  v_all    numeric; v_all_n bigint;
  v_items_n bigint;
  v_items  jsonb;
BEGIN
  SELECT COALESCE(SUM(r.total_amount), 0), COUNT(*),
         COALESCE(SUM(r.total_amount) FILTER (WHERE r.date::date BETWEEN p_from AND p_to), 0),
         COUNT(*) FILTER (WHERE r.date::date BETWEEN p_from AND p_to)
    INTO v_all, v_all_n, v_total, v_n
    FROM public.sales_returns r
   WHERE r.tenant_id = v_tenant AND r.deleted_at IS NULL;

  WITH lines AS (
    SELECT COALESCE(ri.product_id, ri.product_name) AS k, ri.product_id, ri.product_name,
           ri.quantity, ri.line_total, ri.return_id
      FROM public.sales_return_items ri
      JOIN public.sales_returns r ON r.id = ri.return_id AND r.tenant_id = v_tenant
     WHERE ri.tenant_id = v_tenant AND ri.deleted_at IS NULL AND r.deleted_at IS NULL
       AND r.date::date BETWEEN p_from AND p_to
  ), per AS (
    SELECT k, MAX(product_id) AS product_id, MAX(product_name) AS product_name,
           ROUND(SUM(quantity), 3) AS qty, ROUND(SUM(line_total), 2) AS value,
           COUNT(DISTINCT return_id) AS returns
      FROM lines GROUP BY k
  ), capped AS (
    SELECT * FROM per ORDER BY value DESC, product_name LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM per),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_id', c.product_id, 'product_name', COALESCE(p.name, c.product_name, 'Item'), 'unit', p.unit,
             'qty_returned', c.qty, 'value', c.value, 'return_count', c.returns)
             ORDER BY c.value DESC, c.product_name), '[]'::jsonb)
            FROM capped c
            LEFT JOIN public.products p ON p.id = c.product_id AND p.tenant_id = v_tenant AND p.deleted_at IS NULL)
    INTO v_items_n, v_items;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'returns_total', ROUND(v_total, 2), 'return_count', v_n,
    'all_returns_total', ROUND(v_all, 2), 'all_return_count', v_all_n,
    'distinct_items_returned', v_items_n, 'items', v_items);
END
$fn$;

-- ── stock_value (the Inventory screen's Stock Value) ───────────────────────
-- The screen: every live product, products.stock x products."costPrice", raw
-- material and services included. The batch figures say how far the open
-- cost batches are from that, split into its two exact causes:
--   cost_gap        sum of (batch value - batch qty x costPrice): costPrice is
--                   not the average of the product's open batches;
--   unbatched_value sum of (stock - batch qty) x costPrice: stock no open
--                   batch covers (negative when batches hold more than stock).
-- batch_value - stock_value = cost_gap - unbatched_value, exactly.
CREATE OR REPLACE FUNCTION public.ai_stock_value(p_limit int DEFAULT 10)
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
  v_n bigint; v_in bigint; v_value numeric; v_raw numeric;
  v_bv numeric; v_cost_gap numeric; v_unb numeric; v_cost_n bigint; v_unb_n bigint;
  v_items jsonb;
BEGIN
  WITH bt AS (
    SELECT pb.product_id, SUM(pb.qty_remaining) AS bq, SUM(pb.qty_remaining * COALESCE(pb.unit_cost, 0)) AS bv
      FROM public.product_batches pb
     WHERE pb.tenant_id = v_tenant AND pb.deleted_at IS NULL AND pb.qty_remaining > 0
     GROUP BY pb.product_id
  ), p AS (
    SELECT p.id, p.name, p.unit, COALESCE(p.stock, 0) AS stock, COALESCE(p."costPrice", 0) AS cost,
           COALESCE(p.stock, 0) * COALESCE(p."costPrice", 0) AS value,
           upper(COALESCE(p.product_type, 'STANDARD')) AS ptype,
           COALESCE(bt.bq, 0) AS bq, COALESCE(bt.bv, 0) AS bv
      FROM public.products p
      LEFT JOIN bt ON bt.product_id = p.id
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
  ), capped AS (
    SELECT * FROM p WHERE value > 0 ORDER BY value DESC, name LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM p),
         (SELECT COUNT(*) FROM p WHERE stock > 0),
         (SELECT COALESCE(SUM(value), 0) FROM p),
         (SELECT COALESCE(SUM(value) FILTER (WHERE ptype = 'RAW'), 0) FROM p),
         (SELECT COALESCE(SUM(bv), 0) FROM p),
         (SELECT COALESCE(SUM(bv - bq * cost), 0) FROM p),
         (SELECT COALESCE(SUM((stock - bq) * cost), 0) FROM p),
         (SELECT COUNT(*) FROM p WHERE abs(bv - bq * cost) >= 0.005),
         (SELECT COUNT(*) FROM p WHERE abs((stock - bq) * cost) >= 0.005),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_id', c.id, 'product_name', c.name, 'unit', c.unit, 'stock', c.stock,
             'cost_price', ROUND(c.cost, 2), 'value', ROUND(c.value, 2)) ORDER BY c.value DESC, c.name), '[]'::jsonb)
            FROM capped c)
    INTO v_n, v_in, v_value, v_raw, v_bv, v_cost_gap, v_unb, v_cost_n, v_unb_n, v_items;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'stock_value', ROUND(v_value, 2), 'products_total', v_n, 'items_in_stock', v_in,
    'raw_value', ROUND(v_raw, 2),
    'batch_value', ROUND(v_bv, 2), 'cost_gap', ROUND(v_cost_gap, 2), 'items_cost_off', v_cost_n,
    'unbatched_value', ROUND(v_unb, 2), 'items_unbatched', v_unb_n,
    'items', v_items);
END
$fn$;

-- ── out_of_stock (rule of LowStockReport.jsx and ai_low_stock) ─────────────
-- Stock is summed inventory_balances, else products.stock; RAW and SERVICE
-- are left out. "Out" here is zero or below; the report's "Items Out of
-- Stock" counts exactly zero, so items_zero and items_negative are returned
-- for the card to state the gap.
CREATE OR REPLACE FUNCTION public.ai_out_of_stock(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_today  date := public.ai_shop_today();
  v_out bigint; v_zero bigint; v_neg bigint; v_stocked bigint;
  v_items jsonb;
BEGIN
  WITH bal AS (
    SELECT b.product_id, SUM(b.quantity)::numeric AS qty
      FROM public.inventory_balances b
     WHERE b.tenant_id = v_tenant AND b.deleted_at IS NULL
     GROUP BY b.product_id
  ), stocked AS (
    SELECT p.id, p.name, p.unit, COALESCE(bal.qty, p.stock, 0) AS stock
      FROM public.products p
      LEFT JOIN bal ON bal.product_id = p.id
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
       AND upper(COALESCE(p.product_type, 'STANDARD')) NOT IN ('RAW', 'SERVICE')
  ), outs AS (
    SELECT * FROM stocked WHERE stock <= 0
  ), capped AS (
    SELECT * FROM outs ORDER BY stock, name LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM outs),
         (SELECT COUNT(*) FROM outs WHERE stock = 0),
         (SELECT COUNT(*) FROM outs WHERE stock < 0),
         (SELECT COUNT(*) FROM stocked),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_id', c.id, 'product_name', c.name, 'unit', c.unit, 'stock', c.stock)
             ORDER BY c.stock, c.name), '[]'::jsonb) FROM capped c)
    INTO v_out, v_zero, v_neg, v_stocked, v_items;

  RETURN jsonb_build_object(
    'period_from', v_today, 'period_to', v_today, 'as_of', now(),
    'items_out', v_out, 'items_zero', v_zero, 'items_negative', v_neg,
    'items_stocked', v_stocked, 'items', v_items);
END
$fn$;

-- ── fast_movers_low (Fast / Slow Movers, ProductMovementReport.jsx) ────────
-- Best sellers: live products ranked by units sold on sales dated from
-- today - p_days on (the screen's window; it has no upper bound), top p_top.
-- Rate and days left as on the screen: units / p_days, stock / rate, with
-- stock from summed inventory_balances, else products.stock. Running low: a
-- stocked item (not RAW or SERVICE) at or below its low-stock limit (the Low
-- Stock rule: lowStockThreshold, 10 when unset or 0), or with p_cover_days
-- or fewer days left. days_left rounds as the screen's Math.round does:
-- halves go up, also below zero.
CREATE OR REPLACE FUNCTION public.ai_fast_movers_low(p_days int DEFAULT 30, p_top int DEFAULT 15, p_cover_days int DEFAULT 7, p_limit int DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_days   int  := GREATEST(COALESCE(p_days, 30), 1);
  v_top    int  := LEAST(GREATEST(COALESCE(p_top, 15), 1), 100);
  v_cover  int  := GREATEST(COALESCE(p_cover_days, 7), 0);
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 15), 1), 100);
  v_today  date := public.ai_shop_today();
  v_from   date := v_today - GREATEST(COALESCE(p_days, 30), 1);
  v_ranked bigint; v_flagged bigint;
  v_items  jsonb;
BEGIN
  WITH mov AS (
    SELECT si.product_id, SUM(si.quantity) AS units
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id AND s.tenant_id = v_tenant
     WHERE si.tenant_id = v_tenant AND si.deleted_at IS NULL AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date::date >= v_from
       AND si.product_id IS NOT NULL
     GROUP BY si.product_id
  ), bal AS (
    SELECT b.product_id, SUM(b.quantity)::numeric AS qty
      FROM public.inventory_balances b
     WHERE b.tenant_id = v_tenant AND b.deleted_at IS NULL
     GROUP BY b.product_id
  ), ranked AS (
    SELECT p.id, p.name, p.unit, m.units,
           COALESCE(bal.qty, p.stock, 0) AS stock,
           COALESCE(NULLIF(p."lowStockThreshold", 0), 10) AS threshold,
           upper(COALESCE(p.product_type, 'STANDARD')) NOT IN ('RAW', 'SERVICE') AS stocked,
           row_number() OVER (ORDER BY m.units DESC, p.name) AS rnk
      FROM public.products p
      JOIN mov m ON m.product_id = p.id
      LEFT JOIN bal ON bal.product_id = p.id
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL AND m.units > 0
  ), top AS (
    SELECT *, COALESCE(stock, 0) / (units / v_days) AS cover FROM ranked WHERE rnk <= v_top
  ), flagged AS (
    SELECT *, stock <= threshold AS at_limit, cover <= v_cover AS few_days
      FROM top WHERE stocked AND (stock <= threshold OR cover <= v_cover)
  ), capped AS (
    SELECT * FROM flagged ORDER BY cover, rnk LIMIT v_limit
  )
  SELECT (SELECT COUNT(*) FROM top),
         (SELECT COUNT(*) FROM flagged),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_id', c.id, 'product_name', c.name, 'unit', c.unit, 'rank', c.rnk,
             'units_sold', ROUND(c.units, 3), 'stock', c.stock, 'threshold', c.threshold,
             'days_left', floor(c.cover + 0.5)::int,
             'reason', CASE WHEN c.at_limit AND c.few_days THEN 'both' WHEN c.at_limit THEN 'limit' ELSE 'days' END)
             ORDER BY c.cover, c.rnk), '[]'::jsonb) FROM capped c)
    INTO v_ranked, v_flagged, v_items;

  RETURN jsonb_build_object(
    'period_from', v_from, 'period_to', v_today, 'as_of', now(),
    'window_days', v_days, 'top_n', v_top, 'cover_days', v_cover,
    'top_count', v_ranked, 'items_low', v_flagged, 'items', v_items);
END
$fn$;

-- ── grants: Postgres gives PUBLIC EXECUTE by default ───────────────────────
DO $g$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'ai_sales_by_day(date,date)', 'ai_best_customers(date,date,int)', 'ai_sales_returns(date,date,int)',
    'ai_stock_value(int)', 'ai_out_of_stock(int)', 'ai_fast_movers_low(int,int,int,int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $g$;
