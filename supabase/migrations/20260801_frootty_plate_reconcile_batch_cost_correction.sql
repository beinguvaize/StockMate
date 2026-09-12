-- Frootty plate 12": correct the 16 Jul reconciliation estimate, Rs 114.12 -> Rs 105.66.
--
-- That batch came from the 15 Jul uncosted-stock reconciliation, which had to
-- guess a rate from what was known at the time. RENO JOHN's next bill, dated
-- the following day, priced the same goods at Rs 105.66 - so the estimate was
-- Rs 8.46 too high and there is now a real supplier bill proving it.
--
-- 78 units: 44 still on hand, 34 already sold. Both sides move, or the batch
-- would disagree with its own consumption rows:
--   stock value  44 x 8.46 = Rs 372.24 lower
--   COGS         34 x 8.46 = Rs 287.64 lower  (4 sales, 27 Jul - 1 Aug)
--
-- cost_basis stays ESTIMATED: the figure is now well-founded, but no bill was
-- issued for THESE units, so nothing may claim otherwise.
--
-- products."costPrice" is recomputed at the end rather than set by hand - it is
-- the weighted average of open batches, and this changes one of four.

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.frootty_reconcile_batch_20260801 AS
SELECT * FROM public.product_batches WHERE id = '447e179d-19c5-4fb1-b4f7-8744515af93c';

CREATE TABLE IF NOT EXISTS snap.frootty_reconcile_sales_20260801 AS
SELECT DISTINCT s.id, s."totalCogs" AS cogs_before, s."totalAmount", s.date
FROM public.sales s
JOIN public.sale_batch_consumption sbc ON sbc.sale_id = s.id
WHERE sbc.batch_id = '447e179d-19c5-4fb1-b4f7-8744515af93c';

DO $$
DECLARE v_cost numeric; v_neg int;
BEGIN
  SELECT unit_cost INTO v_cost FROM public.product_batches
  WHERE id = '447e179d-19c5-4fb1-b4f7-8744515af93c' AND deleted_at IS NULL;

  IF v_cost IS DISTINCT FROM 114.12 THEN
    RAISE EXCEPTION 'batch is not at Rs 114.12 (got %) - aborting', v_cost;
  END IF;

  SELECT count(*) INTO v_neg FROM (
    SELECT s.id, max(s."totalCogs") - sum(sbc.qty_taken) * 8.46 AS after
    FROM public.sales s
    JOIN public.sale_batch_consumption sbc ON sbc.sale_id = s.id
    WHERE sbc.batch_id = '447e179d-19c5-4fb1-b4f7-8744515af93c'
    GROUP BY s.id
  ) t WHERE after < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION '% sale(s) would go to negative COGS - aborting', v_neg;
  END IF;
END $$;

-- Roll the delta off each sale first, while consumption still holds Rs 114.12.
UPDATE public.sales s
   SET "totalCogs" = s."totalCogs" - d.delta
  FROM (
    SELECT sbc.sale_id, sum(sbc.qty_taken) * (114.12 - 105.66) AS delta
    FROM public.sale_batch_consumption sbc
    WHERE sbc.batch_id = '447e179d-19c5-4fb1-b4f7-8744515af93c'
    GROUP BY sbc.sale_id
  ) d
 WHERE s.id = d.sale_id;

UPDATE public.sale_batch_consumption
   SET unit_cost = 105.66
 WHERE batch_id = '447e179d-19c5-4fb1-b4f7-8744515af93c';

UPDATE public.product_batches
   SET unit_cost = 105.66,
       note = 'RECONCILE 2026-07-15 uncosted stock. Estimate corrected from '
              || 'Rs 114.12 to Rs 105.66 on 1 Aug 2026, matching RENO JOHN''s '
              || '17 Jul bill for the same goods.'
 WHERE id = '447e179d-19c5-4fb1-b4f7-8744515af93c';

DO $$
BEGIN
  PERFORM public.recompute_product_cost(
    'fd4927bf-c084-4bed-ba13-d30e650da6f3'::uuid, '5DBV3PW2XP');
END $$;
