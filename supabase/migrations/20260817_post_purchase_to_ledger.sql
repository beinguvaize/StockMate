-- Applied to prod 17 Aug 2026 (project lmviftlynuhopzmvaxeu).
--
-- A non-credit purchase is money leaving the till, so it belongs in Cash & Bank.
-- Until now the only thing that posted it was a client-side addTxn in the web
-- Add-purchase modal, wrapped in `catch {}`: a failed post was silent, an edited
-- bill never moved the cash, and no other writer posted at all. Mirrors
-- post_supplier_payment_to_ledger deliberately.
--
-- Grain is the purchase LINE (ref_id = purchases.id), not the bill. That is what
-- makes an edit reconcilable: the entry to correct is found by id rather than by
-- matching an amount and a date.
--
-- The old client code posted at BILL grain, with the bill's total against ONE
-- line. Every entry this trigger writes has amount = that line's total_amount,
-- by construction, so an entry that disagrees with its own line's amount marks a
-- bill recorded in the old shape -- leave all of it alone. Detecting that by
-- amount rather than by which line holds the entry matters: an earlier version
-- checked only OTHER lines, so editing the line carrying the entry restated a
-- 7,000 bill down to 3,300. A single-line bill is where the two shapes coincide
-- exactly, and there it is right that they cannot be told apart.
--
-- Companion change: the client-side addTxn in src/pages/purchases/index.jsx is
-- removed in the same commit. Re-adding it would double every purchase.
--
-- Does NOT backfill. 27 bills / 450,869 between 8 May and 10 Jul are unposted.

CREATE OR REPLACE FUNCTION post_purchase_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_purchases_post_ledger ON purchases;
CREATE TRIGGER trg_purchases_post_ledger
AFTER INSERT OR UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION post_purchase_to_ledger();
