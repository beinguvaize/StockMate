-- process_sale and process_purchase_return are SECURITY DEFINER but had no
-- fixed search_path, so they resolved unqualified names against whatever the
-- caller's search_path happened to be. A SECURITY DEFINER function runs as its
-- owner, so a caller able to create a schema earlier in that path could have
-- `purchases` or `products` resolve to a table of their own.
--
-- Every other money function already pins it: process_purchase,
-- settle_supplier_payment, settle_purchase_payment, apply_supplier_advances,
-- offset_supplier_credit_note, settle_client_payment, post_expense_to_ledger.
-- These two were the exceptions. Flagged by the Supabase security advisor
-- (function_search_path_mutable), 51 findings tenant-wide; these two are the
-- ones that move money and stock.
--
-- Safe for both, checked before applying: neither body references another
-- schema, adjust_inventory_atomic is in public, and gen_random_uuid exists in
-- pg_catalog as well as extensions -- pg_catalog is implicitly searched
-- whatever search_path says. Bodies are untouched; this only fixes how names
-- resolve.
--
-- Signatures written in full. Both have exactly one overload today, and naming
-- every argument means this fails loudly rather than silently picking one if a
-- second is ever added -- the overload trap that has bitten this schema before.
--
-- Verified after applying: process_sale was called inside a transaction that
-- was then rolled back. It ran end to end -- wrote the sale, moved stock,
-- computed COGS -- proving every name still resolves at runtime, which static
-- inspection cannot show for plpgsql. Nothing persisted.

ALTER FUNCTION public.process_sale(
  p_id text, p_shop_id text, p_items jsonb, p_total_amount numeric,
  p_payment_method text, p_payment_status text, p_date text, p_user_id uuid,
  p_location_id uuid, p_route_id text, p_tenant_id uuid, p_delivery_method text,
  p_source_app text, p_paid_amount numeric, p_discount numeric
) SET search_path = public;

ALTER FUNCTION public.process_purchase_return(
  p_id text, p_tenant_id uuid, p_purchase_id text, p_supplier_id uuid,
  p_supplier_name text, p_product_id text, p_product_name text,
  p_quantity numeric, p_unit_price numeric, p_total_amount numeric,
  p_reason text, p_date date, p_location_id uuid
) SET search_path = public;

DO $chk$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('process_sale','process_purchase_return')
    AND (p.proconfig IS NULL
         OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'search_path still unset on: %', v_bad;
  END IF;
END $chk$;
