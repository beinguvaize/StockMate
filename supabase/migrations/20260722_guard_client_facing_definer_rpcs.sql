-- Guard the client-facing SECURITY DEFINER writes that trust p_tenant_id.
--
-- A SECURITY DEFINER function runs past RLS. Each of these filtered by the
-- p_tenant_id it was handed with no check the caller owns it, so any
-- authenticated user could act on any tenant by passing a different uuid.
-- Same guard get_pl_ranged / get_dashboard_kpis carry; bodies otherwise
-- verbatim; signatures unchanged so no second overload is created.
--
-- settle_client_payment does not exist on every environment (absent on dev at
-- the time of writing) — CREATE OR REPLACE creates it there, which is fine, it
-- matches prod.

-- ── settle_client_payment ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.settle_client_payment(p_id text, p_tenant_id uuid, p_client_id text, p_amount numeric, p_date date, p_method text DEFAULT 'CASH'::text, p_notes text DEFAULT NULL::text, p_recorded_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric := p_amount;
  v_sale RECORD;
  v_alloc numeric;
  v_new_paid numeric;
  v_new_status text;
  v_noncredit_alloc numeric := 0;
  v_payment_amount numeric;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  FOR v_sale IN
    SELECT id, "totalAmount", COALESCE("paidAmount", 0) AS paid,
           UPPER(COALESCE("paymentMethod",'CASH')) AS method
    FROM sales
    WHERE tenant_id = p_tenant_id
      AND "customerInfo"->>'id' = p_client_id
      AND "paymentStatus" IN ('UNPAID', 'PARTIAL', 'PENDING')
      AND deleted_at IS NULL
      AND voided_at IS NULL
    ORDER BY date ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_alloc := LEAST(v_remaining, v_sale."totalAmount" - v_sale.paid);
    CONTINUE WHEN v_alloc <= 0;

    IF v_sale.method = 'CREDIT' THEN
      v_remaining := v_remaining - v_alloc;
      CONTINUE;
    END IF;

    v_new_paid := v_sale.paid + v_alloc;
    v_new_status := CASE WHEN v_new_paid >= v_sale."totalAmount" THEN 'PAID' ELSE 'PARTIAL' END;

    UPDATE sales
       SET "paymentStatus" = v_new_status,
           "paidAmount"    = v_new_paid,
           "lastPaymentDate" = p_date
     WHERE id = v_sale.id AND tenant_id = p_tenant_id;

    UPDATE invoices
       SET payment_status = v_new_status, paid_amount = v_new_paid
     WHERE id = 'INV-' || v_sale.id AND tenant_id = p_tenant_id;

    v_noncredit_alloc := v_noncredit_alloc + v_alloc;
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  v_payment_amount := p_amount - v_noncredit_alloc;
  IF v_payment_amount > 0 THEN
    INSERT INTO client_payments (id, tenant_id, client_id, amount, date, payment_method, notes, recorded_by)
    VALUES (p_id, p_tenant_id, p_client_id, v_payment_amount, p_date, p_method, p_notes, p_recorded_by)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'allocated', p_amount - v_remaining,
    'unallocated', v_remaining,
    'cash_sale_portion', v_noncredit_alloc,
    'payment_row_amount', GREATEST(0, v_payment_amount)
  );
END $function$;

-- ── settle_sale_payment ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.settle_sale_payment(p_sale_id text, p_amount numeric, p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale   record;
  v_total  numeric;
  v_paid   numeric;
  v_status text;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT * INTO v_sale
    FROM public.sales
   WHERE id = p_sale_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found for tenant %', p_sale_id, p_tenant_id;
  END IF;

  v_total := ROUND(COALESCE(v_sale."totalAmount", 0)::numeric, 2);
  v_paid  := ROUND((COALESCE(v_sale."paidAmount", 0) + p_amount)::numeric, 2);
  IF v_paid > v_total THEN
    v_paid := v_total;
  END IF;

  v_status := CASE
    WHEN v_paid >= v_total THEN 'PAID'
    WHEN v_paid > 0        THEN 'PARTIAL'
    ELSE 'UNPAID'
  END;

  UPDATE public.sales
     SET "paidAmount"    = v_paid,
         "paymentStatus" = v_status
   WHERE id = p_sale_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'sale_id',     p_sale_id,
    'paid_amount', v_paid,
    'outstanding', v_total - v_paid,
    'status',      v_status
  );
END;
$function$;

