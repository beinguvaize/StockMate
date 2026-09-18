-- The GL and the P&L stop implementing the GST rule twice.
--
-- Every money defect restated in this project came from one cause: the general
-- ledger and the P&L compute the same figures INDEPENDENTLY from the same
-- sales. Three defects, one cause -- the NONE-mode phantom liability, the
-- voided sale still counted as revenue, and return cost drifting. Only return
-- COST was de-duplicated at the time; revenue and GST were still computed
-- twice and could diverge again the same way.
--
-- THEY ALREADY HAD DIVERGED, AND NOBODY HAD NOTICED
--
-- gl_post_sales CLAMPS the computed GST:
--
--     IF v_gst < 0      THEN v_gst := 0; END IF;
--     IF v_gst > v_total THEN v_gst := 0; END IF;
--
-- get_pl_ranged has NO clamp. On any sale whose computed GST exceeded the
-- sale total, the ledger would post zero output GST and the P&L would report
-- the full amount -- the two surfaces disagreeing, silently, on a statutory
-- figure.
--
-- Measured on production before writing this: of 1,487 live sales, ZERO trip
-- either clamp, and of 5 live returns, zero. So adopting one shared rule
-- restates NOTHING today. It removes the possibility, not a number.
--
-- WHAT IS SHARED, AND WHAT IS NOT
--
-- Sale GST and return GST each become ONE function that both surfaces call.
-- Revenue follows for free: both derive it as total - GST, so once GST has a
-- single definition, so does revenue.
--
-- Sale COGS needed nothing: both read sales."totalCogs". Return cost needed
-- nothing: both read sales_return_items.cost_price. Those were de-duplicated
-- by storing the figure once, which is the same principle applied to data
-- rather than to code.
--
-- THE RETURN RATE SOURCE IS PRESERVED EXACTLY, INCLUDING ITS BUG
--
-- sales_return_gst_amount reads products."taxRate" -- TODAY'S product master --
-- rather than sales_return_items.tax_rate, the rate actually billed. That is
-- wrong, and it is tracked separately. It is reproduced here VERBATIM because
-- this migration must not move a single figure.
--
-- Both the GL and the P&L had that same bug, identically, which is exactly why
-- it stayed invisible: they agreed with each other while both being wrong.
-- After this migration there is ONE place to fix it instead of two, and it
-- cannot be half-fixed into a divergence.

