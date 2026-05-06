-- 20260419_process_purchase_supplier_link.sql
-- Fixes supplier linkage in procurement:
--   1. Cache supplier.name onto purchases.supplier_name at insert time (stable history)
--   2. Bump suppliers.balance on CREDIT purchase (payable tracking)
--   3. Tenant override (GLOBAL_ADMIN impersonation) via p_tenant_id
--   4. Set location via p_location_id override

CREATE OR REPLACE FUNCTION public.process_purchase(
    p_id text,
    p_product_id text,
    p_quantity numeric,
    p_total_amount numeric,
    p_supplier_id text,
    p_payment_type text,
    p_date text,
    p_notes text,
    p_user_id text,
    p_location_id uuid DEFAULT NULL::uuid,
    p_tenant_id uuid DEFAULT NULL::uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_tenant UUID;
  v_is_admin BOOLEAN;
  v_target_location UUID;
  v_supplier_name TEXT;
BEGIN
  -- Resolve tenant with GLOBAL_ADMIN override
  SELECT tenant_id, (roles @> ARRAY['GLOBAL_ADMIN']::text[])
    INTO v_user_tenant, v_is_admin
  FROM public.users WHERE id = p_user_id LIMIT 1;

  IF p_tenant_id IS NOT NULL AND COALESCE(v_is_admin, FALSE) THEN
    v_tenant_id := p_tenant_id;
  ELSE
    v_tenant_id := v_user_tenant;
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant Resolution Failed: User % has no assigned tenant.', p_user_id;
  END IF;

  -- Resolve warehouse
  IF p_location_id IS NOT NULL THEN
    v_target_location := p_location_id;
  ELSE
    SELECT id INTO v_target_location FROM public.inventory_locations
    WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE' LIMIT 1;
  END IF;

  -- Resolve supplier name for denormalized history column (stable even if supplier renamed/deleted)
  SELECT name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = p_supplier_id AND tenant_id = v_tenant_id
  LIMIT 1;

  -- Insert Purchase with supplier_name snapshot
  INSERT INTO public.purchases (
    id, total_amount, date, linked_product_id, product_id,
    supplier_id, supplier_name, payment_type, notes, quantity, tenant_id
  )
  VALUES (
    p_id, p_total_amount, p_date, p_product_id, p_product_id,
    p_supplier_id, v_supplier_name, p_payment_type, p_notes, p_quantity, v_tenant_id
  );

  -- Atomic Inventory Adjustment
  IF p_product_id IS NOT NULL AND v_target_location IS NOT NULL THEN
    PERFORM public.adjust_inventory_atomic(
        p_product_id,
        v_target_location,
        p_quantity,
        'Purchase: ' || p_id,
        p_user_id,
        v_tenant_id
    );
  END IF;

  -- Bump supplier payable on CREDIT
  IF UPPER(COALESCE(p_payment_type, '')) IN ('CREDIT', 'UDHAAR', 'POST-CAPITAL') THEN
    UPDATE public.suppliers
       SET balance = COALESCE(balance, 0) + p_total_amount
     WHERE id = p_supplier_id
       AND tenant_id = v_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_purchase(
  text, text, numeric, numeric, text, text, text, text, text, uuid, uuid
) TO authenticated;
