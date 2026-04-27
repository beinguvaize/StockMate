-- ============================================================
-- dispatch_vehicle_route and reconcile_vehicle_route RPCs
-- Called from useOperations.js dispatchRoute / reconcileRoute
-- NOTE: routes table uses mixed casing:
--   camelCase: "vehicleId", "driverId", "initialOdometer"
--   snake_case: final_odometer, target_amount, actual_cash, reconciled_at
-- ============================================================

-- ── Ensure routes table has required columns ──────────────────────────────────
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS "vehicleId"       TEXT,
  ADD COLUMN IF NOT EXISTS "driverId"        TEXT,
  ADD COLUMN IF NOT EXISTS location          TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT        NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS date              TEXT,
  ADD COLUMN IF NOT EXISTS "initialOdometer" NUMERIC,
  ADD COLUMN IF NOT EXISTS final_odometer    NUMERIC,
  ADD COLUMN IF NOT EXISTS target_amount     NUMERIC     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_cash       NUMERIC     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS reconciled_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_routes_driver_status
  ON public.routes (tenant_id, "driverId", status);

CREATE INDEX IF NOT EXISTS idx_routes_vehicle_status
  ON public.routes (tenant_id, "vehicleId", status);

-- ── dispatch_vehicle_route ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_vehicle_route(
  p_vehicle_id      TEXT,
  p_driver_id       TEXT,
  p_location        TEXT,
  p_odometer        NUMERIC  DEFAULT 0,
  p_assigned_orders JSONB    DEFAULT '[]',
  p_loaded_stock    JSONB    DEFAULT '[]',   -- [{productId, quantity}]
  p_tenant_id       UUID     DEFAULT NULL,
  p_date            TEXT     DEFAULT NULL,
  p_target_amount   NUMERIC  DEFAULT 0,
  p_notes           TEXT     DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id       UUID;
  v_route_id        UUID;
  v_vehicle_loc_id  UUID;
  v_warehouse_loc   UUID;
  item              RECORD;
  v_date            TEXT;
BEGIN
  v_tenant_id := p_tenant_id;
  v_date      := COALESCE(p_date, NOW()::DATE::TEXT);

  -- ── 1. Ensure vehicle inventory_location exists ─────────────────────────
  SELECT id INTO v_vehicle_loc_id
  FROM public.inventory_locations
  WHERE tenant_id = v_tenant_id AND type = 'VEHICLE' AND reference_id = p_vehicle_id
  LIMIT 1;

  IF v_vehicle_loc_id IS NULL THEN
    INSERT INTO public.inventory_locations (id, tenant_id, name, type, reference_id)
    VALUES (gen_random_uuid(), v_tenant_id, 'Vehicle: ' || p_vehicle_id, 'VEHICLE', p_vehicle_id)
    RETURNING id INTO v_vehicle_loc_id;
  END IF;

  -- ── 2. Resolve main warehouse ────────────────────────────────────────────
  SELECT id INTO v_warehouse_loc
  FROM public.inventory_locations
  WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE'
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  -- ── 3. Create route ──────────────────────────────────────────────────────
  INSERT INTO public.routes (
    id, tenant_id, "vehicleId", "driverId", location,
    status, date, "initialOdometer", target_amount, notes
  )
  VALUES (
    gen_random_uuid(), v_tenant_id, p_vehicle_id, p_driver_id, p_location,
    'ACTIVE', v_date, p_odometer, p_target_amount, p_notes
  )
  RETURNING id INTO v_route_id;

  -- ── 4. Transfer loaded stock: warehouse → vehicle ────────────────────────
  IF v_warehouse_loc IS NOT NULL AND jsonb_array_length(p_loaded_stock) > 0 THEN
    FOR item IN
      SELECT * FROM jsonb_to_recordset(p_loaded_stock)
        AS x("productId" TEXT, quantity NUMERIC)
    LOOP
      CONTINUE WHEN item.quantity IS NULL OR item.quantity <= 0;

      -- Deduct from warehouse
      PERFORM public.adjust_inventory_atomic(
        item."productId", v_warehouse_loc, -item.quantity,
        'Dispatch to vehicle: ' || p_vehicle_id || ' / Route: ' || v_route_id::TEXT,
        COALESCE(p_driver_id, 'system'), v_tenant_id
      );

      -- Add to vehicle location
      PERFORM public.adjust_inventory_atomic(
        item."productId", v_vehicle_loc_id, item.quantity,
        'Loaded on vehicle: ' || p_vehicle_id || ' / Route: ' || v_route_id::TEXT,
        COALESCE(p_driver_id, 'system'), v_tenant_id
      );
    END LOOP;
  END IF;

  RETURN v_route_id::TEXT;
END;
$$;


-- ── reconcile_vehicle_route ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_vehicle_route(
  p_route_id        TEXT,
  p_final_odometer  NUMERIC  DEFAULT 0,
  p_returned_stock  JSONB    DEFAULT '[]',   -- [{productId, quantity}]
  p_actual_cash     NUMERIC  DEFAULT 0,
  p_tenant_id       UUID     DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id       UUID;
  v_vehicle_id      TEXT;
  v_vehicle_loc_id  UUID;
  v_warehouse_loc   UUID;
  v_driver_id       TEXT;
  item              RECORD;
BEGIN
  v_tenant_id := p_tenant_id;

  -- ── 1. Load route info (routes.id is TEXT, not UUID) ─────────────────────
  SELECT "vehicleId", "driverId"
  INTO v_vehicle_id, v_driver_id
  FROM public.routes
  WHERE id = p_route_id          -- TEXT = TEXT (no ::UUID cast)
    AND tenant_id = v_tenant_id;

  IF v_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Route % not found for tenant %', p_route_id, v_tenant_id;
  END IF;

  -- ── 2. Close route ───────────────────────────────────────────────────────
  -- final_odometer and reconciled_at are TEXT columns in this schema
  UPDATE public.routes
  SET
    status          = 'RECONCILED',
    final_odometer  = p_final_odometer::TEXT,
    actual_cash     = p_actual_cash,
    reconciled_at   = NOW()::TEXT
  WHERE id = p_route_id
    AND tenant_id = v_tenant_id;

  -- ── 3. Resolve locations ─────────────────────────────────────────────────
  SELECT id INTO v_vehicle_loc_id
  FROM public.inventory_locations
  WHERE tenant_id = v_tenant_id AND type = 'VEHICLE' AND reference_id = v_vehicle_id
  LIMIT 1;

  SELECT id INTO v_warehouse_loc
  FROM public.inventory_locations
  WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE'
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  -- ── 4. Return unsold stock: vehicle → warehouse ──────────────────────────
  IF v_vehicle_loc_id IS NOT NULL AND v_warehouse_loc IS NOT NULL
     AND jsonb_array_length(p_returned_stock) > 0
  THEN
    FOR item IN
      SELECT * FROM jsonb_to_recordset(p_returned_stock)
        AS x("productId" TEXT, quantity NUMERIC)
    LOOP
      CONTINUE WHEN item.quantity IS NULL OR item.quantity <= 0;

      -- Remove from vehicle
      PERFORM public.adjust_inventory_atomic(
        item."productId", v_vehicle_loc_id, -item.quantity,
        'Return from vehicle: ' || v_vehicle_id || ' / Route: ' || p_route_id,
        COALESCE(v_driver_id, 'system'), v_tenant_id
      );

      -- Restore to warehouse
      PERFORM public.adjust_inventory_atomic(
        item."productId", v_warehouse_loc, item.quantity,
        'Route reconcile return / Route: ' || p_route_id,
        COALESCE(v_driver_id, 'system'), v_tenant_id
      );
    END LOOP;
  END IF;

END;
$$;
