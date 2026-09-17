-- COGS is posted in full, not prorated by the ex-GST fraction of revenue.
--
-- get_pl_ranged scaled each sale's cost by (gross - gst) / gross, and each
-- return's cost the same way. The ledger always posted the full cost, so for a
-- GST-charging tenant the two disagreed BY CONSTRUCTION: Demo Kirana showed
-- Rs 3,31,268.46 of cost in the P&L against Rs 3,57,070.00 in the ledger --
-- the P&L reporting Rs 25,801.54 more profit than the books did.
--
-- A cost does not shrink because the sale included tax. The goods cost what
-- they cost; GST is collected for the government and is already removed from
-- revenue separately. Prorating it a second time understated cost and
-- overstated profit on every GST-charging tenant.
--
-- Decided explicitly: post in full.
--
-- Impact when applied: FUTURE DISPO 0.00 (tax_mode NONE, so the factor was
-- already 1), MaazMobiles 0.00, Demo Kirana -Rs 25,801.54 of reported profit.
-- No real customer's books moved.
--
-- NOTE ON TESTING. This could not be exercised on dev: dev's process_sale is
-- behind prod and lacks the costPrice COGS fallback, so totalCogs is always 0
-- there and any COGS assertion passes vacuously. Verified against production
-- data instead, by comparing the P&L with a ledger-derived one across every
-- tenant with sales over four periods.

CREATE OR REPLACE FUNCTION public.get_pl_ranged(p_tenant_id uuid, p_from date, p_to date)
 RETURNS TABLE(revenue_net numeric, output_gst numeric, cogs numeric, returns_total numeric, expenses numeric, gross_profit numeric, net_profit numeric)
 LANGUAGE plpgsql SECURITY DEFINER
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
           COALESCE(SUM(ic),0)    AS tcogs   -- in full; was ic * (gross-ig)/gross
    FROM sale_gst
  ),
  ret AS (
    SELECT COALESCE(SUM(rg.gross),0) AS tret_gross,
           COALESCE(SUM(rg.rgst),0)  AS tret_gst,
           COALESCE(SUM(rg.rcogs),0) AS tret_cogs  -- in full
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
        COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0) AS rcogs
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
