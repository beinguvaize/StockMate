-- A cash or bank purchase now marks its own bill paid.
--
-- process_purchase never set paid_amount — only the "Record payment" flow did.
-- So a bill settled at the counter took money out of the drawer and still sat in
-- Payable at its full value, permanently. On FUTURE DISPO:
--
--   CASH     94 bills  Rs 4,52,427 billed  Rs 0 marked paid
--   BANK     19 bills  Rs 1,70,984 billed  Rs 0 marked paid
--   CREDIT   18 bills  Rs 1,82,510 billed  Rs 1,44,350 paid  -> Rs 45,060 owed
--
-- The Suppliers screen reported Rs 6,68,471 owed. Real credit exposure was
-- Rs 45,060 — about 93% of "Payable" was bills already paid. That is what the
-- shop meant by the supplier figures being completely wrong.
--
-- DayBook already treated cash and bank purchases as paid: it sums total_amount
-- for them and its own comment notes "no supplier_payment row for them". This
-- makes the stored data agree with what the rest of the app already assumed.
--
-- Deliberately does NOT post to account_transactions. The purchase forms post
-- the money-out row themselves; adding one here would take the same cash twice.
--
-- Applied as a patch of the live definition rather than a retype, so the
-- parameter defaults and SET search_path survive untouched — retyping them
-- dropped the defaults and Postgres refused the replacement outright.
--
-- Verified on Demo, rolled back: a CASH bill records 500/500, a CREDIT bill
-- 700/0.
--
-- FORWARD FIX ONLY. The 113 existing cash and bank bills still read as unpaid;
-- correcting those is a separate data decision, and so is whether purchases
-- made before 3 Jul (which posted no account_transactions row at all) should be
-- back-posted to the cash account.

DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'process_purchase';

  v_new := replace(v_def,
    'supplier_id, supplier_name, payment_type, notes, quantity, tenant_id, status, bill_no',
    'supplier_id, supplier_name, payment_type, notes, quantity, tenant_id, status, bill_no, paid_amount');
  v_new := replace(v_new,
    'p_supplier_id, v_supplier_name, p_payment_type, p_notes, p_quantity, v_tenant_id, ''RECEIVED'', p_bill_no',
    'p_supplier_id, v_supplier_name, p_payment_type, p_notes, p_quantity, v_tenant_id, ''RECEIVED'', p_bill_no,'
    || ' CASE WHEN UPPER(COALESCE(p_payment_type, '''')) IN (''CREDIT'', ''UDHAAR'', ''POST-CAPITAL'')'
    || ' THEN 0 ELSE p_total_amount END');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'process_purchase did not match the expected INSERT — refusing to patch blindly';
  END IF;
  EXECUTE v_new;
END $mig$;

-- Dev carried an older process_purchase with no p_bill_no parameter, so the
-- patch above found nothing to replace and correctly refused rather than
-- guessing. Dev was brought to prod's definition instead — and because the two
-- signatures differ by one argument, CREATE OR REPLACE created a SECOND
-- overload rather than replacing. Both had to exist momentarily; the stale one
-- is dropped so an 11-argument call cannot become ambiguous.
--
-- Included here so the same drift is handled if this is ever replayed onto an
-- environment that is behind.
DROP FUNCTION IF EXISTS public.process_purchase(
  text, text, numeric, numeric, text, text, text, text, text, uuid, uuid);
