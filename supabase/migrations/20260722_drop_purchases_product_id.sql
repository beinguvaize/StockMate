-- Drop purchases.product_id.
--
-- It duplicated linked_product_id and was written only at insert, so every
-- re-linked purchase left the two disagreeing. That drift is what stranded
-- PUR-E6PRCT's 750-unit lot on the wrong product for a month.
--
-- Safe to drop: of 173 rows, none carried a product_id without a
-- linked_product_id, and none had both null. The 4 rows that still disagreed
-- held the stale value, so this removes wrong data, not real data. Full
-- before-image kept in public._purchases_product_id_20260722.
--
-- Order matters. Writers went first (process_purchase stopped inserting it,
-- resync_purchase_batch stopped updating it), then the two readers in
-- PurchasesReport.jsx, then the column.
--
-- process_purchase is reproduced with its signature byte-identical, INCLUDING
-- p_bill_no. Changing an argument list creates a NEW overload and every caller
-- breaks with "function is not unique".

DROP INDEX IF EXISTS public.idx_purchases_product;

ALTER TABLE public.purchases DROP COLUMN IF EXISTS product_id;
