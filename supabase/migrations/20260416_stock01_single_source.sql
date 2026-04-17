-- ==============================================================
-- STOCK-01: Single Source of Truth for Inventory
-- ==============================================================
-- Eliminates "ghost stock" drift by making products.stock a 
-- computed cache driven entirely by the sum of inventory_balances.
-- Safe to re-run (all operations are idempotent).
-- ==============================================================


-- STEP 1: Ensure unique constraint exists on inventory_balances
-- (Required for the ON CONFLICT upsert in the RPC)
-- --------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.inventory_balances'::regclass
          AND contype = 'u'
          AND conname = 'uq_inventory_balances_product_location'
    ) THEN
        ALTER TABLE public.inventory_balances 
        ADD CONSTRAINT uq_inventory_balances_product_location 
        UNIQUE (product_id, location_id);
    END IF;
END $$;


-- STEP 2: Create the trigger function
-- --------------------------------------------------------------
-- Fires whenever inventory_balances changes and recomputes
-- products.stock as SUM(inventory_balances.quantity).
-- SECURITY DEFINER ensures it bypasses RLS during the sync.
CREATE OR REPLACE FUNCTION public.sync_product_stock_sum()
RETURNS TRIGGER AS $$
DECLARE
    v_product_id text;
    v_tenant_id  uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_product_id := OLD.product_id;
        v_tenant_id  := OLD.tenant_id;
    ELSE
        v_product_id := NEW.product_id;
        v_tenant_id  := NEW.tenant_id;
    END IF;

    UPDATE public.products
    SET stock = COALESCE(
        (SELECT SUM(quantity)
         FROM public.inventory_balances
         WHERE product_id = v_product_id
           AND tenant_id  = v_tenant_id),
        0
    )
    WHERE id        = v_product_id
      AND tenant_id = v_tenant_id;

    RETURN NULL; -- Required for AFTER row triggers
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- STEP 3: Attach trigger to inventory_balances
-- --------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_product_stock ON public.inventory_balances;

CREATE TRIGGER trg_sync_product_stock
AFTER INSERT OR UPDATE OF quantity OR DELETE
ON public.inventory_balances
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_stock_sum();


-- STEP 4: Redefine adjust_inventory_atomic — remove manual stock UPDATE
-- --------------------------------------------------------------
-- The manual UPDATE products SET stock = ... has been removed.
-- The trigger (STEP 3) now handles it automatically and atomically.
CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
  p_product_id text,
  p_location_id uuid,
  p_amount      numeric,
  p_reason      text,
  p_user_id     text,
  p_tenant_id   uuid
)
RETURNS void AS $$
DECLARE
    v_actual_location_id uuid := p_location_id;
    v_main_warehouse_id  uuid := '00000000-0000-0000-0000-000000000001';
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

    -- Upsert into inventory_balances — fires trg_sync_product_stock
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
    VALUES (p_product_id, v_actual_location_id, p_amount, p_tenant_id)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET
        quantity   = GREATEST(0, public.inventory_balances.quantity + EXCLUDED.quantity),
        updated_at = NOW();

    -- Record movement log
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- STEP 5: Backfill ghost stock into inventory_balances
-- --------------------------------------------------------------
-- Finds products where stock > 0 but no balance row exists yet,
-- and seeds them into the MAIN_WAREHOUSE sentinel location.
-- RLS is temporarily disabled so no helper function is required.

ALTER TABLE public.inventory_balances DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_location_id uuid;
    rec           record;
BEGIN
    FOR rec IN
        SELECT p.id AS product_id, p.tenant_id, p.stock
        FROM public.products p
        LEFT JOIN (
            SELECT product_id, SUM(quantity) AS total_qty
            FROM public.inventory_balances
            GROUP BY product_id
        ) b ON p.id = b.product_id
        WHERE p.stock > 0 AND b.total_qty IS NULL
    LOOP
        -- Resolve the first real location for this tenant (prefer WAREHOUSE type)
        SELECT id INTO v_location_id
        FROM public.inventory_locations
        WHERE tenant_id = rec.tenant_id
        ORDER BY
            CASE WHEN UPPER(type) = 'WAREHOUSE' THEN 0 ELSE 1 END,
            created_at ASC
        LIMIT 1;

        -- Skip this product if no location exists for the tenant yet
        IF v_location_id IS NULL THEN
            RAISE NOTICE 'No location found for tenant %, skipping product %', rec.tenant_id, rec.product_id;
            CONTINUE;
        END IF;

        INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
        VALUES (rec.product_id, v_location_id, rec.stock, rec.tenant_id)
        ON CONFLICT (product_id, location_id) DO NOTHING;
    END LOOP;
END $$;

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
