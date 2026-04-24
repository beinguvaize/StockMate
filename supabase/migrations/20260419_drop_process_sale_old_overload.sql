-- Drop old 9-arg process_sale overload.
--
-- Bug: two overloads coexisted after 20260419_process_sale_tenant_override.sql
-- added a 10-arg version (with p_tenant_id). PostgREST could not disambiguate
-- the RPC call from the client (which passes p_tenant_id as a named arg), so
-- every sale checkout silently failed — no row in public.sales, nothing in
-- history. Keep only the 10-arg version.

DROP FUNCTION IF EXISTS public.process_sale(
  p_id text, p_shop_id text, p_items jsonb, p_total_amount numeric,
  p_payment_method text, p_payment_status text, p_date text,
  p_user_id text, p_location_id uuid
);
