-- Both readers take the return's cost from the line, instead of each working
-- it out again from the product.
--
-- This is the half that makes the agreement structural. Two functions deriving
-- the same figure independently is what produced every discrepancy found on
-- this path: a NONE tax mode one of them knew about, a void condition one of
-- them tested, and a cost one of them froze. Reading one stored value removes
-- the opportunity.
--
-- Everything else in both functions is unchanged.

CREATE OR REPLACE FUNCTION public.gl_post_sales_returns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_total numeric; v_journal_id uuid;
  v_tax_mode text; v_gst numeric := 0; v_cogs numeric := 0; v_net numeric;
  v_credit_acct text;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'SALE_RETURN', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  v_total := COALESCE(NEW.total_amount, 0);
  IF v_total = 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(bp.tax_mode, 'EXCLUSIVE') INTO v_tax_mode
    FROM public.business_profile bp WHERE bp.tenant_id = v_tenant_id;

  SELECT
    COALESCE(SUM(
      CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
           WHEN COALESCE(p."taxRate", 0) > 0 THEN
        CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
             THEN si.line_total - si.line_total / (1 + (COALESCE(p."taxRate",0) / 100.0))
             ELSE si.line_total * (COALESCE(p."taxRate",0) / 100.0)
        END
      ELSE 0 END), 0),
    -- READ, not recomputed.
    COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0)
  INTO v_gst, v_cogs
  FROM public.sales_return_items si
  LEFT JOIN public.products p ON p.id = si.product_id AND p.tenant_id = v_tenant_id
  WHERE si.return_id = NEW.id AND si.deleted_at IS NULL;

  v_gst := ROUND(v_gst, 2);
  IF v_gst < 0 OR v_gst > v_total THEN v_gst := 0; END IF;
  v_cogs := ROUND(v_cogs, 2);
  v_net := v_total - v_gst;

  v_credit_acct := CASE WHEN NEW.client_id IS NOT NULL AND NEW.client_id <> '' THEN '1100' ELSE '1000' END;

  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'SALE_RETURN', v_ref_id, 'Sales return posting') RETURNING id INTO v_journal_id;

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'4000'), v_net);
  IF v_gst > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'2200'), v_gst);
  END IF;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id, v_credit_acct), v_total);
  IF v_cogs > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1200'), v_cogs);
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'5000'), v_cogs);
  END IF;
  RETURN NEW;
END;
$function$;

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
        -- The same stored cost the ledger reads. Agreement by construction.
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
