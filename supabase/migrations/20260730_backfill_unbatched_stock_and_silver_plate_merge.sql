-- DATA REPAIR for FUTURE DISPO. Applied once; kept for the record and so the
-- reasoning survives. Not idempotent — do not re-run.
--
-- Snapshots taken first: snap.unbatched_stock_backfill_20260730,
-- snap.silver_plate_dedupe_20260730 (90-day retention).
--
-- PART 1 — stock on hand with no cost batch (34 products, 1,005 units,
-- Rs 35,124.96). These units entered through manual adjustments before
-- adjust_inventory_atomic could cost them, so inventory_balances carried them
-- while product_batches did not. Each gap gets one ADJUSTMENT batch priced by
-- resolve_adjustment_cost: 29 products from a real prior bill (LAST_KNOWN,
-- Rs 34,095), 5 from costPrice (ESTIMATED, Rs 1,030).
--
-- The movement-log trigger is suppressed for this insert. The goods are already
-- on hand; writing "IN" rows would claim they arrived a second time.
--
-- PART 2 — SILVER PLATE 12" was a duplicate of SILVER PLATE 12, created a day
-- later by what looks like a quoting typo. Its only event was the 16 Jul
-- reconciliation seeding 48 units, which double-counted purchase PUR-3PXDYC
-- that the real product had already recorded and been selling down (48 bought,
-- 30 sold, 18 left — matching its balance exactly). The duplicate had no
-- balance row, no purchases, no sales, no COGS and no price lists, so nothing
-- needed re-pointing. Its 48-unit batch is zeroed rather than moved: moving it
-- would add stock that does not exist. Removes Rs 4,320 of phantom inventory.

-- PART 1
ALTER TABLE public.product_batches DISABLE TRIGGER trg_product_batches_log_movement;

WITH bal AS (
  SELECT product_id, sum(quantity)::numeric q FROM public.inventory_balances
  WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3' GROUP BY 1),
bat AS (
  SELECT product_id, sum(qty_remaining)::numeric q FROM public.product_batches
  WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3' AND deleted_at IS NULL GROUP BY 1),
gap AS (
  SELECT p.id, COALESCE(bal.q,0) - COALESCE(bat.q,0) AS qty
  FROM public.products p
  LEFT JOIN bal ON bal.product_id = p.id
  LEFT JOIN bat ON bat.product_id = p.id
  WHERE p.tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
    AND p.deleted_at IS NULL
    AND COALESCE(bal.q,0) > COALESCE(bat.q,0))
INSERT INTO public.product_batches
  (product_id, tenant_id, unit_cost, qty_received, qty_remaining, received_date,
   note, origin, cost_basis)
SELECT g.id, 'fd4927bf-c084-4bed-ba13-d30e650da6f3', ROUND(r.unit_cost,4),
       g.qty, g.qty, CURRENT_DATE,
       'Backfill: stock on hand with no cost batch', 'ADJUSTMENT', r.basis
FROM gap g
JOIN LATERAL public.resolve_adjustment_cost(
       'fd4927bf-c084-4bed-ba13-d30e650da6f3', g.id, CURRENT_DATE) r ON true
WHERE r.unit_cost > 0;

ALTER TABLE public.product_batches ENABLE TRIGGER trg_product_batches_log_movement;

-- PART 2
ALTER TABLE public.product_batches DISABLE TRIGGER trg_product_batches_log_movement;

UPDATE public.product_batches
   SET qty_remaining = 0,
       note = COALESCE(note,'') ||
              ' | voided 2026-07-30: double-counted PUR-3PXDYC on duplicate product'
 WHERE product_id = 'PROD-1783751653843-1502'
   AND tenant_id  = 'fd4927bf-c084-4bed-ba13-d30e650da6f3';

ALTER TABLE public.product_batches ENABLE TRIGGER trg_product_batches_log_movement;

-- products.stock read 48 while no balance row existed at all. Agree them at 0
-- before retiring the product.
UPDATE public.products
   SET stock = 0,
       name = name || ' (merged into SILVER PLATE 12)',
       deleted_at = NOW()
 WHERE id = 'PROD-1783751653843-1502'
   AND tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3';

-- Re-derive weighted-average cost for every product touched.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT product_id FROM public.product_batches
    WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
      AND note LIKE 'Backfill: stock on hand%'
    UNION SELECT 'PROD-1783689668771-6kdi2'
  LOOP
    PERFORM public.recompute_product_cost(
      'fd4927bf-c084-4bed-ba13-d30e650da6f3', r.product_id);
  END LOOP;
END $$;
