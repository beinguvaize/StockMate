-- HASSAN KOUSER SIVAKASI has held an unused Rs 2,390 advance since 29 Jun
-- (SUPP-MR0IJWLF-1) while carrying Rs 8,200 of open bills from 17-25 Jul. Now
-- that apply_supplier_advances exists, spend it.
--
-- No money moves: the Rs 2,390 already left the bank on 29 June and its cash
-- entry stands untouched. This records which bills it paid.

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.hassan_advance_20260802 AS
SELECT 'payment' AS kind, id, amount::text AS amt, purchase_id, deleted_at::text AS del
FROM public.supplier_payments
WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
  AND supplier_id = (SELECT id FROM public.suppliers
                     WHERE tenant_id='fd4927bf-c084-4bed-ba13-d30e650da6f3'
                       AND name ILIKE 'HASSAN KOUSER%' LIMIT 1)
UNION ALL
SELECT 'purchase', id, total_amount::text, paid_amount::text, NULL
FROM public.purchases
WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3' AND deleted_at IS NULL
  AND supplier_name ILIKE 'HASSAN KOUSER%';

DO $$
DECLARE v_sup text; v_adv numeric; v_due numeric; v_applied numeric;
BEGIN
  SELECT id INTO v_sup FROM public.suppliers
   WHERE tenant_id='fd4927bf-c084-4bed-ba13-d30e650da6f3'
     AND name ILIKE 'HASSAN KOUSER%' LIMIT 1;

  SELECT COALESCE(sum(amount),0) INTO v_adv FROM public.supplier_payments
   WHERE tenant_id='fd4927bf-c084-4bed-ba13-d30e650da6f3' AND supplier_id=v_sup
     AND purchase_id IS NULL AND deleted_at IS NULL;

  SELECT COALESCE(sum(GREATEST(total_amount-COALESCE(paid_amount,0),0)),0) INTO v_due
    FROM public.purchases
   WHERE tenant_id='fd4927bf-c084-4bed-ba13-d30e650da6f3' AND supplier_id=v_sup
     AND deleted_at IS NULL;

  IF round(v_adv) <> 2390 OR round(v_due) <> 8200 THEN
    RAISE EXCEPTION 'Expected Rs 2,390 on account against Rs 8,200 due; found % and % - aborting',
      round(v_adv), round(v_due);
  END IF;

  v_applied := public.apply_supplier_advances('fd4927bf-c084-4bed-ba13-d30e650da6f3', v_sup);

  IF round(v_applied) <> 2390 THEN
    RAISE EXCEPTION 'Applied % rather than the full Rs 2,390 - aborting', round(v_applied);
  END IF;

  RAISE NOTICE 'HASSAN: Rs % applied, bills now Rs % due', round(v_applied), round(v_due - v_applied);
END $$;
