-- ==============================================================
-- STOCK-01 (patch): Finish the backfill that the original migration
-- skipped for tenants with zero inventory_locations.
-- ==============================================================
-- Context:
--   * 20260416_stock01_single_source.sql was partially applied to the
--     database out-of-band: the trigger, helper function, unique
--     constraint and rewritten adjust_inventory_atomic are all live.
--   * Its Step 5 backfill only seeds products where the tenant already
--     has at least one inventory_locations row. Tenants with zero
--     locations were silently skipped via RAISE NOTICE, leaving ghost
--     stock stranded.
--
-- This patch:
--   1. Auto-creates a "Main Warehouse" WAREHOUSE location for any
--      tenant that has a product with stock > 0 but no locations.
--   2. Re-runs the backfill so every ghost-stock product now has a
--      matching inventory_balances row.
--   3. Afterwards products.stock stays in lockstep with balances via
--      the existing trigger.
--
-- Idempotent: the outer filter excludes tenants that already have
-- locations, and the backfill uses ON CONFLICT DO NOTHING.

ALTER TABLE public.inventory_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations DISABLE ROW LEVEL SECURITY;

-- ── 1. Autocreate default warehouse for orphan tenants ──────────────────────
INSERT INTO public.inventory_locations (name, type, tenant_id)
SELECT DISTINCT 'Main Warehouse', 'WAREHOUSE', p.tenant_id
FROM public.products p
LEFT JOIN public.inventory_locations il ON il.tenant_id = p.tenant_id
WHERE p.stock > 0
  AND il.id IS NULL;

-- ── 2. Backfill ghost stock ─────────────────────────────────────────────────
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
    SELECT id INTO v_location_id
    FROM public.inventory_locations
    WHERE tenant_id = rec.tenant_id
    ORDER BY
      CASE WHEN UPPER(type) = 'WAREHOUSE' THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1;

    IF v_location_id IS NULL THEN
      -- Should never happen after step 1, but fail loud rather than silent.
      RAISE EXCEPTION 'STOCK-01 patch: no location for tenant % after auto-create', rec.tenant_id;
    END IF;

    INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id)
    VALUES (rec.product_id, v_location_id, rec.stock, rec.tenant_id)
    ON CONFLICT (product_id, location_id) DO NOTHING;
  END LOOP;
END $$;

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances  ENABLE ROW LEVEL SECURITY;
