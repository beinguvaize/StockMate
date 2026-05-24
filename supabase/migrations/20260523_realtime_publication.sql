-- Mobile + web rely on postgres_changes events to invalidate providers
-- when another device mutates rows. Only `users` was in supabase_realtime,
-- so stock edits on the web never pushed to the mobile app. Add every
-- business table both apps read.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-23.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.products, public.product_batches, public.product_categories,
  public.inventory_balances, public.inventory_locations,
  public.warehouses, public.warehouse_stock,
  public.sales, public.sales_returns, public.sale_batch_consumption,
  public.invoices, public.purchases, public.purchase_returns,
  public.purchase_orders, public.purchase_order_items,
  public.clients, public.client_payments, public.client_notes,
  public.suppliers, public.expenses, public.day_book,
  public.vehicles, public.vehicle_locations, public.vehicle_stock_movements,
  public.van_trip_stock_log, public.van_damage_records,
  public.routes, public.route_stops,
  public.employees, public.payroll,
  public.production_orders, public.production_order_materials, public.production_costs,
  public.bom, public.bom_components,
  public.estimates, public.estimate_items,
  public.delivery_challans, public.delivery_challan_items,
  public.stock_transfers, public.stock_transfer_items,
  public.bank_accounts, public.bank_transactions, public.cheques,
  public.tasks, public.user_roles;
