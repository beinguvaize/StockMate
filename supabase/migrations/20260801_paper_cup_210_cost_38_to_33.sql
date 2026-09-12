-- Paper Cup 210 Ml (PROD-1778591834706-vj3wr) costs Rs 33, not Rs 38.
--
-- Restated for all time. This is a deliberate, approved change to historic
-- COGS, made possible because PUR-AQXHO1 was removed first: all three of this
-- product's cost layers are now estimates, so no paid supplier bill contradicts
-- the new rate.
--
-- Four places carry the Rs 38 and all four must move together, or the product's
-- profit stops reconciling with its stock value:
--   1. products."costPrice"        - the fallback rate for future sales
--   2. product_batches.unit_cost   - 3 layers, one of which holds the live 229
--   3. sale_batch_consumption      - 30 rows, the actual per-sale cost record
--   4. sales."totalCogs"           - the rolled-up figure every report reads
--
-- totalCogs is adjusted by delta rather than recomputed: these sales contain
-- other products too, and recomputing would discard their costs.
--
-- Effect: 603 units already sold are restated Rs 5 cheaper, so historic gross
-- profit rises Rs 3,015. Stock value falls Rs 1,145 (229 units x Rs 5).

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.paper_cup_210_cost_batches_20260801 AS
SELECT * FROM public.product_batches WHERE product_id = 'PROD-1778591834706-vj3wr';

CREATE TABLE IF NOT EXISTS snap.paper_cup_210_cost_consumption_20260801 AS
SELECT sbc.* FROM public.sale_batch_consumption sbc
JOIN public.product_batches pb ON pb.id = sbc.batch_id
WHERE pb.product_id = 'PROD-1778591834706-vj3wr';

CREATE TABLE IF NOT EXISTS snap.paper_cup_210_cost_sales_20260801 AS
SELECT DISTINCT s.id, s."totalCogs", s."totalAmount", s.date
FROM public.sales s
JOIN public.sale_batch_consumption sbc ON sbc.sale_id = s.id
JOIN public.product_batches pb ON pb.id = sbc.batch_id
WHERE pb.product_id = 'PROD-1778591834706-vj3wr';

-- Refuse to run against anything but the surveyed shape. A stray layer at some
-- other rate would be silently dragged to 33 by a blanket update.
DO $$
DECLARE v_bad int; v_neg int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.product_batches
  WHERE product_id = 'PROD-1778591834706-vj3wr' AND deleted_at IS NULL
    AND unit_cost <> 38;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% batch(es) are not at Rs 38 - aborting', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM public.purchases
  WHERE linked_product_id = 'PROD-1778591834706-vj3wr' AND deleted_at IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'product has % live purchase bill(s); cost is bill-backed - aborting', v_bad;
  END IF;

  -- No sale may end up with negative cost of goods.
  SELECT count(*) INTO v_neg FROM (
    SELECT s.id, max(s."totalCogs") - sum(sbc.qty_taken) * 5 AS after
    FROM public.sales s
    JOIN public.sale_batch_consumption sbc ON sbc.sale_id = s.id
    JOIN public.product_batches pb ON pb.id = sbc.batch_id
    WHERE pb.product_id = 'PROD-1778591834706-vj3wr'
    GROUP BY s.id
  ) t WHERE after < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION '% sale(s) would go to negative COGS - aborting', v_neg;
  END IF;
END $$;

-- 4. Roll the delta off each sale first, while the consumption rows still
--    hold Rs 38 and the reduction can be derived from them.
UPDATE public.sales s
   SET "totalCogs" = s."totalCogs" - d.delta
  FROM (
    SELECT sbc.sale_id, sum(sbc.qty_taken) * (38 - 33) AS delta
    FROM public.sale_batch_consumption sbc
    JOIN public.product_batches pb ON pb.id = sbc.batch_id
    WHERE pb.product_id = 'PROD-1778591834706-vj3wr'
    GROUP BY sbc.sale_id
  ) d
 WHERE s.id = d.sale_id;

-- 3. The per-sale cost record.
UPDATE public.sale_batch_consumption sbc
   SET unit_cost = 33
  FROM public.product_batches pb
 WHERE pb.id = sbc.batch_id
   AND pb.product_id = 'PROD-1778591834706-vj3wr';

-- 2. The cost layers, including the one holding the live 229 units.
UPDATE public.product_batches
   SET unit_cost = 33
 WHERE product_id = 'PROD-1778591834706-vj3wr' AND deleted_at IS NULL;

-- 1. The fallback rate for anything sold from here on.
UPDATE public.products
   SET "costPrice" = 33
 WHERE id = 'PROD-1778591834706-vj3wr';
