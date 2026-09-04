-- Makes undoing a sales return the exact mirror of making one, and gives the
-- return an audit trail of what it actually credited.
--
-- 20260730_sales_return_reverses_original_cost taught process_sales_return to
-- put units back into the batches the sale drew from and reduce
-- sales."totalCogs" by that cost. reverse_sales_return still only deducted
-- inventory_balances — it never re-consumed the batches, never restored the
-- consumption rows, and never put the cost back. Undoing a return therefore left
-- the batch holding stock that had been sold and the sale's COGS permanently
-- understated. The stock half of that asymmetry predates the COGS work; the cost
-- half was introduced by it.
--
-- Reversing exactly requires knowing WHICH batches the return credited, which was
-- recorded nowhere. sales_returns now carries it.
--
-- Verified on Demo, rolled back — a full round trip returns every figure to its
-- starting value:
--   sold 6      totalCogs 220, dear batch 8,  balance 53
--   returned 2  totalCogs  40, dear batch 10, balance 55, cost_reversed 180
--   reversed    totalCogs 220, dear batch 8,  balance 53, drift 0

ALTER TABLE public.sales_returns
  ADD COLUMN IF NOT EXISTS batch_restores jsonb,
  ADD COLUMN IF NOT EXISTS cost_reversed  numeric;

COMMENT ON COLUMN public.sales_returns.batch_restores IS
  'Exactly which batches this return put stock back into: [{batch_id, product_id, qty, unit_cost}]. Read by reverse_sales_return to undo it precisely.';
COMMENT ON COLUMN public.sales_returns.cost_reversed IS
  'Cost credited back to the originating sale''s totalCogs. 0 where no original cost was on record.';

