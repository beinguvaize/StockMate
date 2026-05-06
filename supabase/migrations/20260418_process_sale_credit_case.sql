-- process_sale: credit balance update was case-sensitive on 'Credit',
-- but the client POS sends 'CREDIT' (uppercase). Result: credit sales
-- completed successfully but never incremented clients.outstanding_balance,
-- silently corrupting AR totals.
--
-- Fix: compare on UPPER(p_payment_method) so any casing resolves correctly.
-- Also coerce NULL shopId away from the UPDATE (walk-in credit is nonsensical
-- but we guard anyway to avoid silent no-op writes).

CREATE OR REPLACE FUNCTION public.process_sale(
  p_id text,
  p_shop_id text,
  p_items jsonb,
  p_total_amount numeric,
  p_payment_method text,
  p_payment_status text,
  p_date text,
  p_user_id text,
  p_location_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  item record;
  v_tenant_id UUID;
  v_source_location UUID;
BEGIN
  -- Resolve tenant_id from the calling user
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = p_user_id LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'User not found or has no tenant assignment';
  END IF;

  -- Resolve location: explicit param, otherwise tenant's warehouse (auto-create if missing)
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

  -- Insert the sale with tenant_id
  INSERT INTO public.sales (id, "shopId", items, "totalAmount", "paymentMethod", "paymentStatus", date, "bookedBy", tenant_id, "vehicleId")
  VALUES (
    p_id, p_shop_id, p_items, p_total_amount, p_payment_method, p_payment_status, p_date, p_user_id, v_tenant_id,
    (SELECT reference_id FROM public.inventory_locations WHERE id = v_source_location AND type = 'VEHICLE')
  );

  -- Deduct stock and log movements
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

  -- Credit sale => bump client outstanding_balance.
  -- Case-insensitive: accept 'Credit', 'CREDIT', 'credit' etc.
  -- Also require a real shop_id; walk-in credit is a no-op.
  IF UPPER(COALESCE(p_payment_method, '')) = 'CREDIT' AND p_shop_id IS NOT NULL THEN
    UPDATE public.clients
    SET outstanding_balance = COALESCE(outstanding_balance, 0) + p_total_amount
    WHERE id = p_shop_id AND tenant_id = v_tenant_id;
  END IF;
END;
$function$;
