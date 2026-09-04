-- Applied to prod 1 Sep 2026.
--
-- Realtime was ~56% of all database time on this instance with ONE active
-- business. Every write to a published table is decoded from WAL and matched
-- against subscription rules whether or not anyone is listening, so the
-- publication is the second half of the diet in src/lib/realtime.js.
--
-- Fourteen tables were published; eight still have a subscriber. Dropped:
--
--   users            AuthContext watched it for role changes — guarded off
--                    ('auth' is not a live surface); a role change now needs
--                    a reload.
--   bug_reports      admin panel channel — guarded off, it has a refetch.
--   vehicles         only ever reached via useReportData, whose per-table
--                    channels are off ('reports'). VehicleLiveMap subscribes
--                    to vehicle_locations, which STAYS.
--   client_payments  no subscriber on any platform.
--   product_batches  no subscriber on any platform.
--   suppliers        no subscriber on any platform.
--
-- KEPT — do not trim without re-checking MOBILE, which has had no diet and
-- whose installed builds (v1.7.8) still subscribe:
--   sales, invoices        web useSales + mobile realtime_sync
--   clients, expenses,
--   products, purchases    mobile realtime_sync / inventory_provider
--   inventory_balances     mobile driver_provider .stream()
--   vehicle_locations      web VehicleLiveMap
--
-- WHAT THIS DOES NOT DO: it trims the work per WAL poll. The polling loop
-- itself runs on a fixed ~2s timer regardless of subscribers and is the larger
-- half of that 56%. Do not expect the number to halve.
--
-- Dropping a table here is SILENT for any client still subscribing — the
-- channel just never fires, exactly as `orders` and `routes`/`route_stops`
-- already do, having never been published at all. An old desktop or mobile
-- build therefore degrades to its focus/interval refetch rather than erroring.
--
-- Baseline for measuring later without resetting a month of history:
--   2026-09-01 00:55 UTC — WAL poll 1,430,096 calls / 12,092,704 ms
--                          sub_tables  26,739 calls /  1,706,886 ms
--                          realtime = 56% of total exec time

ALTER PUBLICATION supabase_realtime DROP TABLE
  public.users,
  public.bug_reports,
  public.vehicles,
  public.client_payments,
  public.product_batches,
  public.suppliers;

-- To restore one: ALTER PUBLICATION supabase_realtime ADD TABLE public.<name>;
