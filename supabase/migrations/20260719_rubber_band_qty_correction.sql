-- NOT APPLIED. Needs two real numbers before it can be run — see below.
--
-- Two RUBBER BAND sale lines were entered as quantity 1 KG with the part-unit
-- price typed into the rate field:
--
--   SAL-4A002748  2026-06-08  qty 1 KG @ ₹60
--   SAL-30B7AE71  2026-07-09  qty 1 KG @ ₹72
--
-- The product costs ₹270/KG and lists at ₹290/KG, so both lines book a loss
-- and RUBBER BAND shows −36.8% margin in the Business Report. The cost price
-- is NOT wrong; the quantity is.
--
-- Effects of the error:
--   * revenue is correct — the customer paid ₹60 / ₹72 and that is recorded
--   * COGS overstated by roughly ₹417 (₹540 booked against ~₹123 real)
--   * products.stock under-deducted: book 34 KG, shelf likely ~35.5 KG
--   * neither line consumed a product_batches row (sale_batch_consumption is
--     empty for this product on both sales), so COGS came from the costPrice
--     fallback and batch quantities are untouched by the fix
--
-- WHY THIS IS NOT FILLED IN
-- Dividing price by list rate implies ~0.207 KG and ~0.248 KG, but that
-- assumes both were sold at exactly ₹290/KG with no discount and no
-- pre-packed size. Nothing in the database records what was actually handed
-- over. Writing an inferred quantity would put a fabricated figure into a
-- live customer's books, so the real numbers must come from outside:
--
--   Easiest source: RUBBER BAND is already on the stock-count list. Count it.
--   shelf_qty − 34 = the total over-deduction, which splits across these two
--   lines in proportion to their prices (60 : 72).
--
-- Set these two, then run inside one transaction:
--   :qty_june  -- real KG sold on SAL-4A002748  (₹60)
--   :qty_july  -- real KG sold on SAL-30B7AE71  (₹72)

BEGIN;

-- Snapshot first. Keep this output; it is the revert path.
CREATE TEMP TABLE rb_before AS
SELECT s.id, s."totalCogs", s.items,
       (SELECT stock FROM products WHERE id='PROD-1780658004799-7ba4r') AS product_stock
FROM sales s
WHERE s.id IN ('SAL-4A002748','SAL-30B7AE71');
SELECT * FROM rb_before;

-- 1. Correct the quantity on the RUBBER BAND line, leaving rate and every
--    other line untouched so totalAmount still matches what was charged.
UPDATE sales s
   SET items = (
     SELECT jsonb_agg(
       CASE WHEN elem->>'id' = 'PROD-1780658004799-7ba4r'
            THEN jsonb_set(elem, '{quantity}', to_jsonb(v.qty))
            ELSE elem END)
     FROM jsonb_array_elements(s.items) elem)
  FROM (VALUES ('SAL-4A002748', :qty_june::numeric),
               ('SAL-30B7AE71', :qty_july::numeric)) AS v(sale_id, qty)
 WHERE s.id = v.sale_id;

-- 2. Rebase totalCogs: remove the 1 KG that was charged, add the real amount.
UPDATE sales s
   SET "totalCogs" = GREATEST(0, COALESCE(s."totalCogs",0) - 270 + (v.qty * 270))
  FROM (VALUES ('SAL-4A002748', :qty_june::numeric),
               ('SAL-30B7AE71', :qty_july::numeric)) AS v(sale_id, qty)
 WHERE s.id = v.sale_id;

-- 3. Return the over-deducted stock.
UPDATE products
   SET stock = COALESCE(stock,0) + ((1 - :qty_june::numeric) + (1 - :qty_july::numeric)),
       updated_at = NOW()
 WHERE id = 'PROD-1780658004799-7ba4r'
   AND tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3';

-- 4. Audit trail, so the adjustment is not itself an unexplained correction.
INSERT INTO movement_log (id, date, product_id, product_name, type, quantity, reason, tenant_id)
VALUES (gen_random_uuid()::text, to_char(NOW(),'YYYY-MM-DD'),
        'PROD-1780658004799-7ba4r', 'RUBBER BAND', 'IN',
        (1 - :qty_june::numeric) + (1 - :qty_july::numeric),
        'Qty correction: SAL-4A002748 + SAL-30B7AE71 booked 1 KG each, part-unit price in rate field',
        'fd4927bf-c084-4bed-ba13-d30e650da6f3');

-- Verify before committing: margin should turn positive and stock should match
-- the physical count.
SELECT p.stock AS stock_after,
       (SELECT round(sum((i->>'quantity')::numeric)::numeric,3)
          FROM sales s, LATERAL jsonb_array_elements(s.items) i
         WHERE s.tenant_id=p.tenant_id AND s.deleted_at IS NULL AND s.voided_at IS NULL
           AND i->>'id'=p.id) AS qty_sold_after
FROM products p WHERE p.id='PROD-1780658004799-7ba4r';

-- ROLLBACK; -- default: inspect, then swap to COMMIT deliberately
COMMIT;
