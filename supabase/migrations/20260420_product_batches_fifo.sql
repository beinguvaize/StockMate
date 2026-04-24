-- Batch tracking + FIFO inventory.
-- Each purchase inserts a new product_batches row (same product_id, separate
-- cost lot). Sales consume oldest-open batches first via consume_fifo(), which
-- locks rows FOR UPDATE to stay safe under concurrent checkout.
-- products.costPrice is recomputed as the weighted average of remaining open
-- batches so reports and COGS stay coherent.
-- No seed of existing stock per user instruction; pre-existing products keep
-- their current stock + costPrice and will simply have no batch history until
-- their next purchase.

-- 1. product_batches: one row per purchase lot
CREATE TABLE IF NOT EXISTS public.product_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  product_id      text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  purchase_id     text REFERENCES public.purchases(id) ON DELETE SET NULL,
  supplier_id     text,
  received_date   date NOT NULL DEFAULT CURRENT_DATE,
  unit_cost       numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  qty_received    numeric(14,3) NOT NULL CHECK (qty_received > 0),
  qty_remaining   numeric(14,3) NOT NULL CHECK (qty_remaining >= 0),
  expiry_date     date,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pb_tenant_product_open
  ON public.product_batches (tenant_id, product_id, received_date, created_at)
  WHERE qty_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_pb_purchase ON public.product_batches (purchase_id);

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pb_tenant_read ON public.product_batches;
CREATE POLICY pb_tenant_read ON public.product_batches
  FOR SELECT TO authenticated
  USING (is_global_admin() OR tenant_id = current_tenant_id());

-- Writes only via SECURITY DEFINER RPCs. No direct INSERT/UPDATE/DELETE policy.

