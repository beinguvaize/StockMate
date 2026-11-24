-- A collection carries its own method.
--
-- When money comes in later against a cash / UPI / bank sale, the ledger row
-- for it ("Collection on sale") was posted under the SALE's method. A cash
-- bill topped up by UPI therefore landed in the cash account. The same was
-- true of a client payment that settles a non-credit sale: it posted under
-- the sale's method, not the method the cashier chose.
--
-- This migration lets the caller say how the money arrived:
--
--   1. settle_sale_payment gains p_method and p_date (both optional, at the
--      end). The old three-argument signature is DROPPED here so only one
--      version is ever live (PostgREST cannot pick between two overloads).
--      Old callers that send three named arguments keep resolving.
--   2. post_sale_to_ledger posts a collection under the method handed to it
--      for that one transaction, and falls back to the sale's method when
--      none was given (which is exactly today's behaviour).
--   3. Editing a sale's method or date no longer wipes its collection rows.
--      Only the original payment row is reposted.
--   4. settle_client_payment hands its own method to the collections it
--      causes on non-credit sales.
--
-- The method travels as a transaction-local setting (app.collection_method),
-- the same mechanism app.restoring uses. Nothing is stored on the sale, so
-- nothing can go stale: a writer that says nothing gets the old behaviour.
--
-- No rows are rewritten. Undo = restore the three previous function bodies.

-- ── 1. settle_sale_payment ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.settle_sale_payment(text, numeric, uuid);

CREATE OR REPLACE FUNCTION public.settle_sale_payment(
  p_sale_id   text,
  p_amount    numeric,
  p_tenant_id uuid,
  p_method    text DEFAULT NULL,
  p_date      date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale   record;
  v_total  numeric;
  v_paid   numeric;
  v_status text;
  v_method text := NULLIF(UPPER(TRIM(COALESCE(p_method, ''))), '');
  v_when   date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;
  IF v_method IN ('CREDIT', 'CREDIT_SALE', 'UDHAAR') THEN
    RAISE EXCEPTION 'Choose how the money was paid (Cash, UPI or Bank). "%" is not a payment method.', p_method
      USING ERRCODE = '22023';
  END IF;
  IF v_method IS NOT NULL AND v_method NOT IN ('CASH', 'UPI', 'BANK', 'CARD') THEN
    RAISE EXCEPTION 'Unknown payment method "%". Use Cash, UPI or Bank.', p_method
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sale
    FROM public.sales
   WHERE id = p_sale_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found for tenant %', p_sale_id, p_tenant_id;
  END IF;

  v_total := ROUND(COALESCE(v_sale."totalAmount", 0)::numeric, 2);
  v_paid  := ROUND((COALESCE(v_sale."paidAmount", 0) + p_amount)::numeric, 2);
  IF v_paid > v_total THEN
    v_paid := v_total;
  END IF;

  v_status := CASE
    WHEN v_paid >= v_total THEN 'PAID'
    WHEN v_paid > 0        THEN 'PARTIAL'
    ELSE 'UNPAID'
  END;

  -- Tell the ledger trigger how this money arrived, for this statement only.
  PERFORM set_config('app.collection_method', COALESCE(v_method, ''), true);

  UPDATE public.sales
     SET "paidAmount"      = v_paid,
         "paymentStatus"   = v_status,
         "lastPaymentDate" = v_when::text
   WHERE id = p_sale_id AND tenant_id = p_tenant_id;

  PERFORM set_config('app.collection_method', '', true);

  -- The linked invoice mirrors the sale, as settle_client_payment does.
  UPDATE public.invoices
     SET payment_status = v_status, paid_amount = v_paid
   WHERE id = 'INV-' || p_sale_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'sale_id',     p_sale_id,
    'paid_amount', v_paid,
    'outstanding', v_total - v_paid,
    'status',      v_status,
    'method',      v_method
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_sale_payment(text, numeric, uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_sale_payment(text, numeric, uuid, text, date) TO authenticated, service_role;

-- ── 2 + 3. post_sale_to_ledger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_sale_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method   text    := UPPER(COALESCE(NEW."paymentMethod", 'CASH'));
  v_want     text;
  v_acc      record;
  v_amount   numeric := COALESCE(NEW."paidAmount", 0);
  v_delta    numeric;
  v_when     date;
  v_new_id   text;
  v_first    boolean;
  v_edited   boolean;
  -- How this collection arrived, when the caller said. NULL = not said.
  v_coll     text    := NULLIF(UPPER(TRIM(COALESCE(current_setting('app.collection_method', true), ''))), '');
  v_cmethod  text;
  v_coll_sum numeric;
BEGIN
  -- A restore puts back exactly what was saved. This trigger would
  -- re-post, re-derive or rewrite it, so it stands aside while one runs.
  IF public.is_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      DELETE FROM account_transactions
       WHERE ref_type='SALE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
      RETURN NEW;
    END IF;

    v_delta  := v_amount - COALESCE(OLD."paidAmount", 0);
    v_edited := UPPER(COALESCE(OLD."paymentMethod",'CASH')) <> v_method
                OR COALESCE(OLD.date,'') <> COALESCE(NEW.date,'');

    IF NOT v_edited AND v_delta = 0 THEN
      RETURN NEW;
    END IF;

    IF NOT v_edited AND v_delta > 0 AND v_method <> 'CREDIT' THEN
      -- A COLLECTION: post only what just arrived, dated when it arrived,
      -- under the method it arrived by. Unsaid = the sale's own method.
      v_when    := COALESCE(NULLIF(NEW."lastPaymentDate",'')::date, NEW.date::date, CURRENT_DATE);
      v_cmethod := COALESCE(v_coll, v_method);

      SELECT * INTO v_acc FROM accounts
       WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL
         AND type = CASE v_cmethod WHEN 'CASH' THEN 'CASH'
                                   WHEN 'UPI'  THEN 'UPI' ELSE 'BANK' END
       ORDER BY is_default DESC, created_at ASC LIMIT 1;
      IF v_acc IS NULL THEN
        SELECT * INTO v_acc FROM accounts
         WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type <> 'LOAN'
         ORDER BY is_default DESC, created_at ASC LIMIT 1;
      END IF;
      IF v_acc IS NULL THEN
        RAISE EXCEPTION 'post_sale_to_ledger: no account for tenant % (collection on %)',
          NEW.tenant_id, NEW.id;
      END IF;

      INSERT INTO account_transactions
        (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note, location_id)
      VALUES ('ATX-' || substr(md5(NEW.id || v_when::text || v_delta::text || now()::text || clock_timestamp()::text), 1, 12),
              NEW.tenant_id, COALESCE(v_acc.linked_bank_account_id, v_acc.id),
              v_when, 'IN', v_delta, v_cmethod, 'SALE', NEW.id, 'Collection on sale',
              NEW.location_id);
      RETURN NEW;
    END IF;

    -- An EDIT (method or date changed, or the paid amount went down).
    -- Collections already posted stay as they are: each is its own receipt,
    -- with its own date and method. Only the original payment is reposted.
    -- If the paid amount no longer covers the collections, or the sale has
    -- become a credit sale, there is nothing to keep them against, so the
    -- sale is reposted whole, as before.
    SELECT COALESCE(SUM(amount), 0) INTO v_coll_sum
      FROM account_transactions
     WHERE ref_type='SALE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id
       AND note = 'Collection on sale';

    IF v_method = 'CREDIT' OR v_amount < v_coll_sum THEN
      DELETE FROM account_transactions
       WHERE ref_type='SALE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
    ELSE
      DELETE FROM account_transactions
       WHERE ref_type='SALE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id
         AND note IS DISTINCT FROM 'Collection on sale';
      v_amount := v_amount - v_coll_sum;
    END IF;
  END IF;

  IF v_method = 'CREDIT' OR v_amount <= 0 THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM account_transactions
        WHERE ref_type='SALE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  v_want := CASE v_method WHEN 'CASH' THEN 'CASH' WHEN 'UPI' THEN 'UPI' ELSE 'BANK' END;

  SELECT * INTO v_acc FROM accounts
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type = v_want
   ORDER BY is_default DESC, created_at ASC LIMIT 1;
  IF v_acc IS NULL THEN
    SELECT * INTO v_acc FROM accounts
     WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type <> 'LOAN'
     ORDER BY is_default DESC, created_at ASC LIMIT 1;
  END IF;

  IF v_acc IS NULL THEN
    SELECT NOT EXISTS (SELECT 1 FROM accounts
                        WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL)
      INTO v_first;
    v_new_id := 'ACC-' || UPPER(substr(md5(NEW.tenant_id::text || v_want), 1, 10));
    INSERT INTO accounts (id, tenant_id, name, type, opening_balance, is_default, created_at)
    VALUES (v_new_id, NEW.tenant_id,
            CASE v_want WHEN 'CASH' THEN 'Cash' WHEN 'UPI' THEN 'UPI' ELSE 'Bank' END,
            v_want, 0, COALESCE(v_first, false), NOW())
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO v_acc FROM accounts WHERE id = v_new_id AND tenant_id = NEW.tenant_id;
    IF v_acc IS NULL THEN
      RAISE EXCEPTION 'post_sale_to_ledger: no account for tenant % and could not create one (%)',
        NEW.tenant_id, v_want;
    END IF;
  END IF;

  INSERT INTO account_transactions
    (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note, location_id)
  VALUES ('ATX-' || substr(md5(NEW.id || now()::text || clock_timestamp()::text), 1, 12),
          NEW.tenant_id, COALESCE(v_acc.linked_bank_account_id, v_acc.id),
          COALESCE(NEW.date::date, CURRENT_DATE), 'IN', v_amount, v_method, 'SALE', NEW.id,
          CASE WHEN TG_OP='UPDATE' THEN 'POS sale (edited)' ELSE 'POS sale' END,
          NEW.location_id);
  RETURN NEW;
END $function$;

-- ── 4. settle_client_payment ─────────────────────────────────────────
-- Same signature, so CREATE OR REPLACE changes it in place.
CREATE OR REPLACE FUNCTION public.settle_client_payment(p_id text, p_tenant_id uuid, p_client_id text, p_amount numeric, p_date date, p_method text DEFAULT 'CASH'::text, p_notes text DEFAULT NULL::text, p_recorded_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric := p_amount;
  v_sale RECORD;
  v_alloc numeric;
  v_new_paid numeric;
  v_new_status text;
  v_noncredit_alloc numeric := 0;
  v_payment_amount numeric;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF UPPER(COALESCE(p_method, '')) IN ('CREDIT', 'CREDIT_SALE', 'UDHAAR') THEN
    RAISE EXCEPTION 'Choose how the money was paid (Cash, UPI or Bank). "%" is not a payment method.', p_method
      USING ERRCODE = '22023';
  END IF;

  -- replay guard: the outbox replays this op when the network returns.
  -- This one claims an id rather than looking for its own row: a receipt
  -- fully absorbed by non-credit sales writes no client_payments row.
  INSERT INTO public.processed_ops (fn, op_id, tenant_id)
  VALUES ('settle_client_payment', p_id, p_tenant_id)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'allocated', 0, 'unallocated', 0, 'cash_sale_portion', 0, 'payment_row_amount', 0);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- Money this receipt puts against a non-credit sale reaches the accounts
  -- through the sale-ledger trigger. Tell it how the money arrived.
  PERFORM set_config('app.collection_method',
                     COALESCE(NULLIF(UPPER(TRIM(COALESCE(p_method, ''))), ''), ''), true);

  FOR v_sale IN
    SELECT id, "totalAmount", COALESCE("paidAmount", 0) AS paid,
           UPPER(COALESCE("paymentMethod",'CASH')) AS method
    FROM sales
    WHERE tenant_id = p_tenant_id
      AND "customerInfo"->>'id' = p_client_id
      AND "paymentStatus" IN ('UNPAID', 'PARTIAL', 'PENDING')
      AND deleted_at IS NULL
      AND voided_at IS NULL
    ORDER BY date ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_alloc := LEAST(v_remaining, v_sale."totalAmount" - v_sale.paid);
    CONTINUE WHEN v_alloc <= 0;

    IF v_sale.method = 'CREDIT' THEN
      v_remaining := v_remaining - v_alloc;
      CONTINUE;
    END IF;

    v_new_paid := v_sale.paid + v_alloc;
    v_new_status := CASE WHEN v_new_paid >= v_sale."totalAmount" THEN 'PAID' ELSE 'PARTIAL' END;

    UPDATE sales
       SET "paymentStatus" = v_new_status,
           "paidAmount"    = v_new_paid,
           "lastPaymentDate" = p_date
     WHERE id = v_sale.id AND tenant_id = p_tenant_id;

    UPDATE invoices
       SET payment_status = v_new_status, paid_amount = v_new_paid
     WHERE id = 'INV-' || v_sale.id AND tenant_id = p_tenant_id;

    v_noncredit_alloc := v_noncredit_alloc + v_alloc;
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  PERFORM set_config('app.collection_method', '', true);

  v_payment_amount := p_amount - v_noncredit_alloc;
  IF v_payment_amount > 0 THEN
    INSERT INTO client_payments (id, tenant_id, client_id, amount, date, payment_method, notes, recorded_by)
    VALUES (p_id, p_tenant_id, p_client_id, v_payment_amount, p_date, p_method, p_notes, p_recorded_by)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'allocated', p_amount - v_remaining,
    'unallocated', v_remaining,
    'cash_sale_portion', v_noncredit_alloc,
    'payment_row_amount', GREATEST(0, v_payment_amount)
  );
END $function$;
