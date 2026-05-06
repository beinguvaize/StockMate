-- ============================================================
-- Price Lists — per-tier pricing with quantity breaks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.price_lists (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tier       TEXT    NOT NULL,                -- RETAIL | WHOLESALE | DISTRIBUTOR
  product_id TEXT    NOT NULL,                -- TEXT to match products.id type
  price      NUMERIC(14,2) NOT NULL,
  min_qty    INT     NOT NULL DEFAULT 1,      -- quantity break threshold
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, tier, product_id, min_qty)
);

CREATE INDEX IF NOT EXISTS idx_price_lists_lookup
  ON public.price_lists (tenant_id, tier, product_id, min_qty);

-- RLS
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_lists_tenant ON public.price_lists;
CREATE POLICY price_lists_tenant ON public.price_lists
  USING (tenant_id = current_tenant_id() OR is_global_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_global_admin());

-- ============================================================
-- resolve_price(product_id, tier, quantity, tenant_id)
-- Returns best price for product given tier + quantity.
-- Falls back to products.sellingPrice if no price list entry.
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_price(
  p_product_id TEXT,
  p_tier       TEXT,
  p_quantity   INT,
  p_tenant_id  UUID
) RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_price NUMERIC;
BEGIN
  -- Best matching tier price: highest min_qty that still fits
  SELECT price INTO v_price
  FROM public.price_lists
  WHERE tenant_id  = p_tenant_id
    AND product_id = p_product_id
    AND tier       = UPPER(p_tier)
    AND min_qty   <= COALESCE(p_quantity, 1)
  ORDER BY min_qty DESC
  LIMIT 1;

  -- Fallback: base selling price from products table
  IF v_price IS NULL THEN
    SELECT "sellingPrice" INTO v_price
    FROM public.products
    WHERE id = p_product_id AND tenant_id = p_tenant_id
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_price, 0);
END;
$$;
