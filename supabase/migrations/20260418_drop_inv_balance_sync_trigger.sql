-- trg_sync_product_stock on inventory_balances recomputed
--   products.stock = SUM(inventory_balances.quantity)
-- on every write. Legacy tenants have products.stock > 0 but zero or missing
-- matching inventory_balances rows, so the trigger nuked real stock to 0 on
-- the first sale (e.g. iPhone: 11 -> 0 after one sold unit).
--
-- process_sale already maintains products.stock via an explicit UPDATE, so
-- the auto-sync is both broken (drift) and redundant. Detach the trigger.
-- The function stays so it can be rewired with a proper backfill in future.

DROP TRIGGER IF EXISTS trg_sync_product_stock ON public.inventory_balances;
