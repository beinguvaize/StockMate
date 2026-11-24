-- Phase 5a: the P&L reads sale_items and sales_return_items.
--
-- Third of the sixteen server-side readers of a JSON line blob. Both of this
-- function's blob reads move at once: sales.items in the sale_gst CTE, and
-- sales_returns.items in the ret CTE.
--
-- COGS IS NOT TOUCHED. It still comes from sales."totalCogs" and is still
-- prorated by (gross - gst)/gross exactly as before. The lines are only ever
-- used to work out the GST embedded in a sale, which keeps this change clear
-- of the frozen COGS path. Returns still take their tax rate and cost from the
-- PRODUCT rather than the stored line, as they always have.
--
-- The LEFT JOIN is deliberate and load-bearing: a sale with no representable
-- lines must still contribute its gross and its COGS with zero GST, which is
-- exactly what the empty-blob case did before.
--
-- VERIFIED BEFORE AND AFTER APPLYING:
--   * Component level, across all live production rows: per-sale GST identical
--     on 1,463 sales (Rs 34,326.05 either way, worst difference 0.00), prorated
--     COGS identical (Rs 14,40,601.61), and per-return GST and COGS identical
--     on all 5 returns (Rs 11,478.10 COGS).
--   * Function level: the previous implementation was recreated under a
--     throwaway name and both were run for EVERY tenant with sales across four
--     periods including all-time -- 12 comparisons, 12 identical, 0 differing.

CREATE OR REPLACE FUNCTION public.get_pl_ranged(p_tenant_id uuid, p_from date, p_to date)
 RETURNS TABLE(revenue_net numeric, output_gst numeric, cogs numeric, returns_total numeric, expenses numeric, gross_profit numeric, net_profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_tax_mode text;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT COALESCE(tax_mode,'EXCLUSIVE') INTO v_tax_mode
    FROM public.business_profile WHERE tenant_id = p_tenant_id;

  RETURN QUERY
  WITH sale_gst AS (
    SELECT sr.id, sr.gross, sr.ic,
      COALESCE(SUM(
        CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
             WHEN COALESCE(si.tax_rate,0) > 0 THEN
          CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
            THEN si.line_total - si.line_total / (1 + si.tax_rate/100)
            ELSE si.line_total * si.tax_rate/100
          END
        ELSE 0 END), 0) AS ig
    FROM (
      SELECT s.id, s."totalAmount" AS gross, COALESCE(s."totalCogs",0) AS ic
      FROM public.sales s
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND s.voided_at IS NULL
        AND upper(COALESCE(s.status,''))          NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND upper(COALESCE(s."paymentStatus",'')) NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND s.date::date BETWEEN p_from AND p_to
    ) sr
    LEFT JOIN public.sale_items si ON si.sale_id = sr.id AND si.deleted_at IS NULL
    GROUP BY sr.id, sr.gross, sr.ic
  ),
  agg AS (
    SELECT COALESCE(SUM(gross),0) AS rev_gross,
           COALESCE(SUM(ig),0)    AS tgst,
           COALESCE(SUM(CASE WHEN gross > 0 THEN ic * (gross - ig) / gross ELSE ic END),0) AS tcogs
    FROM sale_gst
  ),
  ret AS (
    SELECT COALESCE(SUM(rg.gross),0) AS tret_gross,
           COALESCE(SUM(rg.rgst),0)  AS tret_gst,
           COALESCE(SUM(CASE WHEN rg.gross > 0 THEN rg.rcogs * (rg.gross - rg.rgst) / rg.gross ELSE rg.rcogs END),0) AS tret_cogs
    FROM (
      SELECT r.id, r.total_amount AS gross,
        COALESCE(SUM(
          CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
               WHEN COALESCE(p."taxRate",0) > 0 THEN
            CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
              THEN si.line_total - si.line_total / (1 + p."taxRate"/100)
              ELSE si.line_total * p."taxRate"/100
            END
          ELSE 0 END), 0) AS rgst,
        COALESCE(SUM(si.quantity * COALESCE(p."costPrice",0)), 0) AS rcogs
      FROM public.sales_returns r
      LEFT JOIN public.sales_return_items si ON si.return_id = r.id AND si.deleted_at IS NULL
      LEFT JOIN public.products p ON p.id = si.product_id AND p.tenant_id = p_tenant_id
      WHERE r.tenant_id = p_tenant_id AND r.date::date BETWEEN p_from AND p_to
      GROUP BY r.id, r.total_amount
    ) rg
  ),
  exp AS (
    SELECT COALESCE(SUM(amount),0) AS texp
    FROM public.expenses
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
      AND COALESCE(exclude_from_pl, false) = false
      AND date::date BETWEEN p_from AND p_to
  )
  SELECT
    ROUND(a.rev_gross - a.tgst - (r.tret_gross - r.tret_gst), 2),
    ROUND(a.tgst - r.tret_gst, 2),
    ROUND(a.tcogs - r.tret_cogs, 2),
    ROUND(r.tret_gross, 2),
    ROUND(e.texp, 2),
    ROUND((a.rev_gross - a.tgst - (r.tret_gross - r.tret_gst)) - (a.tcogs - r.tret_cogs), 2),
    ROUND((a.rev_gross - a.tgst - (r.tret_gross - r.tret_gst)) - (a.tcogs - r.tret_cogs) - e.texp, 2)
  FROM agg a, ret r, exp e;
END;
$function$;
