-- Journals carry the date of the TRANSACTION, not the date they were posted.
--
-- gl_journals.date defaults to now() and NO posting function ever set it, so
-- every journal was dated whenever its trigger happened to run.
--
-- On production: 848 of 1,463 sale journals were dated wrongly, the worst by
-- 111 days -- a June sale sitting in the ledger as September -- plus 128
-- expense journals and all 5 return journals.
--
-- Nothing caught it because the only reader, get_gl_balances, is all-time and
-- has no date filter. The moment any report asks the ledger for a MONTH, or a
-- balance sheet asks for an as-of date, every one of those lands in the wrong
-- period. This had to be right before the P&L could read the ledger by date
-- range at all.
--
-- gl_post_expenses had a second fault: it never checked deleted_at, so a
-- soft-deleted expense kept its journal. The ledger held 355 expense journals
-- for 340 live expenses.
--
-- NOT changed: expenses flagged exclude_from_pl are still posted to the
-- ledger. That flag means "leave this out of the P&L" -- an owner's drawing,
-- say -- and it is not obvious it should also mean "pretend the money never
-- moved". The two differ on expenses BY DESIGN; that wants a decision.

CREATE OR REPLACE FUNCTION public.gl_post_expenses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src record; v_tenant_id uuid; v_ref_id text;
  v_amount numeric; v_cat text; v_desc text;
  v_journal_id uuid; v_debit_code text; v_date date;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'EXPENSE', v_ref_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount = 0 OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  v_cat := COALESCE(NEW.category, '');
  v_desc := COALESCE(NEW.note, 'Expense');

  BEGIN
    v_date := COALESCE(NEW.date::date, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    v_date := CURRENT_DATE;
  END;

  v_debit_code := CASE WHEN upper(v_cat) LIKE '%PAYROLL%' THEN '5100' ELSE '5200' END;

  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (v_tenant_id, v_date, 'EXPENSE', v_ref_id, v_desc) RETURNING id INTO v_journal_id;

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id, v_debit_code), v_amount);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_amount);
  RETURN NEW;
END;
$function$;

-- Backfill every journal from its source transaction.
UPDATE public.gl_journals j SET date = s.date::date
  FROM public.sales s
 WHERE j.reference_type='SALE' AND j.reference_id = s.id
   AND j.date::date IS DISTINCT FROM s.date::date;

UPDATE public.gl_journals j SET date = r.date::date
  FROM public.sales_returns r
 WHERE j.reference_type='SALE_RETURN' AND j.reference_id = r.id
   AND j.date::date IS DISTINCT FROM r.date::date;

UPDATE public.gl_journals j SET date = e.date::date
  FROM public.expenses e
 WHERE j.reference_type='EXPENSE' AND j.reference_id = e.id::text
   AND j.date::date IS DISTINCT FROM e.date::date;

-- And drop journals belonging to expenses that were soft-deleted.
SELECT public.gl_drop_source_journal(e.tenant_id, 'EXPENSE', e.id::text)
  FROM public.expenses e WHERE e.deleted_at IS NOT NULL;
