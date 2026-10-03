-- The triggers that post money
-- ============================================================================
--
-- Five functions, one trigger each, and no CREATE FUNCTION for any of them
-- anywhere in this directory. They are what moves a sale, a purchase, an
-- expense, a receipt or a supplier payment into account_transactions.
--
-- On a database rebuilt from these migrations they would simply not exist, and
-- nothing would fail: every write would still succeed, and the ledger would
-- stay empty. Money in, money out, nothing posted against it. That is the worst
-- shape a missing object can take -- not an error, an absence.
--
-- They also carry rules that are not obvious and are not written down anywhere
-- else, which is the second reason to record them rather than re-derive them:
--
--   · An UPDATE that changes nothing money-relevant leaves the ledger entry
--     alone. One that changes amount, method or date deletes and reposts, which
--     is what makes a CASH -> CREDIT switch withdraw the movement instead of
--     leaving a stale OUT behind.
--   · A soft delete removes the entry.
--   · post_sale_to_ledger distinguishes a COLLECTION -- paidAmount rising with
--     nothing else changed -- and posts only the delta, dated when the money
--     arrived rather than when the bill was written. Reposting the whole figure
--     is the bug that behaviour exists to prevent.
--   · post_purchase_to_ledger refuses to touch a bill whose siblings were
--     posted at the old bill grain, so the line-grain rewrite cannot
--     double-post an older bill.
--   · Every one of them is idempotent against the offline outbox replaying an
--     insert.
--
-- Bodies and triggers are production's own, read from pg_get_functiondef and
-- pg_get_triggerdef. CREATE OR REPLACE and DROP TRIGGER IF EXISTS, so applying
-- this where they already exist changes nothing.

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
BEGIN
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
      -- A COLLECTION: post only what just arrived, dated when it arrived.
      v_when := COALESCE(NULLIF(NEW."lastPaymentDate",'')::date, NEW.date::date, CURRENT_DATE);

      SELECT * INTO v_acc FROM accounts
       WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL
         AND type = CASE v_method WHEN 'CASH' THEN 'CASH'
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
      VALUES ('ATX-' || substr(md5(NEW.id || v_when::text || v_delta::text || now()::text), 1, 12),
              NEW.tenant_id, COALESCE(v_acc.linked_bank_account_id, v_acc.id),
              v_when, 'IN', v_delta, v_method, 'SALE', NEW.id, 'Collection on sale',
              NEW.location_id);
      RETURN NEW;
    END IF;

    DELETE FROM account_transactions
     WHERE ref_type='SALE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
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
  VALUES ('ATX-' || substr(md5(NEW.id || now()::text), 1, 12),
          NEW.tenant_id, COALESCE(v_acc.linked_bank_account_id, v_acc.id),
          COALESCE(NEW.date::date, CURRENT_DATE), 'IN', v_amount, v_method, 'SALE', NEW.id,
          CASE WHEN TG_OP='UPDATE' THEN 'POS sale (edited)' ELSE 'POS sale' END,
          NEW.location_id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.post_purchase_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type   text    := UPPER(COALESCE(NEW.payment_type, 'CASH'));
  v_credit boolean := v_type IN ('CREDIT', 'UDHAAR', 'POST-CAPITAL');
  v_amount numeric := COALESCE(NEW.total_amount, 0);
  v_want   text;
  v_acc    record;
  v_name   text;
BEGIN
  -- Legacy bill-grain posting anywhere in this bill: do not touch the bill.
  IF NEW.bill_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM account_transactions at
      JOIN purchases sib ON sib.id = at.ref_id
     WHERE at.ref_type = 'PURCHASE'
       AND at.tenant_id = NEW.tenant_id
       AND sib.bill_id  = NEW.bill_id
       AND abs(at.amount - CASE WHEN TG_OP = 'UPDATE' AND sib.id = NEW.id
                                THEN COALESCE(OLD.total_amount, 0)
                                ELSE COALESCE(sib.total_amount, 0) END) > 0.01
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Nothing money-relevant moved: leave the ledger untouched.
    IF NEW.deleted_at IS NULL
       AND COALESCE(OLD.total_amount, 0) = v_amount
       AND UPPER(COALESCE(OLD.payment_type, 'CASH')) = v_type
       AND OLD.date IS NOT DISTINCT FROM NEW.date THEN
      RETURN NEW;
    END IF;
    -- Otherwise restate from scratch. Deleting first is what makes a
    -- CASH -> CREDIT switch withdraw the money movement rather than leave a
    -- stale OUT behind.
    DELETE FROM account_transactions
     WHERE ref_type = 'PURCHASE' AND ref_id = NEW.id AND tenant_id = NEW.tenant_id;
  END IF;

  IF v_credit OR v_amount <= 0 OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotence: never post the same line twice.
  IF EXISTS (SELECT 1 FROM account_transactions
              WHERE ref_type = 'PURCHASE' AND ref_id = NEW.id AND tenant_id = NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  v_want := CASE v_type WHEN 'CASH' THEN 'CASH'
                        WHEN 'UPI'  THEN 'UPI'
                        ELSE 'BANK' END;

  SELECT * INTO v_acc FROM accounts
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type = v_want
   ORDER BY is_default DESC, created_at ASC LIMIT 1;
  IF v_acc IS NULL THEN
    SELECT * INTO v_acc FROM accounts
     WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type <> 'LOAN'
     ORDER BY is_default DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_acc IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_name FROM suppliers WHERE id = NEW.supplier_id;

  INSERT INTO account_transactions
    (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note)
  VALUES (
    'ATX-' || substr(md5(NEW.id || clock_timestamp()::text), 1, 12),
    NEW.tenant_id,
    -- A UPI account can be a face on a real bank account; the money lands there.
    COALESCE(v_acc.linked_bank_account_id, v_acc.id),
    COALESCE(NEW.date::date, CURRENT_DATE),
    'OUT', v_amount, v_type, 'PURCHASE', NEW.id,
    'Purchase · ' || COALESCE(v_name, 'supplier')
  );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.post_client_payment_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method  text := UPPER(COALESCE(NEW.payment_method, 'CASH'));
  v_want    text;
  v_acc     record;
  v_amount  numeric := COALESCE(NEW.amount, 0);
  v_client  text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Soft delete → remove the ledger entry.
    IF NEW.deleted_at IS NOT NULL THEN
      DELETE FROM account_transactions
       WHERE ref_type='PAYMENT' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
      RETURN NEW;
    END IF;
    -- Nothing money-relevant changed → leave the entry alone.
    IF COALESCE(OLD.amount,0) = v_amount
       AND UPPER(COALESCE(OLD.payment_method,'CASH')) = v_method
       AND COALESCE(OLD.date,'') = COALESCE(NEW.date,'') THEN
      RETURN NEW;
    END IF;
    -- Amount/method/date changed → drop the stale entry and repost below.
    DELETE FROM account_transactions
     WHERE ref_type='PAYMENT' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
  END IF;

  IF v_amount <= 0 THEN RETURN NEW; END IF;

  -- Idempotency for INSERT replays (offline outbox retries).
  IF EXISTS (SELECT 1 FROM account_transactions
             WHERE ref_type='PAYMENT' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  v_want := CASE v_method WHEN 'CASH' THEN 'CASH'
                          WHEN 'UPI'  THEN 'UPI'
                          ELSE 'BANK' END;

  SELECT * INTO v_acc FROM accounts
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type = v_want
   ORDER BY is_default DESC, created_at ASC LIMIT 1;
  IF v_acc IS NULL THEN
    SELECT * INTO v_acc FROM accounts
     WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type <> 'LOAN'
     ORDER BY is_default DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_acc IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_client FROM clients WHERE id = NEW.client_id;

  INSERT INTO account_transactions
    (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note)
  VALUES (
    'ATX-' || substr(md5(NEW.id || now()::text), 1, 12),
    NEW.tenant_id,
    COALESCE(v_acc.linked_bank_account_id, v_acc.id),
    COALESCE(NEW.date::date, CURRENT_DATE),
    'IN', v_amount, v_method, 'PAYMENT', NEW.id,
    'Receipt · ' || COALESCE(v_client, 'Client') || CASE WHEN TG_OP='UPDATE' THEN ' (edited)' ELSE '' END
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_supplier_payment_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method text := UPPER(COALESCE(NEW.payment_method, 'CASH'));
  v_want   text;
  v_acc    record;
  v_amount numeric := COALESCE(NEW.amount, 0);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      DELETE FROM account_transactions
       WHERE ref_type='SUPPLIER_PAYMENT' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
      RETURN NEW;
    END IF;
    IF COALESCE(OLD.amount,0) = v_amount
       AND UPPER(COALESCE(OLD.payment_method,'CASH')) = v_method
       AND OLD.date IS NOT DISTINCT FROM NEW.date THEN
      RETURN NEW;
    END IF;
    DELETE FROM account_transactions
     WHERE ref_type='SUPPLIER_PAYMENT' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
  END IF;

  IF v_amount <= 0 OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM account_transactions
             WHERE ref_type='SUPPLIER_PAYMENT' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  v_want := CASE v_method WHEN 'CASH' THEN 'CASH'
                          WHEN 'UPI'  THEN 'UPI'
                          ELSE 'BANK' END;

  SELECT * INTO v_acc FROM accounts
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type = v_want
   ORDER BY is_default DESC, created_at ASC LIMIT 1;
  IF v_acc IS NULL THEN
    SELECT * INTO v_acc FROM accounts
     WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type <> 'LOAN'
     ORDER BY is_default DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_acc IS NULL THEN RETURN NEW; END IF;

  INSERT INTO account_transactions
    (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note)
  VALUES (
    'ATX-' || substr(md5(NEW.id || now()::text), 1, 12),
    NEW.tenant_id,
    COALESCE(v_acc.linked_bank_account_id, v_acc.id),
    COALESCE(NEW.date, CURRENT_DATE),
    'OUT', v_amount, v_method, 'SUPPLIER_PAYMENT', NEW.id,
    COALESCE(NEW.note, 'Paid ' || COALESCE(NEW.supplier_name, 'supplier'))
  );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.post_expense_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method text := UPPER(COALESCE(NEW.payment_method, 'CASH'));
  v_want   text;
  v_acc    record;
  v_amount numeric := COALESCE(NEW.amount, 0);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      DELETE FROM account_transactions
       WHERE ref_type='EXPENSE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
      RETURN NEW;
    END IF;
    IF COALESCE(OLD.amount,0) = v_amount
       AND UPPER(COALESCE(OLD.payment_method,'CASH')) = v_method
       AND OLD.date IS NOT DISTINCT FROM NEW.date THEN
      RETURN NEW;
    END IF;
    DELETE FROM account_transactions
     WHERE ref_type='EXPENSE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id;
  END IF;

  IF v_amount <= 0 THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM account_transactions
             WHERE ref_type='EXPENSE' AND ref_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  v_want := CASE v_method WHEN 'CASH' THEN 'CASH'
                          WHEN 'UPI'  THEN 'UPI'
                          ELSE 'BANK' END;

  SELECT * INTO v_acc FROM accounts
   WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type = v_want
   ORDER BY is_default DESC, created_at ASC LIMIT 1;
  IF v_acc IS NULL THEN
    SELECT * INTO v_acc FROM accounts
     WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND type <> 'LOAN'
     ORDER BY is_default DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_acc IS NULL THEN RETURN NEW; END IF;

  INSERT INTO account_transactions
    (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note)
  VALUES (
    'ATX-' || substr(md5(NEW.id || now()::text), 1, 12),
    NEW.tenant_id,
    COALESCE(v_acc.linked_bank_account_id, v_acc.id),
    COALESCE(NULLIF(NEW.date, '')::date, CURRENT_DATE),
    'OUT', v_amount, v_method, 'EXPENSE', NEW.id,
    COALESCE(NEW.note, NEW.category, 'Expense')
  );
  RETURN NEW;
END $function$;

-- The triggers. A function with no trigger posts nothing, so these belong in
-- the same migration as the bodies, not in a later one.
DROP TRIGGER IF EXISTS trg_sales_post_ledger ON public.sales;
CREATE TRIGGER trg_sales_post_ledger AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION post_sale_to_ledger();

DROP TRIGGER IF EXISTS trg_purchases_post_ledger ON public.purchases;
CREATE TRIGGER trg_purchases_post_ledger AFTER INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION post_purchase_to_ledger();

DROP TRIGGER IF EXISTS trg_client_payments_post_ledger ON public.client_payments;
CREATE TRIGGER trg_client_payments_post_ledger AFTER INSERT OR UPDATE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION post_client_payment_to_ledger();

DROP TRIGGER IF EXISTS trg_supplier_payments_post_ledger ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_post_ledger AFTER INSERT OR UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION post_supplier_payment_to_ledger();

DROP TRIGGER IF EXISTS trg_expenses_post_ledger ON public.expenses;
CREATE TRIGGER trg_expenses_post_ledger AFTER INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION post_expense_to_ledger();
