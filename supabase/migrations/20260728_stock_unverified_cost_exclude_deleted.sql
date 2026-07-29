-- The view never excluded soft-deleted batches or products, so a deleted lot
-- would keep counting toward unverified stock value. 0 rows are affected today,
-- so no reported figure changes — this stops it drifting once deletions happen.
--
-- security_invoker is restated because CREATE OR REPLACE VIEW drops reloptions,
-- which would silently reopen the RLS bypass fixed in
-- 20260728_views_security_invoker.sql.

CREATE OR REPLACE VIEW public.stock_unverified_cost AS
SELECT b.tenant_id,
       b.id            AS batch_id,
       b.product_id,
       p.name          AS product_name,
       b.origin,
       b.cost_basis,
       b.received_date,
       (CURRENT_DATE - b.received_date)            AS age_days,
       b.unit_cost,
       b.qty_remaining,
       ROUND(b.qty_remaining * b.unit_cost, 2)     AS value_at_risk,
       (SELECT COUNT(*) FROM public.sale_batch_consumption c WHERE c.batch_id = b.id) AS sold_rows
FROM public.product_batches b
JOIN public.products p ON p.id = b.product_id
WHERE b.qty_remaining > 0
  AND b.cost_basis <> 'SUPPLIER_BILL'
  AND b.deleted_at IS NULL
  AND p.deleted_at IS NULL;

ALTER VIEW public.stock_unverified_cost SET (security_invoker = on);
GRANT SELECT ON public.stock_unverified_cost TO authenticated;
