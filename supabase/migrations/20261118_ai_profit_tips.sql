-- AI chat: "How can I make more profit?" (profit_tips), margin by item
-- ============================================================================
--
--   profit_tips  ai_item_margins(p_from, p_to, p_limit, p_product_ids)
--                plus the existing ai_dead_stock, ai_dues_over_60,
--                ai_expense_summary, ai_cost_up, ai_sales_returns and
--                ai_fast_movers_low, called by ai-ask as they are.
--
-- The rules of 20261104_ai_chat_read_functions.sql: no tenant argument,
-- ai_owner_tenant() first, SECURITY INVOKER and STABLE, an explicit tenant_id
-- filter as well as RLS, deleted_at IS NULL, lists capped while totals cover
-- every row. A new name only, so no overload. Nothing here writes.
--
-- COGS is NOT worked out a new way. sale_items holds no line cost, and
-- sales.totalCogs is per bill, so a per-item cost exists only as the Product
-- Margins report (src/components/reports/ProductProfitabilityReport.jsx)
-- already computes it. This function re-reads that screen's own rule, so each
-- row equals the row the screen shows for the same dates:
--
--   * Sales: countable (ai_countable = isCountableSale), deleted_at IS NULL,
--     date compared as TEXT, date >= from AND date <= to, as useReportData
--     filters. (A sale stored with a full timestamp on the last day is left
--     out by the screen, and so here.)
--   * Lines: sales.items, quantity ?? qty, rate ?? price ?? unitPrice ??
--     sellingPrice; a line with quantity <= 0 is skipped.
--   * Product: by productId, then id, then sku, then name (case-insensitive),
--     among live products of the shop. A line matching none is skipped.
--   * Cost of a line: the FIFO batches that sale consumed for that product
--     (sale_batch_consumption, qty_taken x unit_cost), up to the line's
--     quantity, pro rata; any uncovered quantity at the product's current
--     costPrice. This is the screen's mirror of process_sale's COGS rule.
--   * Per product: revenue, cogs and gross_profit rounded to paise as the
--     screen rounds them (Math.round, half up); margin_pct = gross_profit /
--     revenue x 100, rounded to 2 places. Loss-making = margin_pct < 0, the
--     screen's "Loss-making SKUs". Thin = 0 <= margin_pct < 5, the screen's
--     BREAK-EVEN tier.
--
-- p_product_ids: rows for these products as well (the items whose purchase
-- cost rose), so ai-ask can say what they sold at. Capped at 100.

