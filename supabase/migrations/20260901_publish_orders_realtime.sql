-- Applied to prod 1 Sep 2026, right after 20260901_trim_realtime_publication.
--
-- `orders` is listed in LIVE_SURFACES (src/lib/realtime.js) but was never in
-- the publication, so useOrders' channel has never delivered a row and the
-- kitchen display has never actually been live — before or after the realtime
-- diet. The code claimed one thing and the database did another. This makes
-- the database match the claim.
--
-- Cheap now: the table holds 0 rows across 0 tenants, so there is nothing for
-- the WAL decoder to process until someone starts using the KDS.
--
-- Default replica identity is correct. useOrders subscribes with event '*' and
-- a tenant_id filter; a DELETE under REPLICA IDENTITY DEFAULT carries only the
-- primary key and so could never match that filter — but `trg_soft_delete`
-- turns deletes into UPDATEs, which carry the full new row. No hard deletes to
-- miss, so REPLICA IDENTITY FULL would add WAL volume for nothing.
--
-- STILL NOT PUBLISHED, and inert for the same reason: `routes` and
-- `route_stops`, streamed by driver_provider.dart for live van tracking.
-- Separate decision — unlike orders they hold real data, so publishing them
-- adds ongoing WAL work.

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Publication is now 9 tables: clients, expenses, inventory_balances,
-- invoices, orders, products, purchases, sales, vehicle_locations.
