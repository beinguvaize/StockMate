-- ============================================================
-- Orders Pipeline Table — B2B pre-orders and delivery orders
-- Separate from `sales` (POS) and `invoices` (billing docs)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number   TEXT    NOT NULL,
  client_id      TEXT,                       -- TEXT to match clients.id
  client_name    TEXT    NOT NULL DEFAULT '',
  order_type     TEXT    NOT NULL DEFAULT 'B2B',   -- B2B | B2C
  price_tier     TEXT    NOT NULL DEFAULT 'RETAIL', -- RETAIL | WHOLESALE | DISTRIBUTOR
  status         TEXT    NOT NULL DEFAULT 'DRAFT',
    -- DRAFT → CONFIRMED → PICKING → DISPATCHED → DELIVERED → INVOICED | CANCELLED

  items          JSONB   NOT NULL DEFAULT '[]',
  -- each item: { productId, productName, qty, unitPrice, total }

  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total    NUMERIC(14,2) NOT NULL DEFAULT 0,

  notes          TEXT,
  requested_date DATE,                       -- when client wants delivery

  route_id       TEXT,                       -- set when DISPATCHED via a van route
  sale_id        TEXT,                       -- set when converted to a van/POS sale
  invoice_id     TEXT,                       -- set when INVOICED

  created_by     TEXT,                       -- users.id
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-order numbers per tenant (e.g. ORD-0001)
CREATE SEQUENCE IF NOT EXISTS public.order_seq START 1 INCREMENT 1;

-- Trigger: stamp updated_at
CREATE OR REPLACE FUNCTION public.orders_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status
  ON public.orders (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_client
  ON public.orders (tenant_id, client_id)
  WHERE client_id IS NOT NULL;

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_tenant ON public.orders;
CREATE POLICY orders_tenant ON public.orders
  USING (tenant_id = current_tenant_id() OR is_global_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_global_admin());

-- ============================================================
-- create_order RPC — creates an order with auto order_number
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_order(
  p_tenant_id    UUID,
  p_client_id    TEXT,
  p_client_name  TEXT,
  p_order_type   TEXT,
  p_price_tier   TEXT,
  p_items        JSONB,
  p_subtotal     NUMERIC,
  p_discount     NUMERIC,
  p_grand_total  NUMERIC,
  p_notes        TEXT,
  p_requested_date DATE,
  p_created_by   TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id          UUID := gen_random_uuid();
  v_seq         BIGINT;
  v_order_num   TEXT;
BEGIN
  v_seq       := nextval('public.order_seq');
  v_order_num := 'ORD-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO public.orders (
    id, tenant_id, order_number, client_id, client_name,
    order_type, price_tier, status, items,
    subtotal, discount, grand_total, notes, requested_date, created_by
  ) VALUES (
    v_id, p_tenant_id, v_order_num, p_client_id, p_client_name,
    UPPER(COALESCE(p_order_type, 'B2B')),
    UPPER(COALESCE(p_price_tier, 'RETAIL')),
    'DRAFT', p_items,
    COALESCE(p_subtotal, 0), COALESCE(p_discount, 0), COALESCE(p_grand_total, 0),
    p_notes, p_requested_date, p_created_by
  );

  RETURN v_id;
END;
$$;

-- ============================================================
-- advance_order_status RPC — valid transitions only
-- ============================================================
CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id  UUID,
  p_status    TEXT,
  p_tenant_id UUID,
  p_route_id  TEXT    DEFAULT NULL,
  p_sale_id   TEXT    DEFAULT NULL,
  p_invoice_id TEXT   DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current TEXT;
BEGIN
  SELECT status INTO v_current
  FROM public.orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Validate transition
  IF NOT (
    (v_current = 'DRAFT'      AND p_status IN ('CONFIRMED', 'CANCELLED')) OR
    (v_current = 'CONFIRMED'  AND p_status IN ('PICKING',   'CANCELLED')) OR
    (v_current = 'PICKING'    AND p_status IN ('DISPATCHED','CANCELLED')) OR
    (v_current = 'DISPATCHED' AND p_status IN ('DELIVERED', 'CANCELLED')) OR
    (v_current = 'DELIVERED'  AND p_status = 'INVOICED') OR
    (v_current = 'CANCELLED'  AND p_status = 'DRAFT')   -- allow reopen
  ) THEN
    RAISE EXCEPTION 'Invalid transition: % → %', v_current, p_status;
  END IF;

  UPDATE public.orders SET
    status     = p_status,
    route_id   = COALESCE(p_route_id,   route_id),
    sale_id    = COALESCE(p_sale_id,    sale_id),
    invoice_id = COALESCE(p_invoice_id, invoice_id),
    updated_at = NOW()
  WHERE id = p_order_id AND tenant_id = p_tenant_id;
END;
$$;
