-- Phase 5a, last one: reversing a sales return reads sales_return_items.
--
-- It walked jsonb_array_elements(sales_returns.items) pulling (id, quantity,
-- name) to take the stock back out and write the movement log. The line table
-- holds all three as columns, and product_name is the snapshot taken when the
-- return was recorded -- so the movement log keeps the name the goods came
-- back under, even if the product has since been renamed.
--
-- Equivalence proven first: 6 lines on each side, 0 on only one side, 0
-- quantity mismatches, 0 name mismatches, 0 orphans.
--
-- batch_restores STAYS a blob, deliberately. It records which BATCH each unit
-- went back to -- not what was on the bill -- and has no table of its own.
-- Normalising it is a separate piece of work, and conflating the two here
-- would have widened a read migration into a schema change.
--
-- WHAT THIS COMPLETES
--
-- Nothing in the database now reads sale or return LINES from a JSON blob for
-- business purposes. What still reads `.items` does so by design:
--
--   sync_sale_items_from_blob          derives the table FROM the blob
--   sync_sales_return_items_from_blob  derives the table FROM the blob
--   audit_sale_items                   compares the two, nightly
--   generate_due_recurring_invoices    a DIFFERENT blob entirely --
--                                      recurring_invoice_templates.items,
--                                      which uses `qty` rather than
--                                      `quantity` and has never touched
--                                      sales.items. Its own normalisation,
--                                      not this one.
--
-- Those first three are exactly what Phase 5b removes when the blob stops
-- being written.

CREATE OR REPLACE FUNCTION public.reverse_sales_return(p_return_id text, p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_ret     RECORD;
  v_line    RECORD;
  v_r       JSONB;
  v_qty     NUMERIC;
  v_batch   UUID;
  v_pid     TEXT;
  v_cost    NUMERIC;
BEGIN
  SELECT * INTO v_ret FROM public.sales_returns
    WHERE id = p_return_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;

  -- Stock leaves again. A line whose product has since been deleted carries
  -- product_id NULL: it skips the balance update -- there is no balance to
  -- adjust -- and still records the movement, which is the audit trail.
  FOR v_line IN
    SELECT si.product_id AS pid,
           COALESCE(si.quantity, 0) AS qty,
           COALESCE(si.product_name, si.product_id) AS name
      FROM public.sales_return_items si
     WHERE si.return_id = p_return_id AND si.deleted_at IS NULL
     ORDER BY si.line_no
  LOOP
    IF v_line.pid IS NOT NULL THEN
      UPDATE public.inventory_balances
        SET quantity = GREATEST(0, COALESCE(quantity,0) - v_line.qty),
            updated_at = NOW()
        WHERE product_id = v_line.pid AND tenant_id = p_tenant_id;
    END IF;

    INSERT INTO public.movement_log
      (id, date, product_id, product_name, type, quantity, reason, tenant_id)
    VALUES (gen_random_uuid()::text, CURRENT_DATE, v_line.pid,
            v_line.name, 'OUT', v_line.qty,
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

  -- sales_return_items cascades on this delete, so the lines go with it.
  DELETE FROM public.sales_returns WHERE id = p_return_id AND tenant_id = p_tenant_id;
END;
$function$;