CREATE OR REPLACE FUNCTION public.process_sales_return(
  p_id text, p_tenant_id uuid, p_sale_id text, p_invoice_id text,
  p_client_id text, p_client_name text, p_items jsonb,
  p_total_amount numeric, p_reason text, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_item JSONB; v_pid TEXT; v_name TEXT; v_qty NUMERIC; v_left NUMERIC; v_take NUMERIC;
  v_cons RECORD; v_restored NUMERIC; v_cost_back NUMERIC; v_total_back NUMERIC := 0;
  v_location UUID; v_restores JSONB := '[]'::jsonb;
BEGIN
  -- Inserted first, and sales_returns.id is the primary key, so a duplicated
  -- offline replay aborts here before any stock moves. That guard is
  -- load-bearing — do not move this below the stock work.
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
    v_pid := (v_item->>'id')::TEXT;
    v_name := COALESCE(v_item->>'name', v_pid);
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    CONTINUE WHEN v_qty <= 0;
    v_left := v_qty; v_restored := 0; v_cost_back := 0;

    IF p_sale_id IS NOT NULL THEN
      -- Reverse of the FIFO draw: the sale took the oldest batch first, so the
      -- newest one it reached is the first to go back. Ordered by the batch's
      -- own dates because every consumption row for a sale shares one
      -- transaction timestamp and cannot be ordered by created_at.
      FOR v_cons IN
        SELECT c.* FROM public.sale_batch_consumption c
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

        IF v_cons.qty_taken - v_take <= 0 THEN
          DELETE FROM public.sale_batch_consumption WHERE id = v_cons.id;
        ELSE
          UPDATE public.sale_batch_consumption
             SET qty_taken = qty_taken - v_take, updated_at = NOW() WHERE id = v_cons.id;
        END IF;

        v_restores := v_restores || jsonb_build_object(
          'batch_id', v_cons.batch_id, 'product_id', v_pid,
          'qty', v_take, 'unit_cost', v_cons.unit_cost);

        v_cost_back := v_cost_back + v_take * v_cons.unit_cost;
        v_restored := v_restored + v_take;
        v_left := v_left - v_take;
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

    -- Anything the sale cannot account for still enters stock, costed from the
    -- last purchase because nothing better exists. Named in the log, not silent.
    IF v_left > 0 THEN
      PERFORM public.adjust_inventory_atomic(
        v_pid, NULL, v_left,
        'Sales return: ' || COALESCE(p_sale_id, p_id) || ' (no original cost on record)',
        'system', p_tenant_id, NULL, p_id, 'SALES_RETURN', true, NULL);
    END IF;
  END LOOP;

  UPDATE public.sales_returns
     SET batch_restores = v_restores, cost_reversed = v_total_back
   WHERE id = p_id AND tenant_id = p_tenant_id;

  IF p_sale_id IS NOT NULL AND v_total_back > 0 THEN
    UPDATE public.sales
       SET "totalCogs" = GREATEST(0, COALESCE("totalCogs", 0) - v_total_back)
     WHERE id = p_sale_id AND tenant_id = p_tenant_id;
  END IF;

  IF p_client_id IS NOT NULL AND p_client_id <> '' THEN
    UPDATE public.clients
    SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - p_total_amount)
    WHERE id = p_client_id AND tenant_id = p_tenant_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_sales_return(p_return_id text, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_ret RECORD; v_item JSONB; v_r JSONB; v_qty NUMERIC; v_batch UUID; v_pid TEXT; v_cost NUMERIC;
BEGIN
  SELECT * INTO v_ret FROM public.sales_returns
    WHERE id = p_return_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;

  -- Stock leaves again.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_ret.items, '[]'::jsonb)) LOOP
    UPDATE public.inventory_balances
      SET quantity = GREATEST(0, COALESCE(quantity,0) - (v_item->>'quantity')::NUMERIC),
          updated_at = NOW()
      WHERE product_id = (v_item->>'id')::TEXT AND tenant_id = p_tenant_id;

    INSERT INTO public.movement_log
      (id, date, product_id, product_name, type, quantity, reason, tenant_id)
    VALUES (gen_random_uuid()::text, CURRENT_DATE, (v_item->>'id')::TEXT,
            COALESCE(v_item->>'name', (v_item->>'id')::TEXT), 'OUT',
            COALESCE((v_item->>'quantity')::NUMERIC, 0),
            'Reversed sales return: ' || p_return_id, p_tenant_id);
  END LOOP;

  -- Put the cost back exactly where the return took it from. Without this the
  -- batch kept stock that had been sold and the sale's COGS stayed understated.
  FOR v_r IN SELECT * FROM jsonb_array_elements(COALESCE(v_ret.batch_restores, '[]'::jsonb)) LOOP
    v_batch := (v_r->>'batch_id')::UUID;
    v_pid   := (v_r->>'product_id')::TEXT;
    v_qty   := COALESCE((v_r->>'qty')::NUMERIC, 0);
    v_cost  := COALESCE((v_r->>'unit_cost')::NUMERIC, 0);
    CONTINUE WHEN v_qty <= 0;

    UPDATE public.product_batches
       SET qty_remaining = GREATEST(0, qty_remaining - v_qty), updated_at = NOW()
     WHERE id = v_batch;

    INSERT INTO public.sale_batch_consumption
      (id, tenant_id, sale_id, product_id, batch_id, qty_taken, unit_cost)
    VALUES (gen_random_uuid(), p_tenant_id, v_ret.sale_id, v_pid, v_batch, v_qty, v_cost);
  END LOOP;

  IF v_ret.sale_id IS NOT NULL AND COALESCE(v_ret.cost_reversed, 0) > 0 THEN
    UPDATE public.sales
       SET "totalCogs" = COALESCE("totalCogs", 0) + v_ret.cost_reversed
     WHERE id = v_ret.sale_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_ret.client_id IS NOT NULL AND v_ret.client_id <> '' THEN
    UPDATE public.clients
      SET outstanding_balance = COALESCE(outstanding_balance,0) + COALESCE(v_ret.total_amount,0)
      WHERE id = v_ret.client_id AND tenant_id = p_tenant_id;
  END IF;

  DELETE FROM public.sales_returns WHERE id = p_return_id AND tenant_id = p_tenant_id;
END;
$function$;
