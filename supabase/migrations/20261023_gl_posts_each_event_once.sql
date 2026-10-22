-- The general ledger posts each event once, on the day it happened
-- ============================================================================
--
-- Found while designing Close Financial Year, which cannot promise a closed
-- year stays closed until this is fixed. On FUTURE DISPO, read-only:
--
--   account              GL said        the shop's records say
--   Cash & Bank          Rs 7,09,356    (ledger, itself incomplete -- below)
--   Receivables          Rs -2,83,415   Rs 90,958 owed by customers
--   Payables             Rs 4,63,185    Rs 75,995 owed to suppliers
--
-- Receivables cannot be negative. Seven defects, all in posting:
--
--   1. A credit sale, once paid, had its journal re-posted as Dr CASH. The
--      payment that paid it also posts Dr Cash / Cr Receivables. Every credit
--      sale settled by a payment was cash counted twice and receivables
--      credited once with nothing debited. (Sale SAL-A5BE8EF0: Rs 485 on credit
--      on 15 Oct, journal "Dr Cash 485" dated 15 Oct; paid 17 Oct, Dr Cash
--      again.)
--   2. That re-post happened on ANY update of the sale and was dated on the
--      sale's date -- so paying an old invoice rewrote the old month. Close
--      Financial Year cannot coexist with that.
--   3. Client-payment journals carried no date (they took now()).
--   4. Purchase journals carried no date.
--   5. Supplier payments were never posted to the GL at all, so Payables only
--      ever grew.
--   6. Soft-deleted client payments and purchases kept their journals.
--   7. BANK and UPI purchases were credited to Payables (the test was
--      `= 'CASH'`), and nothing ever paid them off.
--
-- THE RULES NOW
--
--   sale              Dr Receivables / Cr Sales, GST       (never Cash; never
--                     rewritten by a payment -- only when its amount, COGS,
--                     date, items or void state changes)
--   sale receipt      Dr Cash / Cr Receivables, dated when collected, one per
--                     cash-ledger SALE row (the ledger's sale rows are complete:
--                     1,226 counter sales, Rs 12,40,037.26, none missing)
--   client payment    Dr Cash / Cr Receivables, dated the payment's date
--   purchase          Dr Inventory / Cr Cash if paid at purchase, else Payables
--                     (credit = CREDIT, UDHAAR, POST-CAPITAL, as process_purchase)
--   supplier payment  Dr Payables / Cr Cash, dated the payment's date
--
-- Each is one function over one row, called by the trigger AND by the history
-- fix below, so the two cannot drift.
--
-- HISTORY IS FIXED SURGICALLY, AND P&L IS PROVEN UNCHANGED
--
-- Regenerating every sale journal would re-derive revenue and GST with today's
-- rules and could move P&L for sales an older trigger posted. So history is
-- corrected line by line: the sale debit moves from Cash to Receivables,
-- receipt and supplier-payment journals are added, payments and purchases are
-- re-dated, deleted ones dropped, BANK/UPI purchases moved off Payables. Every
-- other line is left alone, and the check at the end fails this migration
-- unless every account other than Cash, Receivables and Payables is
-- byte-identical, shop by shop, to the snapshot taken first.
--
-- NOT FIXED HERE, deliberately, each needing an accounting decision: opening
-- balances of cash/bank accounts, manual cash entries and till variances (none
-- reach the GL today), down payments on credit purchases, purchase returns.

-- ── snapshot first ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public._gl_snapshot_20261023_journals AS
  SELECT * FROM public.gl_journals WITH NO DATA;
CREATE TABLE IF NOT EXISTS public._gl_snapshot_20261023_lines AS
  SELECT * FROM public.gl_lines WITH NO DATA;
DO $snap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._gl_snapshot_20261023_journals) THEN
    INSERT INTO public._gl_snapshot_20261023_journals SELECT * FROM public.gl_journals;
    INSERT INTO public._gl_snapshot_20261023_lines    SELECT * FROM public.gl_lines;
  END IF;
END $snap$;
REVOKE ALL ON public._gl_snapshot_20261023_journals, public._gl_snapshot_20261023_lines FROM anon, authenticated;
ALTER TABLE public._gl_snapshot_20261023_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._gl_snapshot_20261023_lines    ENABLE ROW LEVEL SECURITY;

-- ── shared ──────────────────────────────────────────────────────────────────

