-- Paper Cup 150 Ml (PROD-1778591878857-e8yh2) costs Rs 28, not Rs 25.
--
-- Approved all-time restatement, mirroring the Rs 38 -> Rs 33 change made to
-- Paper Cup 210 Ml, but in the opposite direction: cost rises, so historic
-- gross profit FALLS Rs 660 and stock value rises Rs 1,380.
--
-- Unlike the 210 Ml case this product keeps a live supplier bill. PUR-ASO5NY
-- (150 @ Rs 25 = Rs 3,750, GPS Paper Cup, paid by bank) is real and stays.
-- The owner has decided all 220 sold units restate to Rs 28 regardless, so
-- that layer's cost deliberately no longer equals its bill.
--
-- Because of that the layer's cost_basis drops from SUPPLIER_BILL to
-- ESTIMATED. The bill link (origin, purchase_id) is kept so the audit trail
-- survives, but nothing may go on claiming this cost is what a supplier
-- charged - it is not, and the Unverified Cost report must say so.
--
-- Four places carry the Rs 25 and all four move together:
--   1. products."costPrice"        - fallback rate for future sales
--   2. product_batches.unit_cost   - 3 layers, one holding the live 460
--   3. sale_batch_consumption      - 24 rows, the per-sale cost record
--   4. sales."totalCogs"           - the figure every report reads
--
-- totalCogs is adjusted by delta, not recomputed: these sales carry other
-- products whose costs would otherwise be discarded.

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.paper_cup_150_cost_batches_20260801 AS
SELECT * FROM public.product_batches WHERE product_id = 'PROD-1778591878857-e8yh2';

CREATE TABLE IF NOT EXISTS snap.paper_cup_150_cost_consumption_20260801 AS
SELECT sbc.* FROM public.sale_batch_consumption sbc
JOIN public.product_batches pb ON pb.id = sbc.batch_id
WHERE pb.product_id = 'PROD-1778591878857-e8yh2';

CREATE TABLE IF NOT EXISTS snap.paper_cup_150_cost_sales_20260801 AS
SELECT DISTINCT s.id, s."totalCogs", s."totalAmount", s.date
FROM public.sales s
JOIN public.sale_batch_consumption sbc ON sbc.sale_id = s.id
JOIN public.product_batches pb ON pb.id = sbc.batch_id
WHERE pb.product_id = 'PROD-1778591878857-e8yh2';

-- Refuse to run against anything but the surveyed shape. A layer at some other
-- rate would be silently dragged to 28 by a blanket update.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.product_batches
  WHERE product_id = 'PROD-1778591878857-e8yh2' AND deleted_at IS NULL
    AND unit_cost <> 25;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% batch(es) are not at Rs 25 - aborting', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM public.sale_batch_consumption sbc
  JOIN public.product_batches pb ON pb.id = sbc.batch_id
  WHERE pb.product_id = 'PROD-1778591878857-e8yh2' AND sbc.unit_cost <> 25;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% consumption row(s) are not at Rs 25 - aborting', v_bad;
  END IF;
END $$;

-- 4. Add the delta to each sale first, while the consumption rows still hold
--    Rs 25 and the increase can be derived from them.
UPDATE public.sales s
   SET "totalCogs" = s."totalCogs" + d.delta
  FROM (
    SELECT sbc.sale_id, sum(sbc.qty_taken) * (28 - 25) AS delta
    FROM public.sale_batch_consumption sbc
    JOIN public.product_batches pb ON pb.id = sbc.batch_id
    WHERE pb.product_id = 'PROD-1778591878857-e8yh2'
    GROUP BY sbc.sale_id
  ) d
 WHERE s.id = d.sale_id;

-- 3. The per-sale cost record.
UPDATE public.sale_batch_consumption sbc
   SET unit_cost = 28
  FROM public.product_batches pb
 WHERE pb.id = sbc.batch_id
   AND pb.product_id = 'PROD-1778591878857-e8yh2';

-- 2. The cost layers, including the one holding the live 460 units.
UPDATE public.product_batches
   SET unit_cost = 28
 WHERE product_id = 'PROD-1778591878857-e8yh2' AND deleted_at IS NULL;

-- 2b. The bill-backed layer no longer carries its bill's rate. Keep the link,
--     drop the claim.
UPDATE public.product_batches
   SET cost_basis = 'ESTIMATED',
       note = 'Cost restated to Rs 28 on 1 Aug 2026 by owner decision. '
              || 'PUR-ASO5NY billed these 150 units at Rs 25 (Rs 3,750, paid '
              || 'by bank); this layer no longer reflects that bill.'
 WHERE id = '3530219a-9f6e-4a42-b3d7-caee9b87ad80';

-- 1. The fallback rate for anything sold from here on.
UPDATE public.products
   SET "costPrice" = 28
 WHERE id = 'PROD-1778591878857-e8yh2';
