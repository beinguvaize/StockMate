-- ==============================================================
-- FLOW-02: Restoration of Atomic Dependency Helpers
-- ==============================================================

-- 1. Helper: Atomic Inventory Adjustment & Movement Logging
CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_product_id text, 
    p_location_id uuid, 
    p_amount numeric, 
    p_reason text, 
    p_user_id text, 
    p_tenant_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_actual_location_id uuid := p_location_id;
    v_main_warehouse_id  uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- Resolve warehouse location if none provided (Safe Fallback)
    IF v_actual_location_id IS NULL THEN
        SELECT id INTO v_actual_location_id
        FROM public.inventory_locations
        WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE'
        LIMIT 1;

        IF v_actual_location_id IS NULL THEN
            v_actual_location_id := v_main_warehouse_id;
        END IF;
    END IF;

    -- Upsert into inventory_balances — fires trg_sync_product_stock (Single Source of Truth)
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
    VALUES (p_product_id, v_actual_location_id, p_amount, p_tenant_id)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET
        quantity   = GREATEST(0, public.inventory_balances.quantity + EXCLUDED.quantity),
        updated_at = NOW();

    -- Record movement log for audit trail
    INSERT INTO public.movement_log (id, product_id, type, quantity, reason, user_id, tenant_id, date)
    VALUES (
        'LOG-' || floor(extract(epoch from now())) || '-' || substr(md5(random()::text), 1, 5),
        p_product_id,
        CASE WHEN p_amount >= 0 THEN 'IN' ELSE 'OUT' END,
        ABS(p_amount),
        p_reason,
        p_user_id,
        p_tenant_id,
        NOW()
    );
END;
$$;

-- 2. Helper: Client Balance Management for Credit Sales
CREATE OR REPLACE FUNCTION public.apply_client_balance_delta(
    p_client_id text, 
    p_delta numeric, 
    p_tenant_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.clients
  SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) + p_delta)
  WHERE id = p_client_id AND tenant_id = p_tenant_id;
END;
$$;

-- 3. Utility: Simple Stock Delta (Fallback/Direct use)
CREATE OR REPLACE FUNCTION public.apply_product_stock_delta(
    p_product_id text, 
    p_delta numeric, 
    p_tenant_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.products
  SET stock = GREATEST(0, COALESCE(stock, 0) + p_delta)
  WHERE id = p_product_id AND tenant_id = p_tenant_id;
END;
$$;
