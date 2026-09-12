-- Edit a purchase in one transaction.
--
-- The client used to make five sequential calls: update the row, recost the
-- batches, resync the batch, adjust stock, reconcile the money. Each could
-- fail on its own with a 10s timeout, and a failure at step three left the row
-- already changed — a half-applied edit where the bill and the stock lot
-- disagreed, reported through a notification and fixed only by saving again.
--
-- Here every step is one transaction. Any exception rolls back the lot, so an
-- edit either lands completely or not at all.
--
-- Reads the pre-edit values itself rather than taking them as arguments. The
-- client was passing a snapshot captured before its first call, which was
-- correct but fragile — it only held while nothing else touched the row.
--
-- Order is deliberate and load-bearing:
--   1. capture old values
--   2. update the row
--   3. recost      - batch cost, the snapshot on sold units, sales.totalCogs,
--                    and the product's weighted average
--   4. resync      - moves the batch's product (with its stock), then its
--                    quantity, date and supplier. Runs at the lot's ORIGINAL
--                    size so step 5 can apply the delta on top
--   5. stock delta - on the NEW product
--   6. money       - cash ledger and supplier payable

CREATE OR REPLACE FUNCTION public.edit_purchase(
  p_purchase_id  text,
  p_tenant_id    uuid,
  p_product_id   text,
  p_supplier_id  text,
  p_quantity     numeric,
  p_total_amount numeric,
  p_unit_cost    numeric,
  p_payment_type text,
  p_date         text,
  p_notes        text,
  p_user_id      text,
  p_account_id   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_total    numeric;
  v_old_type     text;
  v_old_supplier text;
  v_old_qty      numeric;
  v_old_product  text;
  v_old_date     date;
  v_supplier_nm  text;
  v_qty_delta    numeric;
  v_loc          uuid;
BEGIN
  IF NOT (is_global_admin() OR p_tenant_id = current_tenant_id()) THEN
    RAISE EXCEPTION 'Not authorised for tenant %', p_tenant_id;
  END IF;

  SELECT total_amount, payment_type, supplier_id, quantity, linked_product_id, date::date
    INTO v_old_total, v_old_type, v_old_supplier, v_old_qty, v_old_product, v_old_date
  FROM public.purchases
  WHERE id = p_purchase_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_old_total IS NULL THEN
    RAISE EXCEPTION 'Purchase % not found for tenant %', p_purchase_id, p_tenant_id;
  END IF;

  v_qty_delta := COALESCE(p_quantity,0) - COALESCE(v_old_qty,0);

  SELECT name INTO v_supplier_nm
  FROM public.suppliers WHERE id = p_supplier_id AND tenant_id = p_tenant_id;

  UPDATE public.purchases
     SET linked_product_id = p_product_id,
         supplier_id       = p_supplier_id,
         supplier_name     = COALESCE(v_supplier_nm, supplier_name),
         quantity          = p_quantity,
         total_amount      = p_total_amount,
         payment_type      = p_payment_type,
         date              = p_date,
         notes             = p_notes
   WHERE id = p_purchase_id AND tenant_id = p_tenant_id;

  IF COALESCE(p_unit_cost,0) > 0 THEN
    PERFORM public.recost_purchase_batches(p_purchase_id, p_unit_cost, p_tenant_id);
  END IF;

  IF p_product_id IS DISTINCT FROM v_old_product
     OR v_qty_delta <> 0
     OR p_date::date IS DISTINCT FROM v_old_date
     OR p_supplier_id IS DISTINCT FROM v_old_supplier THEN
    PERFORM public.resync_purchase_batch(p_purchase_id, p_tenant_id);
  END IF;

  IF v_qty_delta <> 0 AND p_product_id IS NOT NULL THEN
    SELECT id INTO v_loc FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE' LIMIT 1;

    IF v_loc IS NOT NULL THEN
      PERFORM public.adjust_inventory_atomic(
        p_product_id, v_loc, v_qty_delta,
        'Purchase edit: ' || p_purchase_id, p_user_id, p_tenant_id);
    END IF;
  END IF;

  PERFORM public.reconcile_purchase_money(
    p_purchase_id, p_tenant_id, v_old_total, v_old_type, v_old_supplier, p_account_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_purchase(
  text, uuid, text, text, numeric, numeric, numeric, text, text, text, text, text
) TO authenticated;
