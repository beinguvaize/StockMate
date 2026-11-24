-- Phase 5a: the sales-return GL posting reads sales_return_items.
--
-- Second of the sixteen server-side readers of a JSON line blob.
--
-- WHAT IS PRESERVED. The tax rate and the cost are still read from the
-- PRODUCT, exactly as the loop did -- not from the stored line. That means a
-- return is still costed at the product's CURRENT costPrice rather than the
-- cost of the goods actually sold, which is existing behaviour on the frozen
-- COGS path. Moving the read is not the place to change it.
--
-- ONE DELIBERATE DIFFERENCE. The old loop used SELECT ... INTO per line, and
-- SELECT ... INTO leaves its variables UNCHANGED when no row matches -- so a
-- line whose product had been deleted silently reused the PREVIOUS line's tax
-- rate and cost. This books zero for such a line instead. No production row is
-- affected: all 6 live return lines resolve to a product. Flagged rather than
-- reproduced, because carrying the previous line's cost is a bug, not intent.
--
-- VERIFIED before applying: GST and COGS computed from the blob and from the
-- table for all 5 live returns were identical -- Rs 2,603.52 GST and
-- Rs 11,478.10 COGS either way, worst difference 0.00.

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

  -- Safe only because trg_a_sync_sales_return_items sorts before
  -- trg_gl_sales_returns and has already written the rows for this return.
  SELECT
    COALESCE(SUM(
      CASE WHEN COALESCE(p."taxRate", 0) > 0 THEN
        CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
             THEN si.line_total - si.line_total / (1 + (COALESCE(p."taxRate",0) / 100.0))
             ELSE si.line_total * (COALESCE(p."taxRate",0) / 100.0)
        END
      ELSE 0 END), 0),
    COALESCE(SUM(si.quantity * COALESCE(p."costPrice", 0)), 0)
  INTO v_gst, v_cogs
  FROM public.sales_return_items si
  LEFT JOIN public.products p
    ON p.id = si.product_id AND p.tenant_id = v_tenant_id
  WHERE si.return_id = NEW.id
    AND si.deleted_at IS NULL;

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
