-- Phase 1a — tag each sale with the store/location it was rung at.
--
-- process_sale already resolves v_source_location (from p_location_id or
-- the tenant's default warehouse) for stock deduction. We add a
-- location_id column to sales and persist that resolved location on the
-- sale row, so the Day Book and reports can segment by store. Existing
-- and single-store sales auto-tag to the default warehouse; the web POS
-- store selector passes p_location_id for multi-store tenants.
--
-- The full process_sale body was updated in place (same 14-arg
-- signature) — see the dashboard migration of the same name. The only
-- change is `location_id` added to the sales INSERT column list with the
-- value v_source_location.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS location_id uuid;
CREATE INDEX IF NOT EXISTS idx_sales_tenant_location_date
  ON public.sales (tenant_id, location_id, date);
