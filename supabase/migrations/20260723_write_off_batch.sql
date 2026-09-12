-- Write off a batch's remaining stock and book the loss.
--
-- Expiry never changes stock on its own — that must be deliberate, because it
-- removes inventory value and has to be matched by a loss in the P&L. This is
-- that act, invoked from Expiry Tracking, never automatically.
--
-- One transaction: remove the remaining qty from inventory (balance drop +
-- movement_log OUT, so the stock trigger re-derives products.stock), zero the
-- batch, and post the cost as a non-cash expense ('Inventory Write-off',
-- payment_method 'ADJUSTMENT' so it books the P&L loss without touching the
-- cash drawer — DayBook counts only CASH expenses against physical cash).
--
-- Does NOT touch consume_fifo, sale_batch_consumption or booked COGS — this is
-- unsold stock leaving inventory, separate from the cost of what sold.

CREATE OR REPLACE FUNCTION public.write_off_batch(
  p_batch_id text,
  p_tenant_id uuid,
  p_reason text DEFAULT 'Expiry write-off'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product text; v_qty numeric; v_cost numeric; v_loc uuid; v_name text; v_loss numeric;
BEGIN
  IF NOT (is_global_admin() OR p_tenant_id = current_tenant_id()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT product_id, qty_remaining, unit_cost, warehouse_id
    INTO v_product, v_qty, v_cost, v_loc
  FROM public.product_batches
  WHERE id = p_batch_id::uuid AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Batch % not found for tenant %', p_batch_id, p_tenant_id;
  END IF;
  IF COALESCE(v_qty,0) <= 0 THEN
    RETURN jsonb_build_object('written_off', 0, 'loss', 0, 'note', 'nothing remaining');
  END IF;

  IF v_loc IS NULL THEN
    SELECT id INTO v_loc FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE' LIMIT 1;
  END IF;

  SELECT name INTO v_name FROM public.products WHERE id = v_product;
  v_loss := ROUND(v_qty * COALESCE(v_cost,0), 2);

  IF v_loc IS NOT NULL THEN
    UPDATE public.inventory_balances
       SET quantity = quantity - v_qty
     WHERE product_id = v_product AND location_id = v_loc AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.product_batches SET qty_remaining = 0 WHERE id = p_batch_id::uuid;

  INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, tenant_id, batch_id)
  VALUES (gen_random_uuid()::text, CURRENT_DATE, v_product, v_name, 'OUT', v_qty,
          p_reason || ' (batch ' || p_batch_id || ')', p_tenant_id, p_batch_id::uuid);

  IF v_loss > 0 THEN
    INSERT INTO public.expenses (id, tenant_id, category, amount, date, payment_method, note, gst_amount)
    VALUES (gen_random_uuid()::text, p_tenant_id, 'Inventory Write-off', v_loss,
            to_char(CURRENT_DATE,'YYYY-MM-DD'), 'ADJUSTMENT',
            p_reason || ' — ' || COALESCE(v_name,'item') || ' x' || v_qty, 0);
  END IF;

  PERFORM public.recompute_product_cost(p_tenant_id, v_product);

  RETURN jsonb_build_object('written_off', v_qty, 'loss', v_loss, 'product', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_off_batch(text, uuid, text) TO authenticated;
