-- process_sale: previously resolved tenant_id only from the caller's users row,
-- which ignored GLOBAL_ADMIN impersonation. When a super-admin impersonated
-- another tenant via the UI and placed a sale, the row was written under the
-- admin's home tenant — invisible in the impersonated tenant's history.
--
-- Fix: accept an optional p_tenant_id override. Honor it only when the caller
-- is GLOBAL_ADMIN (checked against public.users.roles). Non-admins always get
-- their own tenant, regardless of what the client sends (defence-in-depth).

CREATE OR REPLACE FUNCTION public.process_sale(
  p_id text,
  p_shop_id text,
  p_items jsonb,
  p_total_amount numeric,
  p_payment_method text,
  p_payment_status text,
  p_date text,
  p_user_id text,
  p_location_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  item record;
  v_tenant_id UUID;
  v_user_tenant UUID;
  v_is_admin BOOLEAN;
  v_source_location UUID;
BEGIN
  -- Resolve caller's own tenant + admin status
  SELECT tenant_id, (roles @> ARRAY['GLOBAL_ADMIN']::text[])
    INTO v_user_tenant, v_is_admin
  FROM public.users WHERE id = p_user_id LIMIT 1;

  IF v_user_tenant IS NULL THEN
    RAISE EXCEPTION 'User not found or has no tenant assignment';
  END IF;

  -- Tenant resolution: admin override allowed, else caller's own tenant
  IF p_tenant_id IS NOT NULL AND COALESCE(v_is_admin, FALSE) THEN
    v_tenant_id := p_tenant_id;
  ELSE
    v_tenant_id := v_user_tenant;
  END IF;

  -- Resolve location: explicit param, otherwise tenant's warehouse
  IF p_location_id IS NOT NULL THEN
    v_source_location := p_location_id;
  ELSE
    SELECT id INTO v_source_location
    FROM public.inventory_locations
    WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

    IF v_source_location IS NULL THEN
      INSERT INTO public.inventory_locations (id, tenant_id, name, type)
      VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse', 'WAREHOUSE')
      RETURNING id INTO v_source_location;
    END IF;
  END IF;

  INSERT INTO public.sales (id, "shopId", items, "totalAmount", "paymentMethod", "paymentStatus", date, "bookedBy", tenant_id, "vehicleId")
  VALUES (
    p_id, p_shop_id, p_items, p_total_amount, p_payment_method, p_payment_status, p_date, p_user_id, v_tenant_id,
    (SELECT reference_id FROM public.inventory_locations WHERE id = v_source_location AND type = 'VEHICLE')
  );

  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id text, quantity numeric, name text) LOOP
    UPDATE public.products
    SET stock = GREATEST(0, COALESCE(stock, 0) - item.quantity)
    WHERE id = item.id AND tenant_id = v_tenant_id;

    INSERT INTO public.inventory_balances (location_id, product_id, quantity, tenant_id)
    VALUES (v_source_location, item.id, 0, v_tenant_id)
    ON CONFLICT (location_id, product_id, tenant_id) DO NOTHING;

    UPDATE public.inventory_balances
    SET quantity = GREATEST(0, quantity - item.quantity),
        updated_at = now()
    WHERE location_id = v_source_location
      AND product_id = item.id
      AND tenant_id = v_tenant_id;

    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (gen_random_uuid()::text, p_date, item.id, item.name, 'OUT', item.quantity, 'Sale: ' || p_id, p_user_id, v_tenant_id);
  END LOOP;

  IF UPPER(COALESCE(p_payment_method, '')) = 'CREDIT' AND p_shop_id IS NOT NULL THEN
    UPDATE public.clients
    SET outstanding_balance = COALESCE(outstanding_balance, 0) + p_total_amount
    WHERE id = p_shop_id AND tenant_id = v_tenant_id;
  END IF;
END;
$function$;
