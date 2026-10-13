-- Moving stock from one place to another
-- ============================================================================
--
-- useInventory.js has called `transfer_inventory_atomic` since it was written.
-- That function does not exist: not in production, not in dev, not in any
-- migration in this repo. Anything that reached it would have failed with
-- PGRST202, and nothing ever has, because no screen calls transferStock. A
-- shop with two stores has had no way to move stock between them.
--
-- WHY THIS CANNOT BE TWO UPDATES FROM A BROWSER
--
-- A transfer is a decrement and an increment that must both happen or neither:
-- a client that managed the first and lost the network has destroyed stock. It
-- also has to move the COST with the quantity, or the receiving store sells
-- goods it has no batch for and the margin is computed from a fallback price.
--
-- So it is one function, in one transaction, and it moves batches rather than
-- just numbers.
--
-- IT DOES NOT TOUCH COST BATCHES, and that is a finding rather than a
-- shortcut. The first version of this moved batches too, so the receiving
-- store would "own" the cost of what it received. Then the data was checked:
--
--   · production holds 131 live batches and ZERO of them are location-stamped
--     (warehouse_id is null on every one);
--   · consume_fifo does not filter by warehouse at all -- it consumes a
--     product's batches wherever they are.
--
-- Cost in this system is per PRODUCT, not per location. So the cost already
-- follows the goods with no help, and splitting batches per location would
-- have written a dimension nothing reads, half-populated, for the next person
-- to misinterpret. A transfer therefore moves quantity and records that it
-- happened. The frozen COGS rule (batch FIFO, costPrice fallback) is untouched
-- in both senses: unchanged, and unneeded here.

CREATE OR REPLACE FUNCTION public.transfer_inventory_atomic(
  p_product_id        text,
  p_from_location_id  uuid,
  p_to_location_id    uuid,
  p_qty               numeric,
  p_tenant_id         uuid,
  p_user_id           text DEFAULT NULL,
  p_note              text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_available numeric;
  v_name      text;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'TRANSFER_INVALID: quantity must be more than zero';
  END IF;
  IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_INVALID: both a source and a destination are needed';
  END IF;
  IF p_from_location_id = p_to_location_id THEN
    RAISE EXCEPTION 'TRANSFER_INVALID: the source and destination are the same place';
  END IF;

  SELECT name INTO v_name FROM public.products
   WHERE id = p_product_id AND tenant_id = p_tenant_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_INVALID: that product is not in this shop';
  END IF;

  -- Lock the source row for the whole transaction: two tills transferring the
  -- same product at once would otherwise both read the same balance and both
  -- decide there was enough.
  --
  -- `deleted_at IS NULL` is not decoration: inventory_balances is soft-deleted,
  -- and a soft-deleted row still holds its last quantity. Reading it as
  -- available would let a transfer move stock out of a balance the rest of the
  -- app has already stopped showing. No row and a deleted row both mean zero,
  -- which TRANSFER_SHORT then refuses.
  SELECT COALESCE(quantity, 0) INTO v_available
    FROM public.inventory_balances
   WHERE tenant_id = p_tenant_id AND location_id = p_from_location_id AND product_id = p_product_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF COALESCE(v_available, 0) < p_qty THEN
    -- Always refused, regardless of the shop's negative-stock setting: that
    -- setting is about selling, and a transfer that overdraws one store to
    -- fill another has not moved goods, it has invented them in two places.
    RAISE EXCEPTION 'TRANSFER_SHORT: % has % at the source and this moves %',
      v_name, ROUND(COALESCE(v_available, 0)::numeric, 2), ROUND(p_qty::numeric, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the quantity, which is the whole of the job ─────────────────────────
  UPDATE public.inventory_balances
     SET quantity = COALESCE(quantity, 0) - p_qty, updated_at = NOW()
   WHERE tenant_id = p_tenant_id AND location_id = p_from_location_id AND product_id = p_product_id
     AND deleted_at IS NULL;

  -- The destination row is un-deleted as it is written to. Stock has physically
  -- arrived there; leaving deleted_at set would put it in a row the app filters
  -- out, so the goods would be in the table and missing from every screen.
  INSERT INTO public.inventory_balances (id, tenant_id, location_id, product_id, quantity)
  VALUES (gen_random_uuid(), p_tenant_id, p_to_location_id, p_product_id, p_qty)
  ON CONFLICT (location_id, product_id, tenant_id)
  DO UPDATE SET quantity = CASE WHEN public.inventory_balances.deleted_at IS NULL
                                THEN COALESCE(public.inventory_balances.quantity, 0) + p_qty
                                ELSE p_qty END,
                deleted_at = NULL,
                updated_at = NOW();

  -- ── the record ───────────────────────────────────────────────────────────
  INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id, warehouse_id)
  VALUES (gen_random_uuid()::text, to_char(CURRENT_DATE, 'YYYY-MM-DD'), p_product_id, v_name,
          'OUT', p_qty, COALESCE(p_note, 'Transfer out'), p_user_id, p_tenant_id, p_from_location_id::text);

  INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id, warehouse_id)
  VALUES (gen_random_uuid()::text, to_char(CURRENT_DATE, 'YYYY-MM-DD'), p_product_id, v_name,
          'IN', p_qty, COALESCE(p_note, 'Transfer in'), p_user_id, p_tenant_id, p_to_location_id::text);
END
$fn$;

REVOKE ALL ON FUNCTION public.transfer_inventory_atomic(text, uuid, uuid, numeric, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_inventory_atomic(text, uuid, uuid, numeric, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_atomic(text, uuid, uuid, numeric, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_atomic(text, uuid, uuid, numeric, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.transfer_inventory_atomic IS
  'Move stock between two locations in one transaction: the two balances and a '
  'movement_log row at each end. Cost batches are untouched on purpose -- they are not '
  'location-scoped in this system and consume_fifo ignores warehouse_id, so the cost '
  'follows the product already. Refuses to overdraw the source whatever the shop''s '
  'negative-stock setting says: a transfer that overdraws has not moved goods, it has '
  'invented them in two places.';
