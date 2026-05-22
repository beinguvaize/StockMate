-- Manufacturing module — Phase 1: BOM, production orders, cost roll-up.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-22.

-- 1. Product type — RAW (consume-only) | FINISHED (manufactured) | STANDARD
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'STANDARD';

-- 2-6. New tables: bom, bom_components, production_orders,
--      production_order_materials, production_costs
CREATE TABLE IF NOT EXISTS public.bom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  finished_product_id text NOT NULL,
  name text,
  output_qty numeric NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.bom_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bom_id uuid NOT NULL REFERENCES public.bom(id) ON DELETE CASCADE,
  raw_product_id text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bom_id uuid REFERENCES public.bom(id) ON DELETE SET NULL,
  finished_product_id text NOT NULL,
  qty_produced numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT',
  production_date date NOT NULL DEFAULT current_date,
  material_cost numeric NOT NULL DEFAULT 0,
  other_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.production_order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  raw_product_id text NOT NULL,
  qty_consumed numeric NOT NULL DEFAULT 0,
  unit_cost_at_build numeric NOT NULL DEFAULT 0,
  line_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.production_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  cost_type text NOT NULL DEFAULT 'OTHER',
  label text,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- 7. RLS — tenant isolation (mirrors existing tables) + indexes + updated_at trigger
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bom','bom_components','production_orders','production_order_materials','production_costs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_select ON public.%I FOR SELECT USING ((tenant_id = current_tenant_id()) OR is_global_admin())$p$, t);
    EXECUTE format($p$CREATE POLICY tenant_insert ON public.%I FOR INSERT WITH CHECK ((tenant_id = current_tenant_id()) OR is_global_admin())$p$, t);
    EXECUTE format($p$CREATE POLICY tenant_update ON public.%I FOR UPDATE USING ((tenant_id = current_tenant_id()) OR is_global_admin())$p$, t);
    EXECUTE format($p$CREATE POLICY tenant_delete ON public.%I FOR DELETE USING (((tenant_id = current_tenant_id()) AND is_tenant_admin()) OR is_global_admin())$p$, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON public.%I (tenant_id)', t, t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- 8. complete_production_order — atomic: consume raws, cost, produce finished goods.
--    Material cost = standard cost (products.costPrice). Finished goods enter
--    as a product_batch so the existing FIFO engine costs them downstream.
CREATE OR REPLACE FUNCTION public.complete_production_order(p_order_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
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
      p_product_id := v_mat.raw_product_id, p_location_id := NULL,
      p_amount := -v_mat.qty_consumed, p_reason := 'Production consume', p_tenant_id := p_tenant_id);
    UPDATE public.production_order_materials
       SET unit_cost_at_build = v_cost, line_cost = v_cost * v_mat.qty_consumed
     WHERE id = v_mat.id;
    v_material_cost := v_material_cost + (v_cost * v_mat.qty_consumed);
  END LOOP;

  SELECT COALESCE(SUM(amount), 0) INTO v_other_cost
  FROM public.production_costs WHERE production_order_id = p_order_id;

  v_total := v_material_cost + v_other_cost;
  v_unit  := v_total / v_order.qty_produced;

  PERFORM public.adjust_inventory_atomic(
    p_product_id := v_order.finished_product_id, p_location_id := NULL,
    p_amount := v_order.qty_produced, p_reason := 'Production output', p_tenant_id := p_tenant_id);

  INSERT INTO public.product_batches
    (product_id, tenant_id, unit_cost, qty_received, qty_remaining, received_date, manufacturing_date, note)
  VALUES
    (v_order.finished_product_id, p_tenant_id, v_unit, v_order.qty_produced, v_order.qty_produced,
     current_date, current_date, 'Manufactured');

  UPDATE public.production_orders
     SET material_cost = v_material_cost, other_cost = v_other_cost,
         total_cost = v_total, unit_cost = v_unit, status = 'COMPLETED'
   WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true,
    'material_cost', v_material_cost, 'other_cost', v_other_cost,
    'total_cost', v_total, 'unit_cost', v_unit);
END;
$fn$;
