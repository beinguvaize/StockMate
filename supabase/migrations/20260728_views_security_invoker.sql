-- SECURITY FIX: two views bypassed RLS.
--
-- A Postgres view runs as its OWNER unless security_invoker is set. Both of
-- these were created without it, owned by postgres, and granted SELECT to
-- authenticated — so RLS on product_batches / products never applied and any
-- signed-in user of any tenant could read every tenant's rows.
--
--   stock_unverified_cost   batch costs, product names, qty, value at risk
--                           (introduced 20260727_batch_origin_and_cost_basis.sql)
--   v_product_batch_summary per-product stock and weighted-average cost
--                           (pre-existing)
--
-- Neither was referenced by any client, RPC or function, so both were latent
-- rather than actively leaking. Found by sweeping pg_class for every view
-- lacking the flag — worth repeating whenever a view is added.
--
-- With security_invoker = on the view runs as the querying user and the base
-- tables' existing tenant policies apply.

ALTER VIEW public.stock_unverified_cost   SET (security_invoker = on);
ALTER VIEW public.v_product_batch_summary SET (security_invoker = on);