-- ── issue_invoice_number ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_invoice_number(p_tenant_id uuid, p_series text DEFAULT 'INV'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_series text := NULLIF(TRIM(p_series), '');
  v_fy     text;
  v_seq    bigint;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF v_series IS NULL OR v_series = 'DEFAULT' THEN
    v_series := 'INV';
  END IF;
  v_fy  := public.current_indian_fy(CURRENT_DATE);
  v_seq := public.next_invoice_number(p_tenant_id, v_series, v_fy);
  RETURN v_series || '/' || v_fy || '/' || LPAD(v_seq::text, 4, '0');
END;
$function$;

-- ── lock_van_opening_stock ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_van_opening_stock(p_vehicle_id text, p_route_id text, p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_vehicle_loc_id uuid;
    v_count          int := 0;
BEGIN
    IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
    SELECT id INTO v_vehicle_loc_id
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND type = 'VEHICLE'
      AND reference_id = p_vehicle_id
    LIMIT 1;

    IF v_vehicle_loc_id IS NULL THEN RETURN 0; END IF;

    DELETE FROM public.van_trip_stock_log
    WHERE tenant_id = p_tenant_id
      AND vehicle_id = p_vehicle_id
      AND route_id   = p_route_id;

    INSERT INTO public.van_trip_stock_log (
        tenant_id, route_id, vehicle_id, product_id, opening_qty
    )
    SELECT p_tenant_id, p_route_id, p_vehicle_id, ib.product_id, ib.quantity
    FROM public.inventory_balances ib
    WHERE ib.location_id = v_vehicle_loc_id
      AND ib.tenant_id   = p_tenant_id
      AND ib.quantity    > 0;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

-- ── submit_van_eod ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_van_eod(p_vehicle_id text, p_route_id text, p_tenant_id uuid, p_closing_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    item        record;
    v_variances jsonb := '[]';
BEGIN
    IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
    FOR item IN
        SELECT * FROM jsonb_to_recordset(p_closing_items)
          AS x("productId" text, "closingQty" numeric)
    LOOP
        UPDATE public.van_trip_stock_log
        SET closing_qty      = item."closingQty",
            eod_submitted_at = NOW()
        WHERE tenant_id  = p_tenant_id
          AND vehicle_id = p_vehicle_id
          AND route_id   = p_route_id
          AND product_id = item."productId";

        SELECT jsonb_build_object(
            'productId', product_id,
            'variance',  item."closingQty" - system_closing_qty
        ) INTO item
        FROM public.van_trip_stock_log
        WHERE tenant_id  = p_tenant_id
          AND vehicle_id = p_vehicle_id
          AND route_id   = p_route_id
          AND product_id = item."productId";

        v_variances := v_variances || item;
    END LOOP;

    UPDATE public.routes
    SET status = 'RECONCILED'
    WHERE id = p_route_id AND tenant_id = p_tenant_id AND status != 'RECONCILED';

    RETURN jsonb_build_object('variances', v_variances, 'submitted_at', NOW());
END;
$function$;

-- ── complete_production_order ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_production_order(p_order_id uuid, p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order         public.production_orders;
  v_mat           record;
  v_material_cost numeric := 0;
  v_other_cost    numeric := 0;
  v_total         numeric;
  v_unit          numeric;
  v_avail         numeric;
  v_cost          numeric;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT * INTO v_order FROM public.production_orders
   WHERE id = p_order_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Production order not found');
  END IF;
  IF v_order.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order already completed');
  END IF;
  IF COALESCE(v_order.qty_produced, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity produced must be greater than 0');
  END IF;

  FOR v_mat IN
    SELECT id, raw_product_id, qty_consumed FROM public.production_order_materials
    WHERE production_order_id = p_order_id
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_avail
    FROM public.inventory_balances
    WHERE product_id = v_mat.raw_product_id AND tenant_id = p_tenant_id;
    IF v_avail < v_mat.qty_consumed THEN
      RETURN jsonb_build_object('success', false,
        'error', format('Insufficient stock for a raw material (need %s, have %s)',
          v_mat.qty_consumed, v_avail));
    END IF;
  END LOOP;

  FOR v_mat IN
    SELECT id, raw_product_id, qty_consumed FROM public.production_order_materials
    WHERE production_order_id = p_order_id
  LOOP
    SELECT COALESCE("costPrice", 0) INTO v_cost FROM public.products WHERE id = v_mat.raw_product_id;
    v_cost := COALESCE(v_cost, 0);

    PERFORM public.adjust_inventory_atomic(
      p_product_id  := v_mat.raw_product_id,
      p_location_id := NULL,
      p_amount      := -v_mat.qty_consumed,
      p_reason      := 'Production consume',
      p_tenant_id   := p_tenant_id
    );

    UPDATE public.production_order_materials
       SET unit_cost_at_build = v_cost,
           line_cost = v_cost * v_mat.qty_consumed
     WHERE id = v_mat.id;

    v_material_cost := v_material_cost + (v_cost * v_mat.qty_consumed);
  END LOOP;

  SELECT COALESCE(SUM(amount), 0) INTO v_other_cost
  FROM public.production_costs WHERE production_order_id = p_order_id;

  v_total := v_material_cost + v_other_cost;
  v_unit  := v_total / v_order.qty_produced;

  PERFORM public.adjust_inventory_atomic(
    p_product_id  := v_order.finished_product_id,
    p_location_id := NULL,
    p_amount      := v_order.qty_produced,
    p_reason      := 'Production output',
    p_tenant_id   := p_tenant_id
  );

  INSERT INTO public.product_batches
    (product_id, tenant_id, unit_cost, qty_received, qty_remaining, received_date, manufacturing_date, note)
  VALUES
    (v_order.finished_product_id, p_tenant_id, v_unit, v_order.qty_produced, v_order.qty_produced,
     current_date, current_date, 'Manufactured');

  UPDATE public.production_orders
     SET material_cost = v_material_cost,
         other_cost    = v_other_cost,
         total_cost    = v_total,
         unit_cost     = v_unit,
         status        = 'COMPLETED'
   WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true,
    'material_cost', v_material_cost, 'other_cost', v_other_cost,
    'total_cost', v_total, 'unit_cost', v_unit);
END;
$function$;

-- ── dispatch_vehicle_route ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_vehicle_route(p_vehicle_id text, p_driver_id text, p_location text, p_odometer numeric DEFAULT 0, p_assigned_orders jsonb DEFAULT '[]'::jsonb, p_loaded_stock jsonb DEFAULT '[]'::jsonb, p_tenant_id uuid DEFAULT NULL::uuid, p_date text DEFAULT NULL::text, p_target_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id       UUID;
  v_route_id        UUID;
  v_vehicle_loc_id  UUID;
  v_warehouse_loc   UUID;
  item              RECORD;
  v_date            TEXT;
  v_invoice_id      TEXT;
  v_seq             INT;
  v_client_id       TEXT;
  v_client_name     TEXT;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  v_tenant_id := p_tenant_id;
  v_date      := COALESCE(p_date, NOW()::DATE::TEXT);

  SELECT id INTO v_vehicle_loc_id
  FROM public.inventory_locations
  WHERE tenant_id = v_tenant_id AND type = 'VEHICLE' AND reference_id = p_vehicle_id
  LIMIT 1;

  IF v_vehicle_loc_id IS NULL THEN
    INSERT INTO public.inventory_locations (id, tenant_id, name, type, reference_id)
    VALUES (gen_random_uuid(), v_tenant_id, 'Vehicle: ' || p_vehicle_id, 'VEHICLE', p_vehicle_id)
    RETURNING id INTO v_vehicle_loc_id;
  END IF;

  SELECT id INTO v_warehouse_loc
  FROM public.inventory_locations
  WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE'
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  INSERT INTO public.routes (
    id, tenant_id, "vehicleId", "driverId", location,
    status, date, "initialOdometer", target_amount, notes
  )
  VALUES (
    gen_random_uuid(), v_tenant_id, p_vehicle_id, p_driver_id, p_location,
    'ACTIVE', v_date, p_odometer, p_target_amount, p_notes
  )
  RETURNING id INTO v_route_id;

  IF v_warehouse_loc IS NOT NULL AND jsonb_array_length(p_loaded_stock) > 0 THEN
    FOR item IN
      SELECT * FROM jsonb_to_recordset(p_loaded_stock) AS x("productId" TEXT, quantity NUMERIC)
    LOOP
      CONTINUE WHEN item.quantity IS NULL OR item.quantity <= 0;
      PERFORM public.adjust_inventory_atomic(
        item."productId", v_warehouse_loc, -item.quantity,
        'Dispatch to vehicle: ' || p_vehicle_id || ' / Route: ' || v_route_id::TEXT,
        COALESCE(p_driver_id, 'system'), v_tenant_id
      );
      PERFORM public.adjust_inventory_atomic(
        item."productId", v_vehicle_loc_id, item.quantity,
        'Loaded on vehicle: ' || p_vehicle_id || ' / Route: ' || v_route_id::TEXT,
        COALESCE(p_driver_id, 'system'), v_tenant_id
      );
    END LOOP;
  END IF;

  IF jsonb_array_length(p_assigned_orders) > 0 THEN
    v_seq := 1;
    FOR v_invoice_id IN
      SELECT jsonb_array_elements_text(p_assigned_orders)
    LOOP
      SELECT client_id, client_name
      INTO v_client_id, v_client_name
      FROM public.invoices
      WHERE id = v_invoice_id AND tenant_id = v_tenant_id
      LIMIT 1;

      INSERT INTO public.route_stops (
        id, tenant_id, route_id, invoice_id,
        client_id, client_name, sequence, status, cash_collected
      ) VALUES (
        gen_random_uuid(), v_tenant_id, v_route_id, v_invoice_id,
        v_client_id, v_client_name, v_seq, 'PENDING', 0
      );

      UPDATE public.invoices
      SET delivery_status  = 'IN_TRANSIT',
          vehicle_route_id = v_route_id::TEXT
      WHERE id = v_invoice_id AND tenant_id = v_tenant_id;

      v_seq := v_seq + 1;
    END LOOP;
  END IF;

  RETURN v_route_id::TEXT;
END;
$function$;
