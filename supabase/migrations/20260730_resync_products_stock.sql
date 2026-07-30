-- DATA REPAIR for FUTURE DISPO. Applied once. Snapshot:
-- snap.products_stock_resync_20260730 (90-day retention).
--
-- products.stock is a derived mirror of inventory_balances, maintained by
-- trg_sync_product_stock. On 47 products it had drifted, every one of them
-- UNDER-reporting: 339 units of stock the balances held but no screen showed.
-- Worst were 13*16 Pkt Cover (1,095 shown vs 1,195 held) and Tissue Big
-- (330 vs 410).
--
-- The trigger only fires when inventory_balances changes, so a row that drifted
-- for any other reason stayed wrong indefinitely. This restores the invariant;
-- it does not change the underlying stock.

UPDATE public.products p
   SET stock = COALESCE(bal.q, 0)
  FROM (SELECT product_id, sum(quantity)::numeric q
          FROM public.inventory_balances
         WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
         GROUP BY 1) bal
 WHERE bal.product_id = p.id
   AND p.tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
   AND p.deleted_at IS NULL
   AND p.stock::numeric <> COALESCE(bal.q, 0);
