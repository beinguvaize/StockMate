-- Hot-path indexes. Every report and most app reads filter by
-- tenant_id + date / FK. Composite (tenant_id, date desc) chosen where
-- the dominant query is "this tenant, ordered/filtered by date".
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-25.

-- sales
create index if not exists idx_sales_tenant_date    on public.sales (tenant_id, date desc);
create index if not exists idx_sales_tenant_created on public.sales (tenant_id, created_at desc);
create index if not exists idx_sales_route          on public.sales (route_id);

-- purchases / returns
create index if not exists idx_purchases_tenant_date    on public.purchases (tenant_id, date desc);
create index if not exists idx_purchases_tenant_created on public.purchases (tenant_id, created_at desc);
create index if not exists idx_purchases_product        on public.purchases (product_id);
create index if not exists idx_purchases_supplier       on public.purchases (supplier_id);
create index if not exists idx_purchase_returns_tenant_date on public.purchase_returns (tenant_id, date desc);
create index if not exists idx_purchase_returns_purchase    on public.purchase_returns (purchase_id);
create index if not exists idx_purchase_returns_product     on public.purchase_returns (product_id);
create index if not exists idx_purchase_returns_supplier    on public.purchase_returns (supplier_id);
create index if not exists idx_purchase_returns_created     on public.purchase_returns (created_at desc);

-- invoices
create index if not exists idx_invoices_tenant_date    on public.invoices (tenant_id, date desc);
create index if not exists idx_invoices_tenant_created on public.invoices (tenant_id, created_at desc);
create index if not exists idx_invoices_client         on public.invoices (client_id);

-- clients / suppliers
create index if not exists idx_clients_created   on public.clients (created_at desc);
create index if not exists idx_suppliers_tenant  on public.suppliers (tenant_id);
create index if not exists idx_suppliers_created on public.suppliers (created_at desc);

-- client_payments
create index if not exists idx_client_payments_tenant_date on public.client_payments (tenant_id, date desc);
create index if not exists idx_client_payments_created     on public.client_payments (created_at desc);

-- expenses
create index if not exists idx_expenses_tenant_date    on public.expenses (tenant_id, date desc);
create index if not exists idx_expenses_tenant_created on public.expenses (tenant_id, created_at desc);
create index if not exists idx_expenses_route          on public.expenses (route_id);

-- inventory / product batches
create index if not exists idx_product_batches_tenant_product on public.product_batches (tenant_id, product_id);
create index if not exists idx_product_batches_supplier       on public.product_batches (supplier_id);
create index if not exists idx_product_batches_created        on public.product_batches (created_at desc);
create index if not exists idx_inventory_balances_tenant_product on public.inventory_balances (tenant_id, product_id);

-- sales_returns
create index if not exists idx_sales_returns_tenant_date on public.sales_returns (tenant_id, date desc);
create index if not exists idx_sales_returns_sale        on public.sales_returns (sale_id);
create index if not exists idx_sales_returns_invoice     on public.sales_returns (invoice_id);
create index if not exists idx_sales_returns_client      on public.sales_returns (client_id);
create index if not exists idx_sales_returns_created     on public.sales_returns (created_at desc);

-- routes / route_stops
create index if not exists idx_routes_tenant_date on public.routes (tenant_id, date desc);
create index if not exists idx_routes_created     on public.routes (created_at desc);
create index if not exists idx_route_stops_client on public.route_stops (client_id);
create index if not exists idx_route_stops_invoice on public.route_stops (invoice_id);
create index if not exists idx_route_stops_created on public.route_stops (created_at desc);

-- van / vehicle movements
create index if not exists idx_vehicle_movements_tenant   on public.vehicle_stock_movements (tenant_id, created_at desc);
create index if not exists idx_vehicle_movements_vehicle  on public.vehicle_stock_movements (vehicle_id);
create index if not exists idx_vehicle_movements_product  on public.vehicle_stock_movements (product_id);
create index if not exists idx_van_trip_stock_log_tenant  on public.van_trip_stock_log (tenant_id, created_at desc);
create index if not exists idx_van_trip_stock_log_vehicle on public.van_trip_stock_log (vehicle_id);
create index if not exists idx_van_trip_stock_log_route   on public.van_trip_stock_log (route_id);
create index if not exists idx_van_trip_stock_log_product on public.van_trip_stock_log (product_id);

-- day_book / audit / movement / GL
create index if not exists idx_day_book_tenant_date     on public.day_book (tenant_id, date desc);
create index if not exists idx_day_book_created         on public.day_book (created_at desc);
create index if not exists idx_audit_log_tenant_created on public.audit_log (tenant_id, created_at desc);
create index if not exists idx_movement_log_tenant_date on public.movement_log (tenant_id, date desc);
create index if not exists idx_movement_log_product     on public.movement_log (product_id);
create index if not exists idx_movement_log_user        on public.movement_log (user_id);
create index if not exists idx_movement_log_created     on public.movement_log (created_at desc);
create index if not exists idx_gl_journals_tenant_date  on public.gl_journals (tenant_id, date desc);
create index if not exists idx_gl_journals_created      on public.gl_journals (created_at desc);
create index if not exists idx_gl_lines_tenant          on public.gl_lines (tenant_id);
create index if not exists idx_gl_lines_created         on public.gl_lines (created_at desc);

-- production
create index if not exists idx_production_orders_created on public.production_orders (created_at desc);

analyze public.sales, public.purchases, public.invoices, public.clients,
        public.client_payments, public.product_batches, public.sales_returns;