-- 2. sale_batch_consumption: which batches a sale drew from (FIFO audit trail)
CREATE TABLE IF NOT EXISTS public.sale_batch_consumption (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  sale_id     text NOT NULL,
  product_id  text NOT NULL,
  batch_id    uuid NOT NULL REFERENCES public.product_batches(id) ON DELETE CASCADE,
  qty_taken   numeric(14,3) NOT NULL CHECK (qty_taken > 0),
  unit_cost   numeric(14,4) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbc_sale ON public.sale_batch_consumption (sale_id);
CREATE INDEX IF NOT EXISTS idx_sbc_batch ON public.sale_batch_consumption (batch_id);
CREATE INDEX IF NOT EXISTS idx_sbc_tenant_product ON public.sale_batch_consumption (tenant_id, product_id);

ALTER TABLE public.sale_batch_consumption ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sbc_tenant_read ON public.sale_batch_consumption;
CREATE POLICY sbc_tenant_read ON public.sale_batch_consumption
  FOR SELECT TO authenticated
  USING (is_global_admin() OR tenant_id = current_tenant_id());

-- 3. Helper: recompute product weighted-avg cost from open batches
CREATE OR REPLACE FUNCTION public.recompute_product_cost(
  p_tenant_id uuid,
  p_product_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
  v_total_qty numeric;
BEGIN
  SELECT
    CASE WHEN SUM(qty_remaining) > 0
         THEN SUM(qty_remaining * unit_cost) / SUM(qty_remaining)
         ELSE NULL END,
    SUM(qty_remaining)
    INTO v_cost, v_total_qty
  FROM public.product_batches
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND qty_remaining > 0;

  IF v_cost IS NOT NULL THEN
    UPDATE public.products
       SET "costPrice" = ROUND(v_cost, 4)
     WHERE id = p_product_id AND tenant_id = p_tenant_id;
  END IF;
END;
$$;

-- 4. consume_fifo: deduct qty from oldest-open batches; returns total COGS
CREATE OR REPLACE FUNCTION public.consume_fifo(
  p_tenant_id uuid,
  p_sale_id text,
  p_product_id text,
  p_qty numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  v_remaining numeric := p_qty;
  v_take numeric;
  v_cogs numeric := 0;
  v_has_batches boolean;
  v_fallback_cost numeric;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN 0;
  END IF;

  -- Check if product has any batch history. New-feature rollout: products
  -- without batches (pre-existing stock) fall back to products."costPrice" *
  -- qty so legacy inventory still sells.
  SELECT EXISTS (
    SELECT 1 FROM public.product_batches
    WHERE tenant_id = p_tenant_id AND product_id = p_product_id
  ) INTO v_has_batches;

  IF NOT v_has_batches THEN
    SELECT COALESCE("costPrice", 0) INTO v_fallback_cost
    FROM public.products
    WHERE id = p_product_id AND tenant_id = p_tenant_id;
    RETURN COALESCE(v_fallback_cost, 0) * p_qty;
  END IF;

  FOR b IN
    SELECT id, qty_remaining, unit_cost
    FROM public.product_batches
    WHERE tenant_id = p_tenant_id
      AND product_id = p_product_id
      AND qty_remaining > 0
    ORDER BY received_date ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(b.qty_remaining, v_remaining);

    UPDATE public.product_batches
       SET qty_remaining = qty_remaining - v_take
     WHERE id = b.id;

    INSERT INTO public.sale_batch_consumption
      (tenant_id, sale_id, product_id, batch_id, qty_taken, unit_cost)
    VALUES
      (p_tenant_id, p_sale_id, p_product_id, b.id, v_take, b.unit_cost);

    v_cogs := v_cogs + (v_take * b.unit_cost);
    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    -- Oversell vs tracked batches. Use latest batch cost as cost proxy; do
    -- NOT block the sale (keeps behaviour compatible with pre-FIFO codepath
    -- that silently clamped products.stock to 0).
    SELECT unit_cost INTO v_fallback_cost
    FROM public.product_batches
    WHERE tenant_id = p_tenant_id AND product_id = p_product_id
    ORDER BY received_date DESC, created_at DESC
    LIMIT 1;
    v_cogs := v_cogs + (COALESCE(v_fallback_cost, 0) * v_remaining);
  END IF;

  RETURN v_cogs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_fifo(uuid, text, text, numeric) TO authenticated;

-- 5. restore_fifo: put consumed qty back when a sale is deleted/voided
CREATE OR REPLACE FUNCTION public.restore_fifo(
  p_tenant_id uuid,
  p_sale_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT batch_id, qty_taken, product_id
    FROM public.sale_batch_consumption
    WHERE tenant_id = p_tenant_id AND sale_id = p_sale_id
  LOOP
    UPDATE public.product_batches
       SET qty_remaining = qty_remaining + r.qty_taken
     WHERE id = r.batch_id;
  END LOOP;

  DELETE FROM public.sale_batch_consumption
  WHERE tenant_id = p_tenant_id AND sale_id = p_sale_id;

  -- Recompute weighted cost for affected products
  PERFORM public.recompute_product_cost(p_tenant_id, pid)
  FROM (
    SELECT DISTINCT product_id AS pid
    FROM public.sale_batch_consumption
    WHERE tenant_id = p_tenant_id AND sale_id = p_sale_id
  ) q;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_fifo(uuid, text) TO authenticated;

-- 6. Rewrite process_purchase to also insert a batch row + recompute cost
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
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_tenant UUID;
  v_is_admin BOOLEAN;
  v_target_location UUID;
  v_supplier_name TEXT;
  v_unit_cost NUMERIC;
  v_received_date DATE;
BEGIN
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

  IF p_location_id IS NOT NULL THEN
    v_target_location := p_location_id;
  ELSE
    SELECT id INTO v_target_location FROM public.inventory_locations
    WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE' LIMIT 1;
  END IF;

  SELECT name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = p_supplier_id AND tenant_id = v_tenant_id
  LIMIT 1;

  INSERT INTO public.purchases (
    id, total_amount, date, linked_product_id, product_id,
    supplier_id, supplier_name, payment_type, notes, quantity, tenant_id
  )
  VALUES (
    p_id, p_total_amount, p_date, p_product_id, p_product_id,
    p_supplier_id, v_supplier_name, p_payment_type, p_notes, p_quantity, v_tenant_id
  );

  -- Insert batch lot
  IF p_product_id IS NOT NULL AND p_quantity > 0 THEN
    v_unit_cost := CASE WHEN p_quantity > 0
                        THEN p_total_amount::numeric / p_quantity::numeric
                        ELSE 0 END;
    BEGIN
      v_received_date := p_date::date;
    EXCEPTION WHEN OTHERS THEN
      v_received_date := CURRENT_DATE;
    END;

    INSERT INTO public.product_batches
      (tenant_id, product_id, purchase_id, supplier_id, received_date,
       unit_cost, qty_received, qty_remaining, note)
    VALUES
      (v_tenant_id, p_product_id, p_id, p_supplier_id, v_received_date,
       ROUND(v_unit_cost, 4), p_quantity, p_quantity, p_notes);

    PERFORM public.recompute_product_cost(v_tenant_id, p_product_id);
  END IF;

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

-- 7. Rewrite process_sale to consume FIFO for COGS
CREATE OR REPLACE FUNCTION public.process_sale(
  p_id text,
  p_shop_id text,
  p_items jsonb,
  p_total_amount numeric,
  p_payment_method text,
  p_payment_status text,
  p_date text,
  p_user_id text,
  p_location_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  v_tenant_id UUID;
  v_user_tenant UUID;
  v_is_admin BOOLEAN;
  v_source_location UUID;
  v_cogs NUMERIC;
  v_total_cogs NUMERIC := 0;
BEGIN
  SELECT tenant_id, (roles @> ARRAY['GLOBAL_ADMIN']::text[])
    INTO v_user_tenant, v_is_admin
  FROM public.users WHERE id = p_user_id LIMIT 1;

  IF v_user_tenant IS NULL THEN
    RAISE EXCEPTION 'User not found or has no tenant assignment';
  END IF;

  IF p_tenant_id IS NOT NULL AND COALESCE(v_is_admin, FALSE) THEN
    v_tenant_id := p_tenant_id;
  ELSE
    v_tenant_id := v_user_tenant;
  END IF;

  IF p_location_id IS NOT NULL THEN
    v_source_location := p_location_id;
  ELSE
    SELECT id INTO v_source_location
    FROM public.inventory_locations
    WHERE tenant_id = v_tenant_id AND type = 'WAREHOUSE'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

    IF v_source_location IS NULL THEN
      INSERT INTO public.inventory_locations (id, tenant_id, name, type)
      VALUES (gen_random_uuid(), v_tenant_id, 'Main Warehouse', 'WAREHOUSE')
      RETURNING id INTO v_source_location;
    END IF;
  END IF;

  -- Consume FIFO per item, accumulate COGS
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id text, quantity numeric, name text) LOOP
    v_cogs := public.consume_fifo(v_tenant_id, p_id, item.id, item.quantity);
    v_total_cogs := v_total_cogs + COALESCE(v_cogs, 0);
  END LOOP;

  INSERT INTO public.sales (id, "shopId", items, "totalAmount", "totalCogs", "paymentMethod", "paymentStatus", date, "bookedBy", tenant_id, "vehicleId")
  VALUES (
    p_id, p_shop_id, p_items, p_total_amount, v_total_cogs,
    p_payment_method, p_payment_status, p_date, p_user_id, v_tenant_id,
    (SELECT reference_id FROM public.inventory_locations WHERE id = v_source_location AND type = 'VEHICLE')
  );

  -- Stock + inventory balances + movement log
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id text, quantity numeric, name text) LOOP
    UPDATE public.products
    SET stock = GREATEST(0, COALESCE(stock, 0) - item.quantity)
    WHERE id = item.id AND tenant_id = v_tenant_id;

    INSERT INTO public.inventory_balances (location_id, product_id, quantity, tenant_id)
    VALUES (v_source_location, item.id, 0, v_tenant_id)
    ON CONFLICT (location_id, product_id, tenant_id) DO NOTHING;

    UPDATE public.inventory_balances
    SET quantity = GREATEST(0, quantity - item.quantity),
        updated_at = now()
    WHERE location_id = v_source_location
      AND product_id = item.id
      AND tenant_id = v_tenant_id;

    INSERT INTO public.movement_log (id, date, product_id, product_name, type, quantity, reason, user_id, tenant_id)
    VALUES (gen_random_uuid()::text, p_date, item.id, item.name, 'OUT', item.quantity, 'Sale: ' || p_id, p_user_id, v_tenant_id);

    PERFORM public.recompute_product_cost(v_tenant_id, item.id);
  END LOOP;

  IF UPPER(COALESCE(p_payment_method, '')) = 'CREDIT' AND p_shop_id IS NOT NULL THEN
    UPDATE public.clients
    SET outstanding_balance = COALESCE(outstanding_balance, 0) + p_total_amount
    WHERE id = p_shop_id AND tenant_id = v_tenant_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale(
  text, text, jsonb, numeric, text, text, text, text, uuid, uuid
) TO authenticated;

-- 8. View: per-product open-batch summary (for UI Batches tab)
CREATE OR REPLACE VIEW public.v_product_batch_summary AS
SELECT
  pb.tenant_id,
  pb.product_id,
  COUNT(*) FILTER (WHERE pb.qty_remaining > 0) AS open_batch_count,
  SUM(pb.qty_remaining)                        AS total_remaining,
  MIN(pb.received_date) FILTER (WHERE pb.qty_remaining > 0) AS oldest_open_date,
  CASE WHEN SUM(pb.qty_remaining) > 0
       THEN ROUND(SUM(pb.qty_remaining * pb.unit_cost) / SUM(pb.qty_remaining), 4)
       ELSE NULL END AS weighted_avg_cost
FROM public.product_batches pb
GROUP BY pb.tenant_id, pb.product_id;

GRANT SELECT ON public.v_product_batch_summary TO authenticated;