CREATE OR REPLACE FUNCTION public.ai_item_margins(
  p_from date, p_to date, p_limit int DEFAULT 5, p_product_ids text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50);
  v_out    jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Bad period' USING ERRCODE = '22023';
  END IF;

  WITH prod AS (
    SELECT p.id, p.name, p.unit, p.sku, p."costPrice" AS cost_price, p."sellingPrice" AS selling_price
      FROM public.products p
     WHERE p.tenant_id = v_tenant AND p.deleted_at IS NULL
  ), sale AS (
    SELECT s.id, s.items
      FROM public.sales s
     WHERE s.tenant_id = v_tenant AND s.deleted_at IS NULL
       AND public.ai_countable(s.voided_at, s.status, s."paymentStatus")
       AND s.date >= p_from::text AND s.date <= p_to::text
  ), line AS (
    SELECT sale.id AS sale_id, e.it,
           public.ai_jsonb_num(COALESCE(NULLIF(e.it -> 'quantity', 'null'::jsonb), NULLIF(e.it -> 'qty', 'null'::jsonb)) #>> '{}') AS qty,
           public.ai_jsonb_num(COALESCE(NULLIF(e.it -> 'rate', 'null'::jsonb), NULLIF(e.it -> 'price', 'null'::jsonb),
                                        NULLIF(e.it -> 'unitPrice', 'null'::jsonb), NULLIF(e.it -> 'sellingPrice', 'null'::jsonb)) #>> '{}') AS price
      FROM sale
     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sale.items) = 'array' THEN sale.items ELSE '[]'::jsonb END) AS e(it)
  ), resolved AS (
    SELECT l.sale_id, l.qty, l.price,
           COALESCE(
             (SELECT p.id FROM prod p WHERE NULLIF(l.it ->> 'productId', '') IS NOT NULL AND p.id = l.it ->> 'productId'),
             (SELECT p.id FROM prod p WHERE NULLIF(l.it ->> 'id', '') IS NOT NULL AND p.id = l.it ->> 'id'),
             (SELECT p.id FROM prod p WHERE NULLIF(l.it ->> 'sku', '') IS NOT NULL AND NULLIF(p.sku, '') IS NOT NULL
                 AND lower(p.sku) = lower(l.it ->> 'sku') ORDER BY p.id DESC LIMIT 1),
             (SELECT p.id FROM prod p WHERE NULLIF(l.it ->> 'name', '') IS NOT NULL AND NULLIF(p.name, '') IS NOT NULL
                 AND lower(p.name) = lower(l.it ->> 'name') ORDER BY p.id DESC LIMIT 1)) AS pid
      FROM line l
     WHERE l.qty > 0
  ), fifo AS (
    SELECT c.sale_id, c.product_id,
           SUM(COALESCE(c.qty_taken, 0)) AS fq,
           SUM(COALESCE(c.qty_taken, 0) * COALESCE(c.unit_cost, 0)) AS fv
      FROM public.sale_batch_consumption c
     WHERE c.tenant_id = v_tenant AND c.deleted_at IS NULL
       AND c.sale_id IN (SELECT id FROM sale)
     GROUP BY 1, 2
  ), costed AS (
    SELECT r.pid, r.qty, r.qty * r.price AS rev,
           (CASE WHEN COALESCE(f.fq, 0) > 0 THEN f.fv * (LEAST(r.qty, f.fq) / f.fq) ELSE 0 END)
             + GREATEST(0, r.qty - LEAST(r.qty, COALESCE(f.fq, 0))) * COALESCE(p.cost_price, 0) AS cogs
      FROM resolved r
      JOIN prod p ON p.id = r.pid
      LEFT JOIN fifo f ON f.sale_id = r.sale_id AND f.product_id = r.pid
  ), per AS (
    SELECT pid, SUM(qty) AS units, SUM(rev) AS rev, SUM(cogs) AS cogs FROM costed GROUP BY pid
  ), rows AS (
    SELECT per.pid, p.name, p.unit, per.units,
           floor(per.rev * 100 + 0.5) / 100 AS revenue,
           floor(per.cogs * 100 + 0.5) / 100 AS cogs,
           floor((per.rev - per.cogs) * 100 + 0.5) / 100 AS gross_profit,
           per.rev AS raw_rev,
           COALESCE(p.cost_price, 0) AS unit_cost,
           COALESCE(p.selling_price, 0) AS selling_price
      FROM per JOIN prod p ON p.id = per.pid
     WHERE per.units > 0
  ), r2 AS (
    SELECT rows.*,
           CASE WHEN raw_rev > 0 THEN floor((gross_profit / raw_rev) * 100 * 100 + 0.5) / 100 ELSE 0 END AS margin_pct,
           CASE WHEN units > 0 THEN floor((raw_rev / units) * 100 + 0.5) / 100 ELSE 0 END AS avg_sell_price
      FROM rows
  ), j AS (
    SELECT r2.*, jsonb_build_object(
             'product_id', pid, 'product_name', name, 'unit', unit,
             'units_sold', ROUND(units, 3), 'avg_sell_price', ROUND(avg_sell_price, 2),
             'unit_cost', ROUND(unit_cost, 2), 'selling_price', ROUND(selling_price, 2),
             'revenue', ROUND(revenue, 2), 'cogs', ROUND(cogs, 2),
             'gross_profit', ROUND(gross_profit, 2), 'margin_pct', ROUND(margin_pct, 2)) AS o
      FROM r2
  )
  SELECT jsonb_build_object(
    'period_from', p_from, 'period_to', p_to, 'as_of', now(),
    'items_sold', (SELECT COUNT(*) FROM j),
    'loss_items', (SELECT COUNT(*) FROM j WHERE margin_pct < 0),
    'thin_items', (SELECT COUNT(*) FROM j WHERE margin_pct >= 0 AND margin_pct < 5),
    'revenue', (SELECT ROUND(COALESCE(SUM(revenue), 0), 2) FROM j),
    'cogs', (SELECT ROUND(COALESCE(SUM(cogs), 0), 2) FROM j),
    'gross_profit', (SELECT ROUND(COALESCE(SUM(revenue), 0) - COALESCE(SUM(cogs), 0), 2) FROM j),
    'loss', COALESCE((SELECT jsonb_agg(t.o ORDER BY t.gross_profit, t.name, t.pid)
                        FROM (SELECT * FROM j WHERE margin_pct < 0 ORDER BY gross_profit, name, pid LIMIT v_limit) t), '[]'::jsonb),
    'thin', COALESCE((SELECT jsonb_agg(t.o ORDER BY t.revenue DESC, t.name, t.pid)
                        FROM (SELECT * FROM j WHERE margin_pct >= 0 AND margin_pct < 5 ORDER BY revenue DESC, name, pid LIMIT v_limit) t), '[]'::jsonb),
    'picked', COALESCE((SELECT jsonb_agg(t.o ORDER BY t.revenue DESC, t.name, t.pid)
                        FROM (SELECT * FROM j WHERE p_product_ids IS NOT NULL AND pid = ANY (p_product_ids)
                               ORDER BY revenue DESC, name, pid LIMIT 100) t), '[]'::jsonb))
    INTO v_out;

  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.ai_item_margins(date, date, int, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_item_margins(date, date, int, text[]) TO authenticated;
