-- ==============================================================
-- FLOW-01: Snake_case Harmonization and Atomic Transaction RPCs
-- ==============================================================

-- 1. Rename 'sales' columns to clean snake_case (dropping double-quotes)
-- We use a DO block to ensure idempotency if columns are already renamed.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'shopId') THEN
        ALTER TABLE public.sales RENAME COLUMN "shopId" TO client_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'paymentMethod') THEN
        ALTER TABLE public.sales RENAME COLUMN "paymentMethod" TO payment_method;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'paymentStatus') THEN
        ALTER TABLE public.sales RENAME COLUMN "paymentStatus" TO payment_status;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'totalAmount') THEN
        ALTER TABLE public.sales RENAME COLUMN "totalAmount" TO total_amount;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'totalCogs') THEN
        ALTER TABLE public.sales RENAME COLUMN "totalCogs" TO total_cogs;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'bookedBy') THEN
        ALTER TABLE public.sales RENAME COLUMN "bookedBy" TO booked_by;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'scheduledDate') THEN
        ALTER TABLE public.sales RENAME COLUMN "scheduledDate" TO scheduled_date;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'paidAmount') THEN
        ALTER TABLE public.sales RENAME COLUMN "paidAmount" TO paid_amount;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'lastPaymentDate') THEN
        ALTER TABLE public.sales RENAME COLUMN "lastPaymentDate" TO last_payment_date;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'vehicleId') THEN
        ALTER TABLE public.sales RENAME COLUMN "vehicleId" TO vehicle_id;
    END IF;
END $$;

-- 2. Formally re-implement process_purchase (Atomic)
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
  v_target_location UUID;
BEGIN
  -- Resolve tenant
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  ELSE
    SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = p_user_id LIMIT 1;
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

  -- Insert Purchase (Trigger will post to GL)
  INSERT INTO public.purchases (
    id, total_amount, date, linked_product_id, product_id,
    supplier_id, payment_type, notes, quantity, tenant_id
  )
  VALUES (
    p_id, p_total_amount, p_date, p_product_id, p_product_id,
    p_supplier_id, p_payment_type, p_notes, p_quantity, v_tenant_id
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
END;
$$;

-- 3. Formally re-implement process_sale (Atomic)
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
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  item record;
  v_tenant_id UUID;
  v_source_location UUID;
  v_total_cogs NUMERIC := 0;
  v_cogs NUMERIC;
BEGIN
  -- Resolve tenant
  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = p_user_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'User not found or has no tenant assignment'; END IF;

  -- Resolve source location
  IF p_location_id IS NOT NULL THEN
    v_source_location := p_location_id;
  ELSE
    SELECT id INTO v_source_location FROM public.inventory_locations
    WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE' LIMIT 1;
  END IF;

  -- Pre-calculate COGS for GL integration
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productId text, quantity numeric) LOOP
    SELECT COALESCE("costPrice", 0) * item.quantity INTO v_cogs 
    FROM public.products WHERE id = item.productId AND tenant_id = v_tenant_id;
    v_total_cogs := v_total_cogs + v_cogs;
  END LOOP;

  -- Insert Sale (Trigger will post to GL using new snake_case fields)
  INSERT INTO public.sales (
    id, client_id, items, total_amount, total_cogs, 
    payment_method, payment_status, date, booked_by, tenant_id
  )
  VALUES (
    p_id, p_shop_id, p_items, p_total_amount, v_total_cogs, 
    p_payment_method, p_payment_status, p_date, p_user_id, v_tenant_id
  );

  -- Handle Inventory Depletion
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productId text, quantity numeric) LOOP
    PERFORM public.adjust_inventory_atomic(
        item.productId, 
        v_source_location, 
        -item.quantity, 
        'Sale: ' || p_id, 
        p_user_id, 
        v_tenant_id
    );
  END LOOP;

  -- Update client outstanding balance for credit sales
  IF upper(p_payment_method) = 'CREDIT' THEN
    PERFORM public.apply_client_balance_delta(p_shop_id, p_total_amount, v_tenant_id);
  END IF;
END;
$$;
