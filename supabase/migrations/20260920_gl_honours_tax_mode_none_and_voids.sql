-- Two defects in the general ledger, both found by asking why the ledger and
-- the P&L disagreed about the same books.
--
-- 1. THE LEDGER DID NOT KNOW ABOUT tax_mode = 'NONE'.
--
--    business_profile.tax_mode has three legal values and the CHECK constraint
--    on production has always allowed all three. get_pl_ranged handles all
--    three. The GL posting functions handled INCLUSIVE and EXCLUSIVE only, so
--    a tenant set to NONE fell through to the EXCLUSIVE branch and had output
--    GST posted on every sale.
--
--    On production: Rs 1,95,603.95 credited to account 2200 across 904 of
--    1,007 sale journals, less Rs 2,226.97 debited across 4 return journals --
--    a phantom Rs 1,93,376.98 GST liability on the books of a business that
--    does not charge GST, while its own P&L reported zero for the same period.
--
--    The P&L was right. Adding the mis-posted GST back into revenue reproduces
--    its figures exactly, including returns of Rs 14,608.00.
--
-- 2. A VOIDED SALE STAYED IN THE LEDGER.
--
--    gl_post_sales tested only `status` and `deleted_at`. void_sale sets
--    voided_at and paymentStatus = 'VOIDED' and commonly leaves `status` NULL,
--    so a voided bill went on being counted as revenue in the ledger while the
--    P&L, which tests all four, excluded it. The exclusion set here is now
--    deliberately IDENTICAL to get_pl_ranged's: two views of the same books
--    should not disagree about what a sale is.
--
-- Both are behaviour fixes. The journals already posted were restated
-- separately -- see the PR -- with the prior state copied to
-- public._gst_none_gl_snapshot and public._voided_sale_gl_snapshot first.

CREATE OR REPLACE FUNCTION public.gl_post_sales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_total numeric; v_cogs numeric; v_paystatus text; v_status text;
  v_journal_id uuid; v_tax_mode text; v_gst numeric := 0; v_net numeric;
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

  -- Same exclusion set as get_pl_ranged. See note 2 above.
  IF NEW.deleted_at IS NOT NULL
     OR NEW.voided_at IS NOT NULL
     OR upper(v_status)    IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     OR upper(v_paystatus) IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     OR v_total = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(bp.tax_mode, 'EXCLUSIVE') INTO v_tax_mode
    FROM public.business_profile bp WHERE bp.tenant_id = v_tenant_id;

  -- NONE: no output tax, and the whole amount is revenue. See note 1 above.
  SELECT COALESCE(SUM(
           CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'NONE' THEN 0
                WHEN si.tax_rate > 0 THEN
             CASE WHEN upper(COALESCE(v_tax_mode,'EXCLUSIVE')) = 'INCLUSIVE'
                  THEN si.line_total - si.line_total / (1 + (si.tax_rate / 100.0))
                  ELSE si.line_total * (si.tax_rate / 100.0)
             END
           ELSE 0 END), 0)
    INTO v_gst
    FROM public.sale_items si
   WHERE si.sale_id = NEW.id AND si.deleted_at IS NULL;

  v_gst := ROUND(v_gst, 2);
  IF v_gst < 0 THEN v_gst := 0; END IF;
  IF v_gst > v_total THEN v_gst := 0; END IF;
  v_net := v_total - v_gst;

  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'SALE', v_ref_id, 'Sale posting') RETURNING id INTO v_journal_id;

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
    COALESCE(SUM(si.quantity * COALESCE(p."costPrice", 0)), 0)
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
