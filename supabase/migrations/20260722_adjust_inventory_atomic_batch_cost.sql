-- Bring adjust_inventory_atomic up to the shape prod has run since 22 Jul:
-- manual stock additions can carry a unit cost (creating a real FIFO batch
-- instead of leaving the units to the products."costPrice" fallback), and
-- manual reductions can consume batches so qty_remaining tracks physical stock.
--
-- Reconstructed from prod, where this was applied directly and never committed;
-- dev was still on the 9-arg signature, which is how the gap surfaced.
--
-- DROP the 9-arg signature first. Adding the two defaulted params creates a
-- SECOND overload, and every existing 9-arg call then fails with "function is
-- not unique" — the parameter-list trap that has bitten this schema before.

DROP FUNCTION IF EXISTS public.adjust_inventory_atomic(text, uuid, numeric, text, text, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_product_id text,
    p_location_id uuid,
    p_amount numeric,
    p_reason text,
    p_user_id text DEFAULT 'system'::text,
    p_tenant_id uuid DEFAULT NULL::uuid,
    p_movement_type text DEFAULT NULL::text,
    p_reference_id text DEFAULT NULL::text,
    p_reference_type text DEFAULT NULL::text,
    p_consume_batches boolean DEFAULT false,
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
        ABS(p_amount),
        p_reason,
        p_user_id,
        p_tenant_id,
        NOW()
    );

    -- Manual stock ADDITION with a known purchase price → create a real FIFO
    -- cost batch, exactly like a mini-purchase. Without a price the added
    -- units stay unbatched and cost via the product.costPrice fallback (fine
    -- for a recount correction). With a price the batch trail stays complete
    -- and profit on those units is exact. Refresh the product's cost price
    -- (weighted-avg of live batches) same as a real purchase does.
    IF p_amount > 0 AND p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN
        INSERT INTO public.product_batches
            (product_id, tenant_id, unit_cost, qty_received, qty_remaining, received_date, note)
        VALUES
            (p_product_id, p_tenant_id, ROUND(p_unit_cost, 4), p_amount, p_amount, CURRENT_DATE,
             COALESCE(NULLIF(p_reason, ''), 'Manual stock add'));
        PERFORM public.recompute_product_cost(p_tenant_id, p_product_id);
    END IF;

    -- Manual stock reductions consume FIFO cost batches so qty_remaining
    -- stays in step with physical stock. Gated by p_consume_batches so
    -- callers that manage their own batches (sales) or only move stock
    -- between locations (vehicle load/dispatch) are unaffected. No expense
    -- booked — a recount is not automatically a loss.
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
$function$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_atomic(text, uuid, numeric, text, text, uuid, text, text, text, boolean, numeric) TO authenticated;
