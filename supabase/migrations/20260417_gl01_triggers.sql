-- ==============================================================
-- GL-01 (triggers): automatic double-entry posting from source txns
-- ==============================================================
-- Handles INSERT / UPDATE / DELETE on sales, expenses, purchases,
-- client_payments. On UPDATE/DELETE the existing journal for the
-- source row is dropped (gl_lines CASCADE) and reposted fresh on
-- UPDATE. Status='cancelled' rows are not posted.
--
-- A deferred constraint trigger enforces SUM(debit)=SUM(credit) for
-- every journal at commit time, so any bug that produces an unbalanced
-- journal aborts the transaction rather than corrupting the ledger.
--
-- Actual column names verified against live DEV schema:
--   sales          : "totalAmount","totalCogs","paymentStatus","status"
--   expenses       : amount, category, note
--   purchases      : total_amount, payment_type
--   client_payments: amount
--
-- Replaces any prior gl_posting_* functions and triggers. Drop-safe.

------------------------------------------------------------------
-- 1. Helper: resolve account_id by code within a tenant
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_account_id(p_tenant_id uuid, p_code text)
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM public.gl_accounts WHERE tenant_id = p_tenant_id AND code = p_code LIMIT 1;
$$;

------------------------------------------------------------------
-- 2. Helper: drop prior journal for a source row (idempotent)
--    Returns void. gl_lines are removed via ON DELETE CASCADE.
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_drop_source_journal(
  p_tenant_id uuid, p_ref_type text, p_ref_id text
) RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.gl_journals
   WHERE tenant_id = p_tenant_id
     AND reference_type = p_ref_type
     AND reference_id = p_ref_id;
$$;

------------------------------------------------------------------
-- 3. Constraint trigger: enforce debit = credit per journal
--    DEFERRABLE INITIALLY DEFERRED — allows mid-transaction
--    imbalance while the posting function inserts both legs.
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_assert_journal_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_journal_id uuid;
  v_debit numeric;
  v_credit numeric;
BEGIN
  v_journal_id := COALESCE(NEW.journal_id, OLD.journal_id);
  IF v_journal_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- If journal itself was deleted (CASCADE), skip — nothing to check.
  IF NOT EXISTS (SELECT 1 FROM public.gl_journals WHERE id = v_journal_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM public.gl_lines WHERE journal_id = v_journal_id;

  IF v_debit IS DISTINCT FROM v_credit THEN
    RAISE EXCEPTION
      'GL-01 balance violation: journal % debit=% credit=%',
      v_journal_id, v_debit, v_credit;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_assert_balanced ON public.gl_lines;
CREATE CONSTRAINT TRIGGER trg_gl_assert_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.gl_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.gl_assert_journal_balanced();

------------------------------------------------------------------
-- 4. SALES posting
--    Revenue (CR 4000) ; Cash (DR 1000) or AR (DR 1100)
--    COGS (DR 5000) ; Inventory (CR 1200) if totalCogs > 0
--    Skipped if status='cancelled'.
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_post_sales()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_src        record;
  v_tenant_id  uuid;
  v_ref_id     text;
  v_total      numeric;
  v_cogs       numeric;
  v_paystatus  text;
  v_status     text;
  v_journal_id uuid;
BEGIN
  -- Always drop any prior posting for this source row.
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'SALE', v_ref_id);

  -- DELETE: nothing more to post.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  v_total     := COALESCE(NEW."totalAmount", 0);
  v_cogs      := COALESCE(NEW."totalCogs", 0);
  v_paystatus := COALESCE(NEW."paymentStatus", 'UNPAID');
  v_status    := COALESCE(NEW."status", '');

  -- Skip posting for cancelled or zero-amount sales.
  IF upper(v_status) = 'CANCELLED' OR v_total = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'SALE', v_ref_id, 'Sale posting')
  RETURNING id INTO v_journal_id;

  -- Revenue CR 4000
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'4000'), v_total);

  -- Cash or AR
  IF upper(v_paystatus) = 'PAID' THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_total);
  ELSE
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1100'), v_total);
  END IF;

  -- COGS / Inventory
  IF v_cogs > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'5000'), v_cogs);
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1200'), v_cogs);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_sales ON public.sales;
CREATE TRIGGER trg_gl_sales
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.gl_post_sales();

------------------------------------------------------------------
-- 5. EXPENSES posting
--    DR 5100 (Payroll) or DR 5200 (Opex)  ;  CR 1000 (Cash)
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_post_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_src        record;
  v_tenant_id  uuid;
  v_ref_id     text;
  v_amount     numeric;
  v_cat        text;
  v_desc       text;
  v_journal_id uuid;
  v_debit_code text;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'EXPENSE', v_ref_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  v_amount := COALESCE(NEW.amount, 0);
  v_cat    := COALESCE(NEW.category, '');
  v_desc   := COALESCE(NEW.note, 'Expense');

  IF v_amount = 0 THEN RETURN NEW; END IF;

  v_debit_code := CASE WHEN upper(v_cat) LIKE '%PAYROLL%' THEN '5100' ELSE '5200' END;

  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'EXPENSE', v_ref_id, v_desc)
  RETURNING id INTO v_journal_id;

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id, v_debit_code), v_amount);

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_amount);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_expenses ON public.expenses;
CREATE TRIGGER trg_gl_expenses
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.gl_post_expenses();

------------------------------------------------------------------
-- 6. PURCHASES posting
--    DR 1200 (Inventory)  ;  CR 1000 (Cash) if CASH else CR 2000 (AP)
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_post_purchases()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_src        record;
  v_tenant_id  uuid;
  v_ref_id     text;
  v_total      numeric;
  v_pay_type   text;
  v_journal_id uuid;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'PURCHASE', v_ref_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  v_total    := COALESCE(NEW.total_amount, 0);
  v_pay_type := COALESCE(NEW.payment_type, 'CREDIT');

  IF v_total = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'PURCHASE', v_ref_id, 'Stock purchase')
  RETURNING id INTO v_journal_id;

  -- Debit Inventory
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1200'), v_total);

  -- Credit Cash or AP
  IF upper(v_pay_type) = 'CASH' THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_total);
  ELSE
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'2000'), v_total);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_purchases ON public.purchases;
CREATE TRIGGER trg_gl_purchases
AFTER INSERT OR UPDATE OR DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.gl_post_purchases();

------------------------------------------------------------------
-- 7. CLIENT PAYMENTS posting
--    DR 1000 (Cash)  ;  CR 1100 (AR)
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_post_client_payments()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_src        record;
  v_tenant_id  uuid;
  v_ref_id     text;
  v_amount     numeric;
  v_journal_id uuid;
BEGIN
  v_src := COALESCE(NEW, OLD);
  v_tenant_id := v_src.tenant_id;
  v_ref_id := v_src.id::text;
  PERFORM public.gl_drop_source_journal(v_tenant_id, 'PAYMENT', v_ref_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
  VALUES (v_tenant_id, 'PAYMENT', v_ref_id, 'Client payment received')
  RETURNING id INTO v_journal_id;

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1000'), v_amount);

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_tenant_id, v_journal_id, public.gl_account_id(v_tenant_id,'1100'), v_amount);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gl_client_payments ON public.client_payments;
CREATE TRIGGER trg_gl_client_payments
AFTER INSERT OR UPDATE OR DELETE ON public.client_payments
FOR EACH ROW EXECUTE FUNCTION public.gl_post_client_payments();