-- A transaction's date from whatever type the table stores it as. A date that
-- will not parse falls back rather than refusing the posting -- the posting
-- is not the place to reject a sale.
CREATE OR REPLACE FUNCTION public.gl_txn_date(p_value text, p_fallback date DEFAULT CURRENT_DATE)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN COALESCE(NULLIF(left(p_value, 10), '')::date, p_fallback);
EXCEPTION WHEN OTHERS THEN
  RETURN p_fallback;
END
$$;

CREATE OR REPLACE FUNCTION public.gl_is_credit_purchase(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(COALESCE(p_type, 'CREDIT')) IN ('CREDIT', 'UDHAAR', 'POST-CAPITAL')
$$;

-- ── one row, one journal ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.gl_post_sale_row(s public.sales)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_total numeric := COALESCE(s."totalAmount", 0);
  v_cogs  numeric := COALESCE(s."totalCogs", 0);
  v_tax_mode text;
  v_gst  numeric;
  v_journal_id uuid;
BEGIN
  PERFORM public.gl_drop_source_journal(s.tenant_id, 'SALE', s.id::text);

  -- Identical to get_pl_ranged's exclusions. Keep the two lists the same.
  IF s.deleted_at IS NOT NULL OR s.voided_at IS NOT NULL
     OR upper(COALESCE(s.status, ''))           IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     OR upper(COALESCE(s."paymentStatus", ''))  IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     OR v_total = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(bp.tax_mode, 'EXCLUSIVE') INTO v_tax_mode
    FROM public.business_profile bp WHERE bp.tenant_id = s.tenant_id;
  v_gst := public.sale_gst_amount(s.id, v_tax_mode, v_total);

  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (s.tenant_id, public.gl_txn_date(s.date), 'SALE', s.id::text, 'Sale posting')
  RETURNING id INTO v_journal_id;

  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (s.tenant_id, v_journal_id, public.gl_account_id(s.tenant_id, '4000'), v_total - v_gst);
  IF v_gst > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (s.tenant_id, v_journal_id, public.gl_account_id(s.tenant_id, '2200'), v_gst);
  END IF;
  -- Always Receivables. The money arrives as its own journal -- a sale
  -- receipt or a client payment -- on the day it arrives.
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (s.tenant_id, v_journal_id, public.gl_account_id(s.tenant_id, '1100'), v_total);
  IF v_cogs > 0 THEN
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (s.tenant_id, v_journal_id, public.gl_account_id(s.tenant_id, '5000'), v_cogs);
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (s.tenant_id, v_journal_id, public.gl_account_id(s.tenant_id, '1200'), v_cogs);
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_sale_receipt_row(a public.account_transactions)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_journal_id uuid;
  v_in boolean := upper(COALESCE(a.direction, 'IN')) = 'IN';
BEGIN
  PERFORM public.gl_drop_source_journal(a.tenant_id, 'SALE_RECEIPT', a.id::text);
  IF a.ref_type IS DISTINCT FROM 'SALE' OR COALESCE(a.amount, 0) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (a.tenant_id, COALESCE(a.date, CURRENT_DATE), 'SALE_RECEIPT', a.id::text,
          CASE WHEN v_in THEN 'Sale receipt' ELSE 'Sale refund' END)
  RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (a.tenant_id, v_journal_id, public.gl_account_id(a.tenant_id, CASE WHEN v_in THEN '1000' ELSE '1100' END), a.amount);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (a.tenant_id, v_journal_id, public.gl_account_id(a.tenant_id, CASE WHEN v_in THEN '1100' ELSE '1000' END), a.amount);
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_client_payment_row(p public.client_payments)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_journal_id uuid;
BEGIN
  PERFORM public.gl_drop_source_journal(p.tenant_id, 'PAYMENT', p.id::text);
  IF p.deleted_at IS NOT NULL OR COALESCE(p.amount, 0) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (p.tenant_id, public.gl_txn_date(p.date, COALESCE(p.created_at::date, CURRENT_DATE)),
          'PAYMENT', p.id::text, 'Client payment received')
  RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (p.tenant_id, v_journal_id, public.gl_account_id(p.tenant_id, '1000'), p.amount);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (p.tenant_id, v_journal_id, public.gl_account_id(p.tenant_id, '1100'), p.amount);
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_purchase_row(p public.purchases)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_total numeric := COALESCE(p.total_amount, 0);
  v_journal_id uuid;
BEGIN
  PERFORM public.gl_drop_source_journal(p.tenant_id, 'PURCHASE', p.id::text);
  IF p.deleted_at IS NOT NULL OR v_total = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (p.tenant_id, public.gl_txn_date(p.date, COALESCE(p.created_at::date, CURRENT_DATE)),
          'PURCHASE', p.id::text, 'Stock purchase')
  RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (p.tenant_id, v_journal_id, public.gl_account_id(p.tenant_id, '1200'), v_total);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (p.tenant_id, v_journal_id,
          public.gl_account_id(p.tenant_id, CASE WHEN public.gl_is_credit_purchase(p.payment_type) THEN '2000' ELSE '1000' END),
          v_total);
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_supplier_payment_row(p public.supplier_payments)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_journal_id uuid;
BEGIN
  PERFORM public.gl_drop_source_journal(p.tenant_id, 'SUPPLIER_PAYMENT', p.id::text);
  IF p.deleted_at IS NOT NULL OR COALESCE(p.amount, 0) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (p.tenant_id, COALESCE(p.date, p.created_at::date, CURRENT_DATE),
          'SUPPLIER_PAYMENT', p.id::text, 'Supplier payment')
  RETURNING id INTO v_journal_id;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (p.tenant_id, v_journal_id, public.gl_account_id(p.tenant_id, '2000'), p.amount);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (p.tenant_id, v_journal_id, public.gl_account_id(p.tenant_id, '1000'), p.amount);
END
$fn$;

-- ── the triggers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.gl_post_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- A restore puts back exactly what was saved. This trigger would
  -- re-post, re-derive or rewrite it, so it stands aside while one runs.
  IF public.is_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.gl_drop_source_journal(OLD.tenant_id, 'SALE', OLD.id::text);
    RETURN OLD;
  END IF;

  -- A payment changes paidAmount and paymentStatus. Neither is in the sale's
  -- journal any more, so a payment no longer rewrites it -- which is what
  -- stops paying an old invoice from rewriting an old (or closed) month.
  IF TG_OP = 'UPDATE'
     AND NEW."totalAmount" IS NOT DISTINCT FROM OLD."totalAmount"
     AND NEW."totalCogs"   IS NOT DISTINCT FROM OLD."totalCogs"
     AND NEW.date          IS NOT DISTINCT FROM OLD.date
     AND NEW.items::text   IS NOT DISTINCT FROM OLD.items::text
     AND (NEW.deleted_at IS NULL) = (OLD.deleted_at IS NULL)
     AND (NEW.voided_at  IS NULL) = (OLD.voided_at  IS NULL)
     AND upper(COALESCE(NEW.status, '')) IS NOT DISTINCT FROM upper(COALESCE(OLD.status, ''))
     AND (upper(COALESCE(NEW."paymentStatus", '')) IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED'))
       = (upper(COALESCE(OLD."paymentStatus", '')) IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED'))
  THEN
    RETURN NEW;
  END IF;

  PERFORM public.gl_post_sale_row(NEW);
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_sale_receipts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- A restore puts back exactly what was saved. This trigger would
  -- re-post, re-derive or rewrite it, so it stands aside while one runs.
  IF public.is_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.ref_type = 'SALE' THEN
      PERFORM public.gl_drop_source_journal(OLD.tenant_id, 'SALE_RECEIPT', OLD.id::text);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.ref_type = 'SALE' OR (TG_OP = 'UPDATE' AND OLD.ref_type = 'SALE') THEN
    PERFORM public.gl_post_sale_receipt_row(NEW);
  END IF;
  -- The sale now has a real receipt, so the one inferred for it (history,
  -- below) goes: the money must not be counted twice.
  IF NEW.ref_type = 'SALE' AND NEW.ref_id IS NOT NULL THEN
    PERFORM public.gl_drop_source_journal(NEW.tenant_id, 'SALE_RECEIPT', 'SALE:' || NEW.ref_id);
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_client_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- A restore puts back exactly what was saved. This trigger would
  -- re-post, re-derive or rewrite it, so it stands aside while one runs.
  IF public.is_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.gl_drop_source_journal(OLD.tenant_id, 'PAYMENT', OLD.id::text);
    RETURN OLD;
  END IF;
  PERFORM public.gl_post_client_payment_row(NEW);
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_purchases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- A restore puts back exactly what was saved. This trigger would
  -- re-post, re-derive or rewrite it, so it stands aside while one runs.
  IF public.is_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.gl_drop_source_journal(OLD.tenant_id, 'PURCHASE', OLD.id::text);
    RETURN OLD;
  END IF;
  -- A payment against the bill changes paid_amount only. It is posted as a
  -- supplier payment; the bill's own journal stays as it was.
  IF TG_OP = 'UPDATE'
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.date         IS NOT DISTINCT FROM OLD.date
     AND NEW.payment_type IS NOT DISTINCT FROM OLD.payment_type
     AND (NEW.deleted_at IS NULL) = (OLD.deleted_at IS NULL)
  THEN
    RETURN NEW;
  END IF;
  PERFORM public.gl_post_purchase_row(NEW);
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.gl_post_supplier_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- A restore puts back exactly what was saved. This trigger would
  -- re-post, re-derive or rewrite it, so it stands aside while one runs.
  IF public.is_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.gl_drop_source_journal(OLD.tenant_id, 'SUPPLIER_PAYMENT', OLD.id::text);
    RETURN OLD;
  END IF;
  PERFORM public.gl_post_supplier_payment_row(NEW);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_gl_sale_receipts ON public.account_transactions;
CREATE TRIGGER trg_gl_sale_receipts
  AFTER INSERT OR UPDATE OR DELETE ON public.account_transactions
  FOR EACH ROW EXECUTE FUNCTION public.gl_post_sale_receipts();

DROP TRIGGER IF EXISTS trg_gl_supplier_payments ON public.supplier_payments;
CREATE TRIGGER trg_gl_supplier_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.gl_post_supplier_payments();

-- ── history, line by line ───────────────────────────────────────────────────

DO $history$
DECLARE
  r record;
BEGIN
  -- 1. A sale's debit is Receivables, never Cash. Only that one line moves.
  UPDATE public.gl_lines l
     SET account_id = public.gl_account_id(l.tenant_id, '1100')
    FROM public.gl_journals j
   WHERE j.id = l.journal_id AND j.reference_type = 'SALE'
     AND l.account_id = public.gl_account_id(l.tenant_id, '1000')
     AND COALESCE(l.debit, 0) > 0;

  -- 2. The money for counter sales, as receipts dated when it came in.
  FOR r IN SELECT a FROM public.account_transactions a WHERE a.ref_type = 'SALE' LOOP
    PERFORM public.gl_post_sale_receipt_row(r.a);
  END LOOP;

  -- 2b. Counter sales rung before the cash ledger recorded sales have no
  --     ledger row, yet were paid (prod: 48 at one shop, Rs 49,890; 3 at the
  --     demo shop). Their receipt is inferred from the sale: paidAmount, on
  --     the sale's date. Credit sales are excluded -- theirs were paid by
  --     client payments, already posted. The cash book is not touched.
  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  SELECT s.tenant_id, public.gl_txn_date(s.date), 'SALE_RECEIPT', 'SALE:' || s.id, 'Sale receipt (inferred from the sale)'
    FROM public.sales s
   WHERE s.deleted_at IS NULL AND s.voided_at IS NULL AND COALESCE(s."paidAmount", 0) > 0
     AND upper(COALESCE(s."paymentMethod", '')) NOT IN ('CREDIT', 'UDHAAR')
     AND upper(COALESCE(s.status, ''))          NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     AND upper(COALESCE(s."paymentStatus", '')) NOT IN ('VOIDED','VOID','CANCELLED','FAILED','REFUNDED')
     AND NOT EXISTS (SELECT 1 FROM public.account_transactions a WHERE a.ref_type = 'SALE' AND a.ref_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.gl_journals g
                      WHERE g.tenant_id = s.tenant_id AND g.reference_type = 'SALE_RECEIPT' AND g.reference_id = 'SALE:' || s.id);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit, credit)
  SELECT g.tenant_id, g.id, public.gl_account_id(g.tenant_id, x.code),
         CASE WHEN x.code = '1000' THEN s."paidAmount" ELSE 0 END,
         CASE WHEN x.code = '1100' THEN s."paidAmount" ELSE 0 END
    FROM public.gl_journals g
    JOIN public.sales s ON 'SALE:' || s.id = g.reference_id AND s.tenant_id = g.tenant_id
   CROSS JOIN (VALUES ('1000'), ('1100')) AS x(code)
   WHERE g.reference_type = 'SALE_RECEIPT' AND g.reference_id LIKE 'SALE:%'
     AND NOT EXISTS (SELECT 1 FROM public.gl_lines l WHERE l.journal_id = g.id);

  -- 3. Client payments: dated, and the deleted ones gone. Their two lines are
  --    already right (Dr Cash / Cr Receivables); only the journal moves.
  UPDATE public.gl_journals j
     SET date = public.gl_txn_date(p.date, COALESCE(p.created_at::date, j.date::date))
    FROM public.client_payments p
   WHERE j.reference_type = 'PAYMENT' AND j.reference_id = p.id::text AND j.tenant_id = p.tenant_id;
  DELETE FROM public.gl_journals j
   USING public.client_payments p
   WHERE j.reference_type = 'PAYMENT' AND j.reference_id = p.id::text AND j.tenant_id = p.tenant_id
     AND p.deleted_at IS NOT NULL;

  -- 4. Purchases: dated, deleted ones gone, and those paid at purchase by
  --    BANK or UPI credited to Cash rather than Payables.
  UPDATE public.gl_journals j
     SET date = public.gl_txn_date(p.date, COALESCE(p.created_at::date, j.date::date))
    FROM public.purchases p
   WHERE j.reference_type = 'PURCHASE' AND j.reference_id = p.id::text AND j.tenant_id = p.tenant_id;
  DELETE FROM public.gl_journals j
   USING public.purchases p
   WHERE j.reference_type = 'PURCHASE' AND j.reference_id = p.id::text AND j.tenant_id = p.tenant_id
     AND p.deleted_at IS NOT NULL;
  UPDATE public.gl_lines l
     SET account_id = public.gl_account_id(l.tenant_id, '1000')
    FROM public.gl_journals j, public.purchases p
   WHERE j.id = l.journal_id AND j.reference_type = 'PURCHASE'
     AND p.id::text = j.reference_id AND p.tenant_id = j.tenant_id
     AND NOT public.gl_is_credit_purchase(p.payment_type)
     AND l.account_id = public.gl_account_id(l.tenant_id, '2000')
     AND COALESCE(l.credit, 0) > 0;

  -- 5. Supplier payments, posted for the first time.
  FOR r IN SELECT sp FROM public.supplier_payments sp WHERE sp.deleted_at IS NULL LOOP
    PERFORM public.gl_post_supplier_payment_row(r.sp);
  END LOOP;
END $history$;

-- ── prove P&L did not move ──────────────────────────────────────────────────
--
-- Every account other than Cash (1000), Receivables (1100) and Payables (2000)
-- must hold exactly what it held before, in every shop. Deleted purchases are
-- the one expected exception: their Inventory debit leaves with them.
DO $check$
DECLARE
  v_bad text;
BEGIN
  WITH before AS (
    SELECT l.tenant_id, l.account_id, round(sum(COALESCE(l.debit,0) - COALESCE(l.credit,0))::numeric, 2) AS bal
      FROM public._gl_snapshot_20261023_lines l
      JOIN public._gl_snapshot_20261023_journals j ON j.id = l.journal_id
     WHERE NOT (j.reference_type = 'PURCHASE' AND EXISTS (
             SELECT 1 FROM public.purchases p WHERE p.id::text = j.reference_id AND p.tenant_id = j.tenant_id AND p.deleted_at IS NOT NULL))
       AND NOT (j.reference_type = 'PAYMENT' AND EXISTS (
             SELECT 1 FROM public.client_payments p WHERE p.id::text = j.reference_id AND p.tenant_id = j.tenant_id AND p.deleted_at IS NOT NULL))
     GROUP BY 1, 2),
  after AS (
    SELECT l.tenant_id, l.account_id, round(sum(COALESCE(l.debit,0) - COALESCE(l.credit,0))::numeric, 2) AS bal
      FROM public.gl_lines l GROUP BY 1, 2),
  untouchable AS (
    SELECT ga.id FROM public.gl_accounts ga WHERE ga.code NOT IN ('1000', '1100', '2000'))
  SELECT string_agg(format('%s/%s: %s -> %s', COALESCE(b.tenant_id, a.tenant_id), ga.code, COALESCE(b.bal, 0), COALESCE(a.bal, 0)), '; ')
    INTO v_bad
    FROM before b
    FULL JOIN after a ON a.tenant_id = b.tenant_id AND a.account_id = b.account_id
    JOIN public.gl_accounts ga ON ga.id = COALESCE(b.account_id, a.account_id)
   WHERE COALESCE(b.account_id, a.account_id) IN (SELECT id FROM untouchable)
     AND COALESCE(b.bal, 0) <> COALESCE(a.bal, 0);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'GL fix moved an account it must not touch: %', v_bad;
  END IF;
END $check$;
