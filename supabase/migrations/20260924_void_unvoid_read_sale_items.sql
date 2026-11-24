-- Phase 5a: voiding and un-voiding read sale_items, not the blob.
--
-- Both walked jsonb_array_elements(sales.items) pulling (id, quantity, name)
-- to put stock back and write the movement log. sale_items holds all three as
-- columns, and product_name is the SNAPSHOT taken when the bill was issued --
-- so the movement log now records the name the customer saw, even if the
-- product has since been renamed.
--
-- Equivalence proven first, across every live sale: 4,354 (sale, product,
-- name) groups on each side, 0 present on only one side, 0 quantity
-- mismatches.
--
-- THE DEFAULTS ARE PART OF THE SIGNATURE. A first attempt omitted them and
-- Postgres refused -- "cannot remove parameter defaults from existing
-- function". Dropping and recreating would have been the wrong fix: that is
-- exactly how a second overload appears and every caller starts failing with
-- PGRST203. They are reproduced verbatim. Verified after applying: one
-- signature each.
--
-- ONE BEHAVIOUR DIFFERENCE, an improvement. The blob's `id` was used directly
-- as a product id, so a line whose product had since been deleted would still
-- try to write an inventory balance for it. sale_items resolves the FK at
-- write time and holds NULL for a missing product, so those lines skip the
-- inventory write and still record the movement. movement_log.product_id is
-- nullable with no FK, so that record is legal. No production line is
-- affected: 0 of 4,390 sale_items rows have a null product_id.
--
-- ── AND A LATENT BUG, FOUND BY TESTING THE ROUND TRIP ──────────────────────
--
-- void_sale sets status = 'VOIDED'. unvoid_sale cleared voided_at,
-- void_reason and paymentStatus -- but NOT status. Every ledger reader tests
-- status, so an un-voided sale had its stock and its payment restored while
-- the general ledger went on excluding it. The sale came back to life
-- everywhere except the books.
--
-- Latent, not active: no production sale is currently in that state, because
-- nobody has un-voided one yet. Fixed here rather than left for whoever does
-- it first. Caught only because the test asserted on the GL journal after the
-- round trip, not just on the stock.

CREATE OR REPLACE FUNCTION public.void_sale(
  p_id text, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sale RECORD; v_consumption RECORD; item RECORD; v_location UUID;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_id; END IF;
  IF v_sale.voided_at IS NOT NULL THEN RETURN; END IF;

  SELECT id INTO v_location FROM public.inventory_locations
   WHERE tenant_id = v_sale.tenant_id AND type = 'WAREHOUSE'
   ORDER BY created_at ASC NULLS LAST LIMIT 1;

  FOR v_consumption IN SELECT * FROM public.sale_batch_consumption WHERE sale_id = p_id LOOP
    UPDATE public.product_batches
       SET qty_remaining = qty_remaining + v_consumption.qty_taken, updated_at = NOW()
     WHERE id = v_consumption.batch_id;
  END LOOP;
  DELETE FROM public.sale_batch_consumption WHERE sale_id = p_id;

  FOR item IN
    SELECT si.product_id AS pid, COALESCE(si.quantity, 0) AS qty, si.product_name AS name
      FROM public.sale_items si
     WHERE si.sale_id = p_id AND si.deleted_at IS NULL
     ORDER BY si.line_no
  LOOP
    IF v_location IS NOT NULL AND item.pid IS NOT NULL THEN
      UPDATE public.inventory_balances SET quantity = quantity + item.qty, updated_at = NOW()
       WHERE location_id = v_location AND product_id = item.pid AND tenant_id = v_sale.tenant_id;
    END IF;
    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (gen_random_uuid()::text, to_char(NOW(), 'YYYY-MM-DD'), item.pid, item.name, 'IN', item.qty,
            'Void sale: ' || p_id || COALESCE(' (' || p_reason || ')', ''),
            COALESCE(p_user_id::text, v_sale."bookedBy"), v_sale.tenant_id);
  END LOOP;

  IF UPPER(COALESCE(v_sale."paymentMethod",'')) = 'CREDIT' AND v_sale."shopId" IS NOT NULL THEN
    UPDATE public.clients
       SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance,0) - COALESCE(v_sale."totalAmount",0))
     WHERE id = v_sale."shopId" AND tenant_id = v_sale.tenant_id;
  END IF;

  UPDATE public.appointments
     SET sale_id = NULL, status = 'BOOKED'
   WHERE sale_id = p_id AND tenant_id = v_sale.tenant_id;

  UPDATE public.sales
     SET voided_at = NOW(),
         void_reason = p_reason,
         "paymentStatus" = 'VOIDED',
         status = 'VOIDED'
   WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unvoid_sale(
  p_id text, p_paid_amount numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_sale     RECORD;
  item       RECORD;
  v_location UUID;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_id; END IF;
  IF v_sale.voided_at IS NULL THEN
    UPDATE public.sales
       SET "paymentStatus" = 'PAID',
           "paidAmount"    = COALESCE(p_paid_amount, v_sale."totalAmount")
     WHERE id = p_id;
    RETURN;
  END IF;

  SELECT id INTO v_location FROM public.inventory_locations
   WHERE tenant_id = v_sale.tenant_id AND type = 'WAREHOUSE'
   ORDER BY created_at ASC NULLS LAST LIMIT 1;

  FOR item IN
    SELECT si.product_id AS pid, COALESCE(si.quantity, 0) AS qty, si.product_name AS name
      FROM public.sale_items si
     WHERE si.sale_id = p_id AND si.deleted_at IS NULL
     ORDER BY si.line_no
  LOOP
    IF v_location IS NOT NULL AND item.pid IS NOT NULL THEN
      INSERT INTO public.inventory_balances (location_id, product_id, quantity, tenant_id)
      VALUES (v_location, item.pid, 0, v_sale.tenant_id)
      ON CONFLICT (location_id, product_id, tenant_id) DO NOTHING;

      UPDATE public.inventory_balances
         SET quantity   = GREATEST(0, quantity - item.qty),
             updated_at = NOW()
       WHERE location_id = v_location
         AND product_id  = item.pid
         AND tenant_id   = v_sale.tenant_id;
    END IF;

    -- products.stock is derived from inventory_balances by trg_sync_product_stock; a second writer here double-counted the movement.

    INSERT INTO public.movement_log (
      id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id
    ) VALUES (
      gen_random_uuid()::text,
      to_char(NOW(), 'YYYY-MM-DD'),
      item.pid, item.name, 'OUT', item.qty,
      'Unvoid sale: ' || p_id,
      COALESCE(p_user_id::text, v_sale."bookedBy"),
      v_sale.tenant_id
    );
  END LOOP;

  UPDATE public.sales
     SET voided_at      = NULL,
         void_reason    = NULL,
         status         = NULL,   -- see the note at the top of this migration
         "paymentStatus" = 'PAID',
         "paidAmount"    = COALESCE(p_paid_amount, "totalAmount")
   WHERE id = p_id;
END;
$function$;
