-- Keep a purchase's FIFO batch in step with the purchase row after an edit.
--
-- process_purchase() writes the batch once, at insert. Nothing ever wrote it
-- again, so editing a purchase updated the purchases row while the batch kept
-- its original quantity, date, supplier — and, worst of all, its original
-- PRODUCT. Those columns are what the Stock Details pane renders, which is why
-- a corrected purchase never appeared there, and why FIFO went on costing
-- against a lot that no longer matched the bill.
--
-- Two live faults this was written for:
--   * PUR-GFEB72 carried quantity 3750 while its batch still held 120.
--   * PUR-E6PRCT was re-linked from "10*13 Cover PKT" to "13*16 Pkt Cover".
--     The row moved; the 750-unit, Rs 6,750 lot did not. For a month the wrong
--     product carried the stock and a 29.6% inflated weighted-average cost.
--
-- Scope note — what this deliberately does NOT do:
--   * It does not apply the quantity delta to stock. The caller's adjustStock()
--     already does, and doing it here as well would double-count.
--   * It does not touch unit_cost. recost_purchase_batches() owns that, and
--     also retro-corrects COGS on units already sold. Two writers would fight.
--   * It never writes products.stock directly. A trigger on inventory_balances
--     (trg_sync_product_stock) re-derives products.stock as the sum of its
--     location rows, so a direct write is silently overwritten. Move the
--     balance and let the trigger do its job.
--
-- Idempotent: running it twice is a no-op the second time.

CREATE OR REPLACE FUNCTION public.resync_purchase_batch(
  p_purchase_id text,
  p_tenant_id   uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     uuid;
  v_qty        numeric;
  v_date       date;
  v_supplier   text;
  v_product    text;      -- the product the purchase now names
  v_batch_id   uuid;
  v_batches    int;
  v_old_prod   text;      -- the product the batch is currently on
  v_received   numeric;
  v_remaining  numeric;
  v_consumed   numeric;
  v_loc        uuid;
  v_sold       int;
BEGIN
  IF NOT (is_global_admin() OR p_tenant_id = current_tenant_id()) THEN
    RAISE EXCEPTION 'Not authorised for tenant %', p_tenant_id;
  END IF;

  SELECT tenant_id, quantity, date::date, supplier_id, linked_product_id
    INTO v_tenant, v_qty, v_date, v_supplier, v_product
  FROM public.purchases
  WHERE id = p_purchase_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Purchase % not found for tenant %', p_purchase_id, p_tenant_id;
  END IF;

  -- A purchase can legitimately carry a second, dated lot when an expiry was
  -- entered on the line. Guessing which one to resize would be worse than
  -- stopping, so stop and let a human decide.
  SELECT count(*) INTO v_batches
  FROM public.product_batches
  WHERE purchase_id = p_purchase_id AND tenant_id = p_tenant_id;

  IF v_batches = 0 THEN
    RETURN;                       -- nothing was ever costed against this purchase
  ELSIF v_batches > 1 THEN
    RAISE EXCEPTION 'Purchase % has % batches; resync needs exactly one',
      p_purchase_id, v_batches;
  END IF;

  SELECT id, product_id, qty_received, qty_remaining, warehouse_id
    INTO v_batch_id, v_old_prod, v_received, v_remaining, v_loc
  FROM public.product_batches
  WHERE purchase_id = p_purchase_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  v_consumed := v_received - v_remaining;

  -- ── 1. Product change ─────────────────────────────────────────────────────
  -- Move the whole lot, and its stock, to the product the purchase now names.
  -- Done first and at the batch's CURRENT size, so the caller's adjustStock()
  -- can then apply the quantity delta to the new product and the two compose:
  --   old product  -= original qty
  --   new product  += original qty, then += delta  ->  new qty
  IF v_old_prod IS DISTINCT FROM v_product THEN

    -- Refuse once any of the lot has been sold. sale_batch_consumption holds a
    -- cost snapshot per sale; moving the lot underneath those rows would
    -- silently rewrite historical COGS and the margin already reported on
    -- closed periods. That repair is a deliberate, separate job.
    SELECT count(*) INTO v_sold
    FROM public.sale_batch_consumption WHERE batch_id = v_batch_id;

    IF v_sold > 0 OR v_consumed <> 0 THEN
      RAISE EXCEPTION
        'Cannot move batch for % to a different product: % units already sold from it (% consumption rows). Correct the sales first.',
        p_purchase_id, v_consumed, v_sold;
    END IF;

    -- Where the stock physically sits. process_purchase defaults to the first
    -- WAREHOUSE when the line carried no location; mirror that.
    IF v_loc IS NULL THEN
      SELECT id INTO v_loc FROM public.inventory_locations
      WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE' LIMIT 1;
    END IF;

    IF v_loc IS NULL THEN
      RAISE EXCEPTION 'No warehouse location for tenant %; cannot move stock', p_tenant_id;
    END IF;

    UPDATE public.product_batches SET product_id = v_product WHERE id = v_batch_id;

    -- Keep the vestigial column in step. It is the one the edit handler never
    -- wrote, which is how the two references drifted apart in the first place.
    UPDATE public.purchases SET product_id = v_product WHERE id = p_purchase_id;

    UPDATE public.inventory_balances
       SET quantity = quantity - v_remaining
     WHERE product_id = v_old_prod AND location_id = v_loc;

    INSERT INTO public.inventory_balances (id, tenant_id, product_id, location_id, quantity)
    VALUES (gen_random_uuid(), p_tenant_id, v_product, v_loc, v_remaining)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = public.inventory_balances.quantity + EXCLUDED.quantity;

    -- Auditable, so the stock reads as a transfer rather than appearing from
    -- nowhere on one product and vanishing from the other.
    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, tenant_id, batch_id)
    SELECT gen_random_uuid()::text, CURRENT_DATE, v_old_prod,
           (SELECT name FROM public.products WHERE id = v_old_prod),
           'OUT', v_remaining,
           'Purchase ' || p_purchase_id || ' re-linked: batch moved out',
           p_tenant_id, v_batch_id
    UNION ALL
    SELECT gen_random_uuid()::text, CURRENT_DATE, v_product,
           (SELECT name FROM public.products WHERE id = v_product),
           'IN', v_remaining,
           'Purchase ' || p_purchase_id || ' re-linked: batch moved in',
           p_tenant_id, v_batch_id;

    PERFORM public.recompute_product_cost(p_tenant_id, v_old_prod);
  END IF;

  -- ── 2. Quantity, date and supplier ────────────────────────────────────────
  -- The batch's own CHECK forbids a zero or negative lot; catch it here so the
  -- caller gets a sentence rather than a constraint name.
  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Purchase % has quantity %; a batch must hold more than zero',
      p_purchase_id, v_qty;
  END IF;

  -- Shrinking a lot below what has already been sold out of it would leave
  -- sale_batch_consumption pointing at units that no longer exist. Refuse: the
  -- real fix is to void or amend the sales first.
  IF v_qty < v_consumed THEN
    RAISE EXCEPTION
      'Cannot resize batch for % to %: % units have already been consumed from it',
      p_purchase_id, v_qty, v_consumed;
  END IF;

  UPDATE public.product_batches
     SET qty_received  = v_qty,
         qty_remaining = v_qty - v_consumed,
         received_date = COALESCE(v_date, received_date),
         supplier_id   = v_supplier
   WHERE id = v_batch_id;

  -- Weighted-average cost is derived from remaining open batches, so a changed
  -- lot size moves it even though no unit_cost changed here.
  PERFORM public.recompute_product_cost(p_tenant_id, v_product);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resync_purchase_batch(text, uuid) TO authenticated;