CREATE OR REPLACE FUNCTION public.sale_gst_amount(
  p_sale_id  text,
  p_tax_mode text,
  p_total    numeric
)
RETURNS numeric LANGUAGE sql STABLE
AS $function$
  WITH raw AS (
    SELECT ROUND(COALESCE(SUM(
      CASE WHEN upper(COALESCE(p_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
           WHEN COALESCE(si.tax_rate,0) > 0 THEN
        CASE WHEN upper(COALESCE(p_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
             THEN si.line_total - si.line_total / (1 + (si.tax_rate / 100.0))
             ELSE si.line_total * (si.tax_rate / 100.0)
        END
      ELSE 0 END), 0), 2) AS g
    FROM public.sale_items si
    WHERE si.sale_id = p_sale_id AND si.deleted_at IS NULL
  )
  -- The clamp the ledger always had and the P&L never did. GST larger than the
  -- bill, or negative, means the line data is wrong; posting zero is the
  -- ledger's long-standing choice and is now BOTH surfaces' choice.
  SELECT CASE WHEN raw.g < 0 OR raw.g > COALESCE(p_total, 0) THEN 0 ELSE raw.g END
    FROM raw;
$function$;

COMMENT ON FUNCTION public.sale_gst_amount(text, text, numeric) IS
  'The single definition of how much output GST is contained in a sale. Called '
  'by gl_post_sales and get_pl_ranged. Do not inline this rule anywhere else.';

CREATE OR REPLACE FUNCTION public.sales_return_gst_amount(
  p_return_id text,
  p_tenant_id uuid,
  p_tax_mode  text,
  p_total     numeric
)
RETURNS numeric LANGUAGE sql STABLE
AS $function$
  WITH raw AS (
    SELECT ROUND(COALESCE(SUM(
      CASE WHEN upper(COALESCE(p_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
           -- KNOWN DEFECT, PRESERVED DELIBERATELY: this is today's product
           -- master rate, not si.tax_rate, the rate actually billed. Tracked
           -- separately; fixing it here moves money, so it is not done in a
           -- migration whose whole purpose is to move nothing. This is now the
           -- ONE place to fix it.
           WHEN COALESCE(p."taxRate",0) > 0 THEN
        CASE WHEN upper(COALESCE(p_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
             THEN si.line_total - si.line_total / (1 + (p."taxRate" / 100.0))
             ELSE si.line_total * (p."taxRate" / 100.0)
        END
      ELSE 0 END), 0), 2) AS g
    FROM public.sales_return_items si
    LEFT JOIN public.products p
      ON p.id = si.product_id AND p.tenant_id = p_tenant_id
    WHERE si.return_id = p_return_id AND si.deleted_at IS NULL
  )
  SELECT CASE WHEN raw.g < 0 OR raw.g > COALESCE(p_total, 0) THEN 0 ELSE raw.g END
    FROM raw;
$function$;

COMMENT ON FUNCTION public.sales_return_gst_amount(text, uuid, text, numeric) IS
  'The single definition of how much output GST is reversed by a sales return. '
  'Called by gl_post_sales_returns and get_pl_ranged. Reads the PRODUCT rate, '
  'not the billed rate -- a known defect, tracked separately, deliberately '
  'preserved here so this extraction moves no figures.';

-- ---------------------------------------------------------------------------
-- The three consumers, rewritten to CALL the rule instead of restating it.
--
-- These are written out in full rather than patched by anchor, because all
-- three were compared between dev and production first and the ONLY difference
-- was commentary -- the logic was byte-identical. Applying one canonical text
-- to both therefore normalises that drift instead of perpetuating it. (The
-- anchor-patch technique stays the right tool for process_sale, where dev and
-- prod genuinely differ on the COGS path.)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gl_post_sales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_total numeric; v_cogs numeric; v_paystatus text; v_status text;
  v_journal_id uuid; v_tax_mode text; v_gst numeric := 0; v_net numeric;
  v_date date;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'SALE', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_total := COALESCE(NEW."totalAmount", 0);
  v_cogs := COALESCE(NEW."totalCogs", 0);
  v_paystatus := COALESCE(NEW."paymentStatus", 'UNPAID');
  v_status := COALESCE(NEW."status", '');

  -- This exclusion set is deliberately IDENTICAL to get_pl_ranged's. A voided
  -- sale once stayed in the ledger because void_sale leaves status NULL and
  -- only paymentStatus is set. Keep the two lists the same.
  IF NEW.deleted_at IS NOT NULL
     OR NEW.voided_at IS NOT NULL
     OR upper(v_status)    IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     OR upper(v_paystatus) IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     OR v_total = 0 THEN
    RETURN NEW;
  END IF;

  -- The journal carries the date of the TRANSACTION, not of the posting.
  -- gl_journals.date defaults to now() and nothing ever set it, so 848 of
  -- 1,463 sale journals were dated whenever the trigger happened to run --
  -- the worst by 111 days. A bad or missing date falls back to today rather
  -- than refusing the sale.
  BEGIN
    v_date := COALESCE(NEW.date::date, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    v_date := CURRENT_DATE;
  END;

  SELECT COALESCE(bp.tax_mode, 'EXCLUSIVE') INTO v_tax_mode
    FROM public.business_profile bp WHERE bp.tenant_id = v_tenant_id;

  -- One rule, one place. The clamp lives inside the function now.
  v_gst := public.sale_gst_amount(NEW.id, v_tax_mode, v_total);
  v_net := v_total - v_gst;

  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (v_tenant_id, v_date, 'SALE', v_ref_id, 'Sale posting') RETURNING id INTO v_journal_id;

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'4000'), v_net);
  IF v_gst > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'2200'), v_gst);
  END IF;
  IF upper(v_paystatus) = 'PAID' THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_total);
  ELSE
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1100'), v_total);
  END IF;
  IF v_cogs > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'5000'), v_cogs);
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1200'), v_cogs);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gl_post_sales_returns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_total numeric; v_journal_id uuid;
  v_tax_mode text; v_gst numeric := 0; v_cogs numeric := 0; v_net numeric;
  v_credit_acct text; v_date date;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'SALE_RETURN', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  v_total := COALESCE(NEW.total_amount, 0);
  IF v_total = 0 THEN RETURN NEW; END IF;

  BEGIN
    v_date := COALESCE(NEW.date::date, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    v_date := CURRENT_DATE;
  END;

  SELECT COALESCE(bp.tax_mode, 'EXCLUSIVE') INTO v_tax_mode
    FROM public.business_profile bp WHERE bp.tenant_id = v_tenant_id;

  v_gst := public.sales_return_gst_amount(NEW.id, v_tenant_id, v_tax_mode, v_total);

  -- The cost is READ, never recomputed. cost_price was recorded at the moment
  -- of return precisely so it cannot drift away from what the P&L reports.
  SELECT COALESCE(SUM(si.quantity * COALESCE(si.cost_price, 0)), 0)
    INTO v_cogs
    FROM public.sales_return_items si
   WHERE si.return_id = NEW.id AND si.deleted_at IS NULL;
  v_cogs := ROUND(v_cogs, 2);

  v_net := v_total - v_gst;

  v_credit_acct := CASE WHEN NEW.client_id IS NOT NULL AND NEW.client_id <> '' THEN '1100' ELSE '1000' END;

  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (v_tenant_id, v_date, 'SALE_RETURN', v_ref_id, 'Sales return posting') RETURNING id INTO v_journal_id;

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

CREATE OR REPLACE FUNCTION public.get_pl_ranged(
  p_tenant_id uuid, p_from date, p_to date
)
RETURNS TABLE(revenue_net numeric, output_gst numeric, cogs numeric,
              returns_total numeric, expenses numeric,
              gross_profit numeric, net_profit numeric)
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
    -- The GST rule is NOT restated here any more; it is called. The join to
    -- sale_items and the GROUP BY went with it.
    SELECT sr.id, sr.gross, sr.ic,
           public.sale_gst_amount(sr.id, v_tax_mode, sr.gross) AS ig
    FROM (
      SELECT s.id, s."totalAmount" AS gross, COALESCE(s."totalCogs",0) AS ic
      FROM public.sales s
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND s.voided_at IS NULL
        -- Identical to gl_post_sales's exclusion set. Keep them the same.
        AND upper(COALESCE(s.status,''))          NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND upper(COALESCE(s."paymentStatus",'')) NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
        AND s.date::date BETWEEN p_from AND p_to
    ) sr
  ),
  agg AS (
    SELECT COALESCE(SUM(gross),0) AS rev_gross,
           COALESCE(SUM(ig),0)    AS tgst,
           -- In full. Was ic * (gross - ig) / gross.
           COALESCE(SUM(ic),0)    AS tcogs
    FROM sale_gst
  ),
  ret AS (
    SELECT COALESCE(SUM(rg.gross),0) AS tret_gross,
           COALESCE(SUM(rg.rgst),0)  AS tret_gst,
           -- In full. Was rcogs * (gross - rgst) / gross.
           COALESCE(SUM(rg.rcogs),0) AS tret_cogs
    FROM (
      SELECT r.id, r.total_amount AS gross,
        public.sales_return_gst_amount(r.id, p_tenant_id, v_tax_mode, r.total_amount) AS rgst,
        (SELECT COALESCE(SUM(si.quantity * COALESCE(si.cost_price,0)), 0)
           FROM public.sales_return_items si
          WHERE si.return_id = r.id AND si.deleted_at IS NULL) AS rcogs
      FROM public.sales_returns r
      WHERE r.tenant_id = p_tenant_id AND r.date::date BETWEEN p_from AND p_to
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
