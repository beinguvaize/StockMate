-- ============================================================
-- Add sale_type and route_id to sales table
-- Update process_sale RPC to auto-classify sale type
-- ============================================================

-- 1. Add columns
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'POS',
  ADD COLUMN IF NOT EXISTS route_id  TEXT;
-- sale_type: 'POS' | 'VAN_SALE' | 'DELIVERY' | 'PRE_ORDER'
-- route_id:  references routes(id), set when sale made on a van route

COMMENT ON COLUMN public.sales.sale_type IS 'POS=counter, VAN_SALE=driver sale on route, DELIVERY=fulfilled pre-order';
COMMENT ON COLUMN public.sales.route_id  IS 'Route the van sale was made on, if any';

-- 2. Index for filtering van sales per route
CREATE INDEX IF NOT EXISTS idx_sales_route_id
  ON public.sales (tenant_id, route_id)
  WHERE route_id IS NOT NULL;

-- 3. Update process_sale to accept p_route_id and auto-set sale_type
CREATE OR REPLACE FUNCTION public.process_sale(
  p_id             TEXT,
  p_shop_id        TEXT,
  p_items          JSONB,
  p_total_amount   NUMERIC,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_date           TEXT,
  p_user_id        TEXT,
  p_location_id    UUID    DEFAULT NULL,
  p_tenant_id      UUID    DEFAULT NULL,
  p_route_id       TEXT    DEFAULT NULL   -- NEW: links van sale to a route
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item             RECORD;
  v_tenant_id      UUID;
  v_user_tenant    UUID;
  v_is_admin       BOOLEAN;
  v_source_location UUID;
  v_location_type  TEXT;
  v_sale_type      TEXT;
BEGIN
  -- Resolve caller tenant + admin status
  SELECT tenant_id, (roles @> ARRAY['GLOBAL_ADMIN']::text[])
    INTO v_user_tenant, v_is_admin
  FROM public.users WHERE id = p_user_id LIMIT 1;

  IF v_user_tenant IS NULL THEN
    RAISE EXCEPTION 'User not found or has no tenant assignment';
  END IF;

  -- Admin can override tenant
  IF p_tenant_id IS NOT NULL AND COALESCE(v_is_admin, FALSE) THEN
    v_tenant_id := p_tenant_id;
  ELSE
    v_tenant_id := v_user_tenant;
  END IF;

  -- Resolve source inventory location
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

  -- Auto-classify sale_type from location type
  SELECT type INTO v_location_type
  FROM public.inventory_locations
  WHERE id = v_source_location;

  v_sale_type := CASE
    WHEN v_location_type = 'VEHICLE' AND p_route_id IS NOT NULL THEN 'VAN_SALE'
    WHEN v_location_type = 'VEHICLE'                            THEN 'VAN_SALE'
    ELSE 'POS'
  END;

  -- Insert sale record
  INSERT INTO public.sales (
    id, "shopId", items, "totalAmount", "paymentMethod", "paymentStatus",
    date, "bookedBy", tenant_id, "vehicleId", sale_type, route_id
  )
  VALUES (
    p_id,
    p_shop_id,
    p_items,
    p_total_amount,
    p_payment_method,
    p_payment_status,
    p_date,
    p_user_id,
    v_tenant_id,
    (SELECT reference_id FROM public.inventory_locations WHERE id = v_source_location AND type = 'VEHICLE'),
    v_sale_type,
    p_route_id
  );

  -- Deduct inventory per item
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id TEXT, quantity NUMERIC, name TEXT) LOOP
    -- Ensure balance row exists
    INSERT INTO public.inventory_balances (location_id, product_id, quantity, tenant_id)
    VALUES (v_source_location, item.id, 0, v_tenant_id)
    ON CONFLICT (location_id, product_id, tenant_id) DO NOTHING;

    -- Deduct
    UPDATE public.inventory_balances
    SET quantity   = GREATEST(0, quantity - item.quantity),
        updated_at = NOW()
    WHERE location_id = v_source_location
      AND product_id  = item.id
      AND tenant_id   = v_tenant_id;

    -- Also deduct products.stock (legacy field)
    UPDATE public.products
    SET stock = GREATEST(0, COALESCE(stock, 0) - item.quantity)
    WHERE id = item.id AND tenant_id = v_tenant_id;

    -- Movement log
    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (
      gen_random_uuid()::text,
      p_date,
      item.id,
      item.name,
      'OUT',
      item.quantity,
      CASE WHEN v_sale_type = 'VAN_SALE'
           THEN 'Van Sale: ' || p_id || COALESCE(' (Route: ' || p_route_id || ')', '')
           ELSE 'Sale: ' || p_id
      END,
      p_user_id,
      v_tenant_id
    );
  END LOOP;

  -- Credit client balance for CREDIT sales
  IF UPPER(COALESCE(p_payment_method, '')) = 'CREDIT' AND p_shop_id IS NOT NULL THEN
    UPDATE public.clients
    SET outstanding_balance = COALESCE(outstanding_balance, 0) + p_total_amount
    WHERE id = p_shop_id AND tenant_id = v_tenant_id;
  END IF;
END;
$$;
