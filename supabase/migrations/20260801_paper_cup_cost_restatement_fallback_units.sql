-- Completes the two paper cup cost restatements.
--
-- 13cd686 (210 Ml, Rs 38 -> 33) and a7bd88e (150 Ml, Rs 25 -> 28) derived each
-- sale's adjustment from its sale_batch_consumption rows. That reached only the
-- units FIFO actually allocated against a batch:
--
--     210 Ml   2,510 sold   603 restated   1,907 left at Rs 38
--     150 Ml     286 sold   220 restated      66 left at Rs 25
--
-- The remainder were sold while the product held no batch stock. FIFO cannot
-- allocate what is not there, so costing fell back to products."costPrice" and
-- wrote a lump into sales."totalCogs" with no per-batch trail for the earlier
-- migrations to drive a delta from. Those sales still carry the old rate, so
-- "all time" was not true.
--
-- This restates them, driven off the invoice lines instead of the consumption
-- rows. Per sale and per product:
--
--     fallback units = invoiced qty - qty allocated from batches
--     delta          = fallback units x (new rate - old rate)
--
-- ASSUMPTION, and the one thing to re-check if these numbers are ever
-- questioned: the fallback costed at the then-current "costPrice" of Rs 38 and
-- Rs 25. Confirmed against every single-line invoice of these two products
-- across May, June and July - each implied exactly Rs 38.00 or Rs 25.00, and
-- none drifted. Multi-line invoices cannot be decomposed to prove it directly.
--
-- Effect: COGS falls a further Rs 9,337 (May 616, June 4,800, July 3,921), so
-- historic gross profit rises by the same. July gross margin 15.0% -> 16.2%.
--
-- Stock values are untouched - this concerns sold units only.

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.paper_cup_fallback_sales_20260801 AS
WITH s AS (
  SELECT id, items::jsonb arr FROM public.sales
  WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3' AND deleted_at IS NULL
), inv AS (
  SELECT s.id, li->>'id' AS pid, sum((li->>'quantity')::numeric) AS q
  FROM s CROSS JOIN LATERAL jsonb_array_elements(s.arr) li
  WHERE li->>'id' IN ('PROD-1778591834706-vj3wr','PROD-1778591878857-e8yh2')
  GROUP BY 1,2
), con AS (
  SELECT sbc.sale_id AS id, pb.product_id AS pid, sum(sbc.qty_taken) AS q
  FROM public.sale_batch_consumption sbc
  JOIN public.product_batches pb ON pb.id = sbc.batch_id
  WHERE pb.product_id IN ('PROD-1778591834706-vj3wr','PROD-1778591878857-e8yh2')
  GROUP BY 1,2
)
SELECT sa.id, sa."totalCogs" AS cogs_before, sa."totalAmount", sa.date,
       sum(CASE WHEN inv.pid = 'PROD-1778591834706-vj3wr'
                THEN GREATEST(inv.q - COALESCE(con.q,0), 0) ELSE 0 END) AS fallback_210,
       sum(CASE WHEN inv.pid = 'PROD-1778591878857-e8yh2'
                THEN GREATEST(inv.q - COALESCE(con.q,0), 0) ELSE 0 END) AS fallback_150
FROM inv
LEFT JOIN con ON con.id = inv.id AND con.pid = inv.pid
JOIN public.sales sa ON sa.id = inv.id
GROUP BY sa.id, sa."totalCogs", sa."totalAmount", sa.date;

-- No sale may end up with negative cost of goods.
DO $$
DECLARE v_neg int;
BEGIN
  SELECT count(*) INTO v_neg FROM snap.paper_cup_fallback_sales_20260801 f
  JOIN public.sales s ON s.id = f.id
  WHERE s."totalCogs" - f.fallback_210 * 5 + f.fallback_150 * 3 < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION '% sale(s) would go to negative COGS - aborting', v_neg;
  END IF;
END $$;

UPDATE public.sales s
   SET "totalCogs" = s."totalCogs" - f.fallback_210 * 5 + f.fallback_150 * 3
  FROM snap.paper_cup_fallback_sales_20260801 f
 WHERE s.id = f.id
   AND (f.fallback_210 > 0 OR f.fallback_150 > 0);
