-- A manual stock addition with no price typed created NO cost batch, so the
-- units entered inventory with nothing behind them and were costed later from
-- products."costPrice" — an average. That is how 34 products came to hold
-- Rs 35,125 of stock the batches could not account for, Paper Cup 150 ML and
-- 210 ML alone being Rs 25,267 with no batch at all.
--
-- The server now resolves a cost itself: the last price actually paid on or
-- before the adjustment date, else the product's cost price. Server-side so it
-- holds for web, mobile, desktop and any queued offline replay rather than
-- whichever screen remembered to send a price.
--
-- The date bound is not decoration. Pricing today's correction from a purchase
-- dated later would value stock using information that did not exist when it
-- moved. Verified: LD Cover 0 priced as at 30 Jun returns 110 (the 23 Jun bill)
-- and ignores the 10 Jul bill at 150.

CREATE OR REPLACE FUNCTION public.resolve_adjustment_cost(
  p_tenant_id  uuid,
  p_product_id text,
  p_on_date    date
) RETURNS TABLE(unit_cost numeric, basis text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT b.unit_cost, 'LAST_KNOWN'::text
    FROM public.product_batches b
    WHERE b.tenant_id = p_tenant_id
      AND b.product_id = p_product_id
      AND b.purchase_id IS NOT NULL
      AND b.deleted_at IS NULL
      AND b.received_date <= p_on_date
      AND b.unit_cost > 0
    ORDER BY b.received_date DESC, b.created_at DESC
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Never purchased: the product's own cost price. Still a guess, and labelled
  -- ESTIMATED so it keeps appearing on the unverified-cost screen.
  RETURN QUERY
    SELECT p."costPrice"::numeric, 'ESTIMATED'::text
    FROM public.products p
    WHERE p.id = p_product_id
      AND p.tenant_id = p_tenant_id
      AND COALESCE(p."costPrice", 0) > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_adjustment_cost(uuid, text, date) TO authenticated;

-- Body-only change to adjust_inventory_atomic. The argument list is untouched:
-- adding a parameter would create a second overload and every existing call
-- would fail as ambiguous.
--
-- The auto-cost is gated on p_consume_batches, the existing marker for "this is
-- a real inventory correction, keep the batch books in step". Only the two
-- manual-adjustment call sites set it (useInventory.js, product_repository.dart).
-- Every transfer — van load, van unload, dispatch, recipe deduction, rollbacks —
-- leaves it false, and those must NOT mint batches: their stock already has
-- batches sitting at the warehouse that were never consumed when it moved, so
-- creating more on the way back would double-count inventory value. Van unload
-- alone is 3,322 units on the affected products.

CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_product_id text, p_location_id uuid, p_amount numeric, p_reason text,
    p_user_id text DEFAULT 'system'::text, p_tenant_id uuid DEFAULT NULL::uuid,
    p_movement_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text,
    p_reference_type text DEFAULT NULL::text, p_consume_batches boolean DEFAULT false,
    p_unit_cost numeric DEFAULT NULL::numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_actual_location_id uuid := p_location_id;
    v_main_warehouse_id  uuid := '00000000-0000-0000-0000-000000000001';
    v_loc_type           text;
    v_vehicle_id         text;
    v_qty_after          numeric;
    v_movement_type      text;
    v_remaining          numeric;
    v_batch              record;
    v_take               numeric;
    v_cost               numeric := p_unit_cost;
    v_basis              text    := 'ESTIMATED';
BEGIN
    IF v_actual_location_id IS NULL THEN
        SELECT id INTO v_actual_location_id
        FROM public.inventory_locations
        WHERE tenant_id = p_tenant_id AND type = 'WAREHOUSE'
        LIMIT 1;
        IF v_actual_location_id IS NULL THEN
            v_actual_location_id := v_main_warehouse_id;
        END IF;
    END IF;

    SELECT type, reference_id INTO v_loc_type, v_vehicle_id
    FROM public.inventory_locations
    WHERE id = v_actual_location_id;

    INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
    VALUES (p_product_id, v_actual_location_id, p_amount, p_tenant_id)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET
        quantity   = GREATEST(0, public.inventory_balances.quantity + EXCLUDED.quantity),
        updated_at = NOW()
    RETURNING quantity INTO v_qty_after;

    INSERT INTO public.movement_log (id, product_id, type, quantity, reason, user_id, tenant_id, date)
    VALUES (
        'LOG-' || floor(extract(epoch from now())) || '-' || substr(md5(random()::text), 1, 5),
        p_product_id,
        CASE WHEN p_amount >= 0 THEN 'IN' ELSE 'OUT' END,
        ABS(p_amount), p_reason, p_user_id, p_tenant_id, NOW()
    );

    IF p_consume_batches AND p_amount > 0 AND v_cost IS NULL THEN
        SELECT r.unit_cost, r.basis INTO v_cost, v_basis
        FROM public.resolve_adjustment_cost(p_tenant_id, p_product_id, CURRENT_DATE) r;
    ELSIF v_cost IS NOT NULL THEN
        -- Typed by hand at the till: accurate or not, no bill supports it.
        v_basis := 'ESTIMATED';
    END IF;

    IF p_amount > 0 AND v_cost IS NOT NULL AND v_cost > 0 THEN
        INSERT INTO public.product_batches
            (product_id, tenant_id, unit_cost, qty_received, qty_remaining, received_date,
             note, origin, cost_basis)
        VALUES
            (p_product_id, p_tenant_id, ROUND(v_cost, 4), p_amount, p_amount, CURRENT_DATE,
             COALESCE(NULLIF(p_reason, ''), 'Manual stock add'), 'ADJUSTMENT', v_basis);
        PERFORM public.recompute_product_cost(p_tenant_id, p_product_id);
    END IF;

    IF p_consume_batches AND p_amount < 0 THEN
        v_remaining := ABS(p_amount);
        FOR v_batch IN
            SELECT id, qty_remaining FROM public.product_batches
            WHERE tenant_id = p_tenant_id AND product_id = p_product_id
              AND deleted_at IS NULL AND qty_remaining > 0
            ORDER BY expiry_date ASC NULLS LAST, received_date ASC NULLS LAST, created_at ASC
        LOOP
            EXIT WHEN v_remaining <= 0;
            v_take := LEAST(v_batch.qty_remaining, v_remaining);
            UPDATE public.product_batches
               SET qty_remaining = qty_remaining - v_take, updated_at = NOW()
             WHERE id = v_batch.id;
            v_remaining := v_remaining - v_take;
        END LOOP;
    END IF;

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
            tenant_id, vehicle_id, product_id, movement_type, qty_delta, qty_after,
            reference_id, reference_type, notes, recorded_by
        ) VALUES (
            p_tenant_id, v_vehicle_id, p_product_id, v_movement_type, p_amount, v_qty_after,
            p_reference_id, p_reference_type, p_reason, p_user_id
        );
    END IF;
END;
$function$;
