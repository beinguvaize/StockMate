-- The cost on the item screen has to mean the stock in the building
-- ============================================================================
--
-- `products."costPrice"` is what every margin figure in the app is computed
-- from: the Margin column in Inventory, its red/amber tiers, the POS
-- below-floor badge, the Item Details screen. StockTable.jsx even documents it
-- as "weighted-average cost, kept fresh from open batches".
--
-- It is not kept fresh. `recompute_product_cost` -- which is correct, and does
-- compute the weighted average of open batches -- is called when stock comes
-- IN (process_purchase, adjust_inventory_atomic, recost_purchase_batches,
-- resync_purchase_batch, restore_fifo, write_off_batch) and by nothing at all
-- when stock goes OUT. But the weighted average changes the moment a sale
-- empties a cheap batch, and `consume_fifo` never recomputes it.
--
-- WHAT THAT COST A REAL SHOP
--
-- FUTURE DISPO, product 10*13 Cover PKT, as of 2026-10-19:
--
--   item screen "purchase price"   Rs 5.50      <- no stock costs this
--   stock actually on hand         Rs 7.82      (19,072.50 / 2,440)
--   batch being consumed TODAY     Rs 9.00
--   selling price                  Rs 8.50
--   margin displayed               35.3 %       = (8.50 - 5.50) / 8.50
--
-- The last Rs 5.50 batch emptied on 15 October. Since then every unit has sold
-- below cost, and the bill proves it: sale SAL-28F1D4DC on 17 October, 10
-- units at Rs 8.50 = Rs 85.00 against Rs 90.00 of COGS, a Rs 5.00 loss, while
-- the item screen advertised a 35.3 % margin. Across that tenant 25 of 64
-- stocked products disagree with their own batches.
--
-- Reported profit was never wrong -- sales."totalCogs" comes from real batch
-- consumption. What was wrong is the number the shopkeeper is shown when
-- deciding what to charge, which is the number that stops this happening.
--
-- THE FIX IS ONE LINE, IN THE PLACE THE EVENT HAPPENS
--
-- consume_fifo already holds the row locks and has just changed the quantities
-- the average is made of. Recomputing there means the cost tracks the shelf
-- rather than tracking purchases only.
--
-- The COGS calculation itself is untouched, deliberately. This appends a
-- PERFORM before the existing RETURN and changes no branch, no ordering and no
-- returned value. recompute_product_cost writes only when it has a figure
-- (`IF v_cost IS NOT NULL`), so a product whose last batch just emptied keeps
-- its final cost rather than dropping to zero and reporting a 100 % margin.
--
-- Anchored on the live source rather than pasted, because prod and dev have
-- drifted and a pasted body would revert whichever copy it was not taken from.

DO $patch$
DECLARE
  r        record;
  v_new    text;
  v_anchor text;
  v_hits   int;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) AS args,
         pg_get_function_result(p.oid) AS result,
         p.prosecdef, p.provolatile, p.proconfig
    INTO r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'consume_fifo';
  IF r IS NULL THEN
    RAISE EXCEPTION 'consume_fifo is not present here';
  END IF;

  IF position('recompute_product_cost' in r.prosrc) > 0 THEN
    RAISE NOTICE 'consume_fifo already refreshes the product cost';
    RETURN;
  END IF;

  -- The single exit that runs after batches were actually consumed. The two
  -- early RETURNs above it (zero quantity, no batches at all) consume nothing,
  -- so there is nothing to recompute on those paths and they are left alone.
  v_anchor := '  RETURN v_cogs;';
  SELECT count(*) INTO v_hits FROM regexp_matches(r.prosrc, 'RETURN v_cogs;', 'g');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'consume_fifo: exit anchor found % times, expected exactly 1', v_hits;
  END IF;

  v_new := replace(r.prosrc, v_anchor,
      '  -- The quantities this average is made of have just changed. Recompute' || E'\n' ||
      '  -- here, under the locks already held, so products."costPrice" tracks the' || E'\n' ||
      '  -- stock on the shelf instead of only tracking purchases.' || E'\n' ||
      '  PERFORM public.recompute_product_cost(p_tenant_id, p_product_id);' || E'\n\n' ||
      v_anchor);
  IF v_new = r.prosrc THEN
    RAISE EXCEPTION 'consume_fifo: anchor matched but nothing changed';
  END IF;

  -- Every attribute read back from the catalog, never hardcoded: the two
  -- databases differ on these, and a migration that assumes either would
  -- silently change one of them.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.consume_fifo(%s) RETURNS %s LANGUAGE plpgsql %s %s %s AS %L',
    r.args, r.result,
    CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN r.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
    COALESCE((SELECT string_agg('SET ' || split_part(c, '=', 1) || ' TO ' || quote_literal(split_part(c, '=', 2)), ' ')
                FROM unnest(r.proconfig) AS c), ''),
    v_new);
END $patch$;

-- Prove it, rather than report a success the patch did not achieve.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'consume_fifo'
       AND position('recompute_product_cost' in p.prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'consume_fifo still does not refresh the product cost';
  END IF;
END $check$;

-- ── The products already drifted ───────────────────────────────────────────
--
-- The patch above only keeps cost correct from now on. Every product whose
-- cheap batch emptied before today is still carrying a figure no stock
-- supports, and would carry it until its next purchase.
--
-- Only products that still HAVE open batches are touched: those are the ones
-- whose correct answer is known. A product with no stock keeps its last cost,
-- which is the same rule recompute_product_cost itself follows, and the same
-- one the COGS fallback depends on.
DO $backfill$
DECLARE
  rec     record;
  v_fixed int := 0;
BEGIN
  FOR rec IN
    SELECT p.tenant_id, p.id, p.name, p."costPrice"::numeric AS was,
           round((sum(b.qty_remaining * b.unit_cost) / sum(b.qty_remaining))::numeric, 4) AS now_is
      FROM public.products p
      JOIN public.product_batches b
        ON b.product_id = p.id AND b.tenant_id = p.tenant_id
       AND b.deleted_at IS NULL AND b.qty_remaining > 0
     WHERE p.deleted_at IS NULL
     GROUP BY p.tenant_id, p.id, p.name, p."costPrice"
    HAVING abs(COALESCE(p."costPrice", 0)::numeric
               - (sum(b.qty_remaining * b.unit_cost) / sum(b.qty_remaining))) > 0.005
  LOOP
    -- Through the function, not a bare UPDATE, so there stays exactly one
    -- definition of what this number means.
    PERFORM public.recompute_product_cost(rec.tenant_id, rec.id);
    RAISE NOTICE 'cost corrected: % (%) % -> %', rec.name, rec.id, rec.was, rec.now_is;
    v_fixed := v_fixed + 1;
  END LOOP;
  RAISE NOTICE 'products corrected: %', v_fixed;
END $backfill$;
