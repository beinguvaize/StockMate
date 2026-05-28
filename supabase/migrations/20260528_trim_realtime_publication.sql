-- Trim supabase_realtime publication to free Disk IO on Nano compute.
-- 49 tables was eating WAL write bandwidth. Keep only tables UI subscribes
-- to for cross-device push. Apps still read every table; they just won't
-- get realtime events for the dropped ones. Manual refresh + sync covers it.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-28.

do $$
declare
  t text;
  tables text[] := array[
    'audit_log','bank_accounts','bank_transactions','bom','bom_components',
    'cheques','client_notes','day_book','delivery_challan_items','delivery_challans',
    'employees','estimate_items','estimates','inventory_locations','payroll',
    'product_categories','production_costs','production_order_materials','production_orders',
    'purchase_order_items','purchase_orders','purchase_returns','route_stops','routes',
    'sale_batch_consumption','sales_returns','stock_transfer_items','stock_transfers',
    'supplier_payments','tasks','user_roles','van_damage_records','van_trip_stock_log',
    'vehicle_stock_movements','warehouse_stock','warehouses'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime drop table public.%I', t);
    exception when others then
      raise notice 'skip %: %', t, sqlerrm;
    end;
  end loop;
end $$;
