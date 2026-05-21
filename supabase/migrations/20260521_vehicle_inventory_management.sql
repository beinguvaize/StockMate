-- =============================================================================
-- Vehicle Inventory Management
-- 1. vehicle_stock_movements  — full ledger of every van stock change
-- 2. van_trip_stock_log       — per-product opening snapshot at trip start
-- 3. van_damage_records       — damage/shrinkage events
-- 4. Updated adjust_inventory_atomic — writes to vehicle_stock_movements when
--    the target location is type=VEHICLE
-- 5. Updated dispatch_vehicle_route  — locks opening stock snapshot
-- =============================================================================

-- ── 1. vehicle_stock_movements ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_stock_movements (
  id              text        PRIMARY KEY DEFAULT 'VSM-' || floor(extract(epoch from now())) || '-' || substr(md5(random()::text),1,6),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id      text        NOT NULL,   -- references vehicles.id
  product_id      text        NOT NULL,
  movement_type   text        NOT NULL,   -- LOAD | SALE | RETURN | DAMAGE | TRANSFER_IN | TRANSFER_OUT | TOPUP | UNLOAD | ADJUSTMENT
  qty_delta       numeric     NOT NULL,   -- positive = stock in, negative = stock out
  qty_after       numeric,               -- balance after this movement
  reference_id    text,                  -- sale_id / route_id / transfer_id etc.
  reference_type  text,                  -- SALE | ROUTE | TRANSFER | DAMAGE
  batch_number    text,
  expiry_date     date,
  notes           text,
  recorded_by     text,                  -- user id
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vsm_vehicle_product
  ON public.vehicle_stock_movements (tenant_id, vehicle_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vsm_vehicle_date
  ON public.vehicle_stock_movements (tenant_id, vehicle_id, created_at DESC);

ALTER TABLE public.vehicle_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vsm_tenant_isolation" ON public.vehicle_stock_movements
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- ── 2. van_trip_stock_log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.van_trip_stock_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_id        text,                  -- references routes.id
  vehicle_id      text        NOT NULL,
  product_id      text        NOT NULL,
  opening_qty     numeric     NOT NULL DEFAULT 0,  -- locked at trip start
  sold_qty        numeric     NOT NULL DEFAULT 0,  -- updated as sales happen
  returned_qty    numeric     NOT NULL DEFAULT 0,  -- customer returns back to van
  damaged_qty     numeric     NOT NULL DEFAULT 0,  -- damage recorded during route
  closing_qty     numeric,                          -- driver-entered physical count at EOD
  system_closing_qty numeric GENERATED ALWAYS AS (opening_qty - sold_qty + returned_qty - damaged_qty) STORED,
  variance_qty    numeric GENERATED ALWAYS AS (COALESCE(closing_qty, 0) - (opening_qty - sold_qty + returned_qty - damaged_qty)) STORED,
  locked_at       timestamptz NOT NULL DEFAULT now(),
  eod_submitted_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vtsl_vehicle_route
  ON public.van_trip_stock_log (tenant_id, vehicle_id, route_id, created_at DESC);

ALTER TABLE public.van_trip_stock_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vtsl_tenant_isolation" ON public.van_trip_stock_log
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- ── 3. van_damage_records ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.van_damage_records (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id      text        NOT NULL,
  product_id      text        NOT NULL,
  route_id        text,
  qty             numeric     NOT NULL,
  reason          text        NOT NULL DEFAULT 'TRANSIT_DAMAGE',  -- TRANSIT_DAMAGE | EXPIRY | THEFT | OTHER
  photo_url       text,
  batch_number    text,
  expiry_date     date,
  recorded_by     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.van_damage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vdr_tenant_isolation" ON public.van_damage_records
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- ── 4. Updated adjust_inventory_atomic ───────────────────────────────────────
-- Extends existing function to also write vehicle_stock_movements when
-- the target location is a VEHICLE-type location.
CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_product_id  text,
    p_location_id uuid,
    p_amount      numeric,
    p_reason      text,
    p_user_id     text     DEFAULT 'system',
    p_tenant_id   uuid     DEFAULT NULL,
    -- New optional params for vehicle ledger
    p_movement_type   text DEFAULT NULL,  -- LOAD | SALE | RETURN | DAMAGE etc.
    p_reference_id    text DEFAULT NULL,
    p_reference_type  text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_actual_location_id uuid := p_location_id;
    v_main_warehouse_id  uuid := '00000000-0000-0000-0000-000000000001';
    v_loc_type           text;
    v_vehicle_id         text;
    v_qty_after          numeric;
    v_movement_type      text;
BEGIN
    -- Resolve warehouse location if none provided
    IF v_actual_location_id IS NULL THEN
        SELECT id INTO v_actual_location_id
        FROM public.inventory_locations
        WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE'
        LIMIT 1;
        IF v_actual_location_id IS NULL THEN
            v_actual_location_id := v_main_warehouse_id;
        END IF;
    END IF;

    -- Check if this is a vehicle location
    SELECT type, reference_id INTO v_loc_type, v_vehicle_id
    FROM public.inventory_locations
    WHERE id = v_actual_location_id;

    -- Upsert into inventory_balances
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
    VALUES (p_product_id, v_actual_location_id, p_amount, p_tenant_id)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET
        quantity   = GREATEST(0, public.inventory_balances.quantity + EXCLUDED.quantity),
        updated_at = NOW()
    RETURNING quantity INTO v_qty_after;

    -- Record general movement log
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

    -- If VEHICLE location → also write vehicle_stock_movements ledger
    IF v_loc_type = 'VEHICLE' AND v_vehicle_id IS NOT NULL THEN
        v_movement_type := COALESCE(
            p_movement_type,
            CASE
                WHEN p_reason ILIKE '%van load%' OR p_reason ILIKE '%dispatch%' THEN 'LOAD'
                WHEN p_reason ILIKE '%van sale%' OR p_reason ILIKE '%sale%'     THEN 'SALE'
                WHEN p_reason ILIKE '%return%'                                  THEN 'RETURN'
                WHEN p_reason ILIKE '%damage%'                                  THEN 'DAMAGE'
                WHEN p_reason ILIKE '%top%up%' OR p_reason ILIKE '%topup%'      THEN 'TOPUP'
                WHEN p_reason ILIKE '%unload%' OR p_reason ILIKE '%reconcile%'  THEN 'UNLOAD'
                WHEN p_amount >= 0                                              THEN 'LOAD'
                ELSE                                                             'SALE'
            END
        );

        INSERT INTO public.vehicle_stock_movements (
            tenant_id, vehicle_id, product_id,
            movement_type, qty_delta, qty_after,
            reference_id, reference_type, notes, recorded_by
        ) VALUES (
            p_tenant_id, v_vehicle_id, p_product_id,
            v_movement_type, p_amount, v_qty_after,
            p_reference_id, p_reference_type, p_reason, p_user_id
        );
    END IF;
END;
$$;

-- ── 5. lock_van_opening_stock ─────────────────────────────────────────────────
-- Called at trip start. Snapshots current vehicle inventory_balances into
-- van_trip_stock_log. Idempotent — safe to call again on retry.
CREATE OR REPLACE FUNCTION public.lock_van_opening_stock(
    p_vehicle_id  text,
    p_route_id    text,
    p_tenant_id   uuid
) RETURNS int   -- returns count of products locked
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_vehicle_loc_id uuid;
    v_count          int := 0;
BEGIN
    -- Resolve vehicle inventory location
    SELECT id INTO v_vehicle_loc_id
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND type = 'VEHICLE'
      AND reference_id = p_vehicle_id
    LIMIT 1;

    IF v_vehicle_loc_id IS NULL THEN RETURN 0; END IF;

    -- Delete any existing lock for this route (allow re-lock on retry)
    DELETE FROM public.van_trip_stock_log
    WHERE tenant_id = p_tenant_id
      AND vehicle_id = p_vehicle_id
      AND route_id   = p_route_id;

    -- Insert snapshot from current inventory_balances
    INSERT INTO public.van_trip_stock_log (
        tenant_id, route_id, vehicle_id, product_id, opening_qty
    )
    SELECT
        p_tenant_id,
        p_route_id,
        p_vehicle_id,
        ib.product_id,
        ib.quantity
    FROM public.inventory_balances ib
    WHERE ib.location_id = v_vehicle_loc_id
      AND ib.tenant_id   = p_tenant_id
      AND ib.quantity    > 0;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ── 6. record_van_damage ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_van_damage(
    p_vehicle_id  text,
    p_product_id  text,
    p_qty         numeric,
    p_reason      text,
    p_route_id    text    DEFAULT NULL,
    p_batch       text    DEFAULT NULL,
    p_tenant_id   uuid    DEFAULT NULL,
    p_user_id     text    DEFAULT 'system'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_vehicle_loc_id uuid;
BEGIN
    -- Resolve vehicle location
    SELECT id INTO v_vehicle_loc_id
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id AND type = 'VEHICLE' AND reference_id = p_vehicle_id
    LIMIT 1;

    -- Deduct from van inventory
    IF v_vehicle_loc_id IS NOT NULL THEN
        PERFORM public.adjust_inventory_atomic(
            p_product_id, v_vehicle_loc_id, -p_qty,
            'Damage: ' || p_reason,
            p_user_id, p_tenant_id,
            'DAMAGE', p_route_id, 'DAMAGE'
        );
    END IF;

    -- Record damage report
    INSERT INTO public.van_damage_records (
        tenant_id, vehicle_id, product_id, route_id,
        qty, reason, batch_number, recorded_by
    ) VALUES (
        p_tenant_id, p_vehicle_id, p_product_id, p_route_id,
        p_qty, p_reason, p_batch, p_user_id
    );

    -- Update trip stock log damaged_qty
    UPDATE public.van_trip_stock_log
    SET damaged_qty = damaged_qty + p_qty
    WHERE tenant_id  = p_tenant_id
      AND vehicle_id = p_vehicle_id
      AND route_id   = p_route_id
      AND product_id = p_product_id;
END;
$$;

-- ── 7. submit_van_eod ─────────────────────────────────────────────────────────
-- Driver submits physical closing counts at EOD.
-- closing_items: [{"productId": "...", "closingQty": N}]
CREATE OR REPLACE FUNCTION public.submit_van_eod(
    p_vehicle_id    text,
    p_route_id      text,
    p_tenant_id     uuid,
    p_closing_items jsonb DEFAULT '[]'
) RETURNS jsonb   -- returns variance summary
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    item            record;
    v_variances     jsonb := '[]';
    v_total_var     numeric := 0;
BEGIN
    -- Update closing qty per product
    FOR item IN
        SELECT * FROM jsonb_to_recordset(p_closing_items)
          AS x("productId" text, "closingQty" numeric)
    LOOP
        UPDATE public.van_trip_stock_log
        SET closing_qty        = item."closingQty",
            eod_submitted_at   = NOW()
        WHERE tenant_id  = p_tenant_id
          AND vehicle_id = p_vehicle_id
          AND route_id   = p_route_id
          AND product_id = item."productId";

        -- Collect variances for return value
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

    -- Mark route as EOD submitted
    UPDATE public.routes
    SET status = 'RECONCILED'
    WHERE id        = p_route_id
      AND tenant_id = p_tenant_id
      AND status   != 'RECONCILED';

    RETURN jsonb_build_object('variances', v_variances, 'submitted_at', NOW());
END;
$$;
