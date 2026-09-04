-- DATA REPAIR. Applied once. Snapshot: snap.sajjad_duplicate_payment_20260801.
--
-- PUR-JGBHRX (SAJJAD ALAMCODU, 24 Jul, Rs 6,900 on CREDIT) carried two payment
-- rows of Rs 6,900 written NINE SECONDS apart on 27 Jul — a double submit. Only
-- one cash row exists for that day, and the shop confirms only Rs 6,900 left the
-- till, so the second row was never money: it just inflated paid_amount to
-- 13,800 on a 6,900 bill.
--
-- The later row is removed; the first is the genuine entry. supplier_payments
-- has no trigger maintaining purchases.paid_amount, so it is corrected
-- explicitly rather than left to a cascade that does not exist.
--
-- Result: the bill is settled exactly (6,900 of 6,900) and no purchase in any
-- tenant is overpaid any more.
--
-- STILL UNEXPLAINED, deliberately untouched: a Rs 6,900 cash row dated 24 Jul
-- 14:06, noted "Purchase · SAJJAD ALAMCODU", with ref_id NULL. It is not this
-- bill's settlement (that is the 27 Jul row) and it matches no CASH purchase —
-- the other 24 Jul cash row, Rs 3,360, matches PUR-KQMKHD. Either money left
-- the drawer for a credit bill it was never applied to, or the row is spurious.
-- The shop has to say which before anything is done with it.

DO $mig$
DECLARE v_dup text;
BEGIN
  SELECT id INTO v_dup FROM public.supplier_payments
   WHERE purchase_id = 'PUR-JGBHRX' ORDER BY created_at DESC LIMIT 1;

  IF v_dup IS NULL THEN
    RAISE EXCEPTION 'expected a payment row on PUR-JGBHRX to remove';
  END IF;

  DELETE FROM public.supplier_payments WHERE id = v_dup;

  UPDATE public.purchases
     SET paid_amount = 6900
   WHERE id = 'PUR-JGBHRX'
     AND tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3';
END $mig$;
