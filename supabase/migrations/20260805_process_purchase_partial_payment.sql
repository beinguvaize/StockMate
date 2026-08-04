-- A purchase could only be fully paid or fully on credit. paid_amount was
-- decided by the payment type alone:
--
--   CASE WHEN payment_type IN ('CREDIT','UDHAAR','POST-CAPITAL')
--        THEN 0 ELSE p_total_amount END
--
-- There was no way to record "paid Rs 5,000 now, rest on credit" at the time
-- the bill is entered, which is how a lot of these are actually settled.
--
-- Adds p_paid_amount. When supplied it wins, clamped to [0, total]; when NULL
-- the old rule applies untouched, so every existing caller behaves exactly as
-- before. Both callers -- web usePurchases and mobile purchases_screen -- pass
-- named parameters, so omitting the new one resolves fine.
--
-- suppliers.balance is generalised with it. It used to add the whole total for
-- a credit bill and nothing otherwise; it now adds whatever is left unpaid,
-- which reduces to the old behaviour at both extremes and is the only correct
-- answer in between.
--
-- Patched from the live definition rather than retyped, because that body has
-- been amended before (20260731_cash_purchase_marks_bill_paid) and rewriting it
-- from memory would silently drop those changes. Aborts if either pattern is
-- missing.

DO $mig$
DECLARE
  v_def       text;
  v_new       text;
  v_paid_expr text;
  v_old_paid  text;
  v_old_bal   text;
  v_new_bal   text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'process_purchase'
    AND pg_get_function_identity_arguments(p.oid) LIKE '%p_bill_no text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'process_purchase(12 args) not found - aborting';
  END IF;

  -- What the bill has been paid, under the new rule.
  v_paid_expr := $x$CASE WHEN p_paid_amount IS NOT NULL THEN GREATEST(0, LEAST(p_paid_amount, p_total_amount)) WHEN UPPER(COALESCE(p_payment_type, '')) IN ('CREDIT', 'UDHAAR', 'POST-CAPITAL') THEN 0 ELSE p_total_amount END$x$;

  v_old_paid := $x$CASE WHEN UPPER(COALESCE(p_payment_type, '')) IN ('CREDIT', 'UDHAAR', 'POST-CAPITAL') THEN 0 ELSE p_total_amount END$x$;

  IF position(v_old_paid in v_def) = 0 THEN
    RAISE EXCEPTION 'paid_amount expression not found - definition changed, aborting';
  END IF;

  v_old_bal := $x$  IF UPPER(COALESCE(p_payment_type, '')) IN ('CREDIT', 'UDHAAR', 'POST-CAPITAL') THEN
    UPDATE public.suppliers
       SET balance = COALESCE(balance, 0) + p_total_amount
     WHERE id = p_supplier_id
       AND tenant_id = v_tenant_id;
  END IF;$x$;

  IF position(v_old_bal in v_def) = 0 THEN
    RAISE EXCEPTION 'supplier balance block not found - definition changed, aborting';
  END IF;

  v_new_bal :=
    '  IF (p_total_amount - (' || v_paid_expr || ')) > 0 THEN' || E'\n' ||
    '    UPDATE public.suppliers' || E'\n' ||
    '       SET balance = COALESCE(balance, 0) + (p_total_amount - (' || v_paid_expr || '))' || E'\n' ||
    '     WHERE id = p_supplier_id' || E'\n' ||
    '       AND tenant_id = v_tenant_id;' || E'\n' ||
    '  END IF;';

  v_new := v_def;
  -- 1. take the new parameter
  v_new := replace(v_new, 'p_bill_no text DEFAULT NULL::text)',
                          'p_bill_no text DEFAULT NULL::text, p_paid_amount numeric DEFAULT NULL::numeric)');
  -- 2. honour it when storing what was paid
  v_new := replace(v_new, v_old_paid, v_paid_expr);
  -- 3. and when moving the supplier's balance
  v_new := replace(v_new, v_old_bal, v_new_bal);

  IF v_new = v_def THEN
    RAISE EXCEPTION 'patch produced no change - aborting';
  END IF;

  EXECUTE v_new;
END $mig$;

-- Drop the old signature. Leaving both would make every call that omits
-- p_paid_amount ambiguous: "function process_purchase(...) is not unique".
DROP FUNCTION IF EXISTS public.process_purchase(
  text, text, numeric, numeric, text, text, text, text, text, uuid, uuid, text);

DO $chk$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'process_purchase';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one process_purchase, found % - overloads break every caller', v_n;
  END IF;
END $chk$;
