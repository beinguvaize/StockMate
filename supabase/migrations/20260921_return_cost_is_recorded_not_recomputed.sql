-- A return's cost stops being recomputed and starts being recorded.
--
-- THE BUG. Both the ledger and the P&L worked out what a return cost by
-- multiplying quantity by the product's costPrice -- but at different moments.
-- The ledger did it once, when the journal posted, and froze the answer. The
-- P&L did it afresh on every run. Edit a cost price and the two drift apart,
-- permanently, and keep drifting on every later edit. On production they had
-- already drifted Rs 1,656.05 apart.
--
-- BOTH WERE WRONG, which is the part that matters. The one return linked to a
-- sale had returned that sale IN FULL -- 180 and 48 units, exactly the
-- quantities sold -- so its true cost is that sale's own totalCogs,
-- Rs 11,460.00. Those goods had been costed by batch FIFO at Rs 115/unit; the
-- product's cost today is Rs 98.33. So the P&L understated that return by
-- Rs 800.18, and the ledger held a third figure again. The correct total is
-- Rs 12,278.28; the ledger said Rs 13,134.15 and the P&L said Rs 11,478.10.
--
-- THE FIX is to record the unit cost on the line at the moment of the return,
-- the way sale_items already records the price. A figure stored once cannot
-- drift, and two readers of the same stored figure agree by construction
-- rather than by coincidence.
--
-- Where the cost comes from, in order:
--   1. The batch the goods actually came out of, when the return names a sale
--      and that sale consumed a batch of this product -- the true cost of the
--      goods being handed back.
--   2. The product's costPrice at the time of the return. Four of the five
--      live returns name no sale at all, because a customer can bring goods
--      back without the bill, so for those there is nothing better available.
--
-- This touches the frozen COGS path and was made on explicit instruction.

ALTER TABLE public.sales_return_items
  ADD COLUMN IF NOT EXISTS cost_price numeric CHECK (cost_price IS NULL OR cost_price >= 0);

COMMENT ON COLUMN public.sales_return_items.cost_price IS
  'Unit cost of the returned goods, snapshotted at return time. Never recomputed: recomputing from the product is what made the ledger and the P&L disagree.';

CREATE OR REPLACE FUNCTION public.sync_sales_return_items_from_blob()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.items IS NOT DISTINCT FROM OLD.items THEN RETURN NEW; END IF;

  BEGIN
  DELETE FROM public.sales_return_items WHERE return_id = NEW.id;

  INSERT INTO public.sales_return_items
    (tenant_id, return_id, line_no, product_id, product_name, hsn_code,
     quantity, rate, tax_rate, cess_rate, cost_price)
  SELECT NEW.tenant_id, NEW.id, s.ord::int,
    prod.id,
    s.it->>'name',
    nullif(trim(coalesce(s.it->>'hsn', '')), ''),
    s.quantity, s.rate, s.tax_rate, s.cess_rate,
    COALESCE(
      (SELECT c.unit_cost FROM public.sale_batch_consumption c
        WHERE c.sale_id = NEW.sale_id AND c.product_id = prod.id AND c.deleted_at IS NULL
        ORDER BY c.created_at LIMIT 1),
      prod."costPrice",
      0)
  FROM (
    SELECT e.ord, e.it,
      CASE WHEN (e.it->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'quantity')::numeric END AS quantity,
      CASE WHEN (e.it->>'rate') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'rate')::numeric END AS rate,
      CASE WHEN coalesce(e.it->>'taxRate', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'taxRate', '0')::numeric ELSE 0 END AS tax_rate,
      CASE WHEN coalesce(e.it->>'cess', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'cess', '0')::numeric ELSE 0 END AS cess_rate
    FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS e(it, ord)
  ) s
  LEFT JOIN public.products prod
    ON prod.id = (s.it->>'id') AND prod.tenant_id = NEW.tenant_id
  WHERE (s.it->>'name') IS NOT NULL
    AND s.quantity IS NOT NULL AND s.rate IS NOT NULL AND s.quantity > 0;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_sales_return_items_from_blob failed for return % (tenant %): %',
      NEW.id, NEW.tenant_id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- Backfill existing lines by the same rule the trigger now applies.
UPDATE public.sales_return_items si
   SET cost_price = COALESCE(
         (SELECT c.unit_cost FROM public.sale_batch_consumption c
            JOIN public.sales_returns r2 ON r2.id = si.return_id
           WHERE c.sale_id = r2.sale_id AND c.product_id = si.product_id
             AND c.deleted_at IS NULL
           ORDER BY c.created_at LIMIT 1),
         (SELECT p."costPrice" FROM public.products p WHERE p.id = si.product_id),
         0)
 WHERE si.cost_price IS NULL;
