-- A sales return now gives back exactly what the sale took.
--
-- Until now a return re-entered stock at the LAST PURCHASE PRICE, because it had
-- no link to what the original sale actually consumed. On a product with more
-- than one cost layer that is simply a different number: a sale of 6 that
-- consumed 4 @ 10 and 2 @ 90 books 220 of COGS, but returning 2 of those units
-- credited them at whatever the newest bill said. Profit moved on a return that
-- should have been cost-neutral.
--
-- sale_batch_consumption already records batch_id, qty_taken and unit_cost per
-- sale, so the reversal can be exact. Units go back to the very batches they
-- came out of, at the cost that sale recorded, and sales."totalCogs" drops by
-- precisely that amount.
--
-- ORDERING — the part that was wrong first time. The obvious "put back the last
-- layer taken" via ORDER BY created_at DESC does not work: every consumption row
-- for a sale is written in one statement and shares the transaction timestamp,
-- so the order was arbitrary. Caught in test — a 2-unit return gave back the 10
-- layer and credited 20 instead of 180. FIFO consumes the OLDEST received batch
-- first, so the layer reached last is the one with the newest received_date.
-- Ordering by the batch's own dates is deterministic and mirrors the draw.
--
-- Falls back to adjust_inventory_atomic (cost resolved from the last purchase)
-- only when there is nothing to reverse: a credit note with no originating sale
-- (CreateDocument.jsx passes p_sale_id => null), a sale predating FIFO tracking,
-- or more units returned than were sold. Those cannot be exact; the fallback is
-- stated in the movement_log reason rather than left silent.
--
-- Verified on Demo, rolled back: sale of 6 booked 220; returning 2 left
-- totalCogs at 40, restored the 90 batch from 8 to 10, left the 10 batch at 0,
-- and moved stock with zero drift.

CREATE OR REPLACE FUNCTION public.process_sales_return(
  p_id text, p_tenant_id uuid, p_sale_id text, p_invoice_id text,
  p_client_id text, p_client_name text, p_items jsonb,
  p_total_amount numeric, p_reason text, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_item        JSONB;
  v_pid         TEXT;
  v_name        TEXT;
  v_qty         NUMERIC;
  v_left        NUMERIC;
  v_take        NUMERIC;
  v_cons        RECORD;
  v_restored    NUMERIC;
  v_cost_back   NUMERIC;
  v_total_back  NUMERIC := 0;
  v_location    UUID;
BEGIN
  INSERT INTO public.sales_returns (
    id, tenant_id, sale_id, invoice_id, client_id, client_name,
    items, total_amount, reason, date
  ) VALUES (
    p_id, p_tenant_id, p_sale_id, p_invoice_id, p_client_id, p_client_name,
    p_items, p_total_amount, p_reason, p_date
  );

  SELECT id INTO v_location FROM public.inventory_locations
   WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE'
   ORDER BY created_at ASC NULLS LAST LIMIT 1;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid  := (v_item->>'id')::TEXT;
    v_name := COALESCE(v_item->>'name', v_pid);
    v_qty  := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    CONTINUE WHEN v_qty <= 0;

    v_left      := v_qty;
    v_restored  := 0;
    v_cost_back := 0;

    IF p_sale_id IS NOT NULL THEN
      -- Reverse of the FIFO draw: the sale took the oldest batch first, so the
      -- newest one it reached is the first to go back.
      FOR v_cons IN
        SELECT c.*
          FROM public.sale_batch_consumption c
          JOIN public.product_batches b ON b.id = c.batch_id
         WHERE c.sale_id = p_sale_id AND c.product_id = v_pid
           AND c.tenant_id = p_tenant_id AND c.qty_taken > 0
         ORDER BY b.received_date DESC NULLS FIRST, b.created_at DESC
         FOR UPDATE OF c
      LOOP
        EXIT WHEN v_left <= 0;
        v_take := LEAST(v_cons.qty_taken, v_left);

        UPDATE public.product_batches
           SET qty_remaining = qty_remaining + v_take, updated_at = NOW()
         WHERE id = v_cons.batch_id;

        -- Shrink the consumption row so the sale's remaining COGS stays true.
        IF v_cons.qty_taken - v_take <= 0 THEN
          DELETE FROM public.sale_batch_consumption WHERE id = v_cons.id;
        ELSE
          UPDATE public.sale_batch_consumption
             SET qty_taken = qty_taken - v_take, updated_at = NOW()
           WHERE id = v_cons.id;
        END IF;

        v_cost_back := v_cost_back + v_take * v_cons.unit_cost;
        v_restored  := v_restored + v_take;
        v_left      := v_left - v_take;
      END LOOP;
    END IF;

    IF v_restored > 0 THEN
      IF v_location IS NOT NULL THEN
        INSERT INTO public.inventory_balances (location_id, product_id, quantity, tenant_id)
        VALUES (v_location, v_pid, v_restored, p_tenant_id)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET quantity = public.inventory_balances.quantity + EXCLUDED.quantity,
                      updated_at = NOW();
      END IF;

      INSERT INTO public.movement_log
        (id, date, product_id, product_name, type, quantity, reason, tenant_id)
      VALUES (gen_random_uuid()::text, CURRENT_DATE, v_pid, v_name, 'IN', v_restored,
              'Sales return: ' || COALESCE(p_sale_id, p_id) || ' (original cost restored)',
              p_tenant_id);

      v_total_back := v_total_back + v_cost_back;
    END IF;

    -- Anything the sale cannot account for still has to enter stock, but it
    -- enters costed from the last purchase because nothing better exists.
    IF v_left > 0 THEN
      PERFORM public.adjust_inventory_atomic(
        v_pid, NULL, v_left,
        'Sales return: ' || COALESCE(p_sale_id, p_id) || ' (no original cost on record)',
        'system', p_tenant_id, NULL, p_id, 'SALES_RETURN', true, NULL);
    END IF;
  END LOOP;

  -- The sale keeps only the cost of what the customer kept.
  IF p_sale_id IS NOT NULL AND v_total_back > 0 THEN
    UPDATE public.sales
       SET "totalCogs" = GREATEST(0, COALESCE("totalCogs", 0) - v_total_back)
     WHERE id = p_sale_id AND tenant_id = p_tenant_id;
  END IF;

  IF p_client_id IS NOT NULL AND p_client_id <> '' THEN
    UPDATE public.clients
    SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - p_total_amount)
    WHERE id = p_client_id
      AND tenant_id = p_tenant_id;
  END IF;
END;
$function$;
