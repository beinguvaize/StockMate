-- ============================================================
-- Returns: Sales Returns (Credit Notes) + Purchase Returns (Debit Notes)
-- ============================================================

-- 1. sales_returns table
CREATE TABLE IF NOT EXISTS public.sales_returns (
  id             TEXT PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id        TEXT REFERENCES public.sales(id) ON DELETE SET NULL,
  invoice_id     TEXT REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_id      TEXT,
  client_name    TEXT,
  items          JSONB NOT NULL DEFAULT '[]',
  total_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason         TEXT,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_sales_returns" ON public.sales_returns
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

-- 2. purchase_returns table
CREATE TABLE IF NOT EXISTS public.purchase_returns (
  id              TEXT PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_id     TEXT REFERENCES public.purchases(id) ON DELETE SET NULL,
  supplier_id     TEXT,
  supplier_name   TEXT,
  product_id      TEXT,
  product_name    TEXT,
  quantity        NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_price      NUMERIC(14,4),
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason          TEXT,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_purchase_returns" ON public.purchase_returns
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

-- ============================================================
-- RPC: process_sales_return
-- Inserts credit note, restocks items, decrements client balance
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_sales_return(
  p_id            TEXT,
  p_tenant_id     UUID,
  p_sale_id       TEXT,
  p_invoice_id    TEXT,
  p_client_id     TEXT,
  p_client_name   TEXT,
  p_items         JSONB,   -- [{id, name, quantity, rate}]
  p_total_amount  NUMERIC,
  p_reason        TEXT,
  p_date          DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
BEGIN
  -- Insert credit note
  INSERT INTO public.sales_returns (
    id, tenant_id, sale_id, invoice_id, client_id, client_name,
    items, total_amount, reason, date
  ) VALUES (
    p_id, p_tenant_id, p_sale_id, p_invoice_id, p_client_id, p_client_name,
    p_items, p_total_amount, p_reason, p_date
  );

  -- Restock each returned item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + (v_item->>'quantity')::NUMERIC
    WHERE id = (v_item->>'id')::TEXT
      AND tenant_id = p_tenant_id;
  END LOOP;

  -- Reduce client outstanding balance (if credit customer)
  IF p_client_id IS NOT NULL AND p_client_id <> '' THEN
    UPDATE public.clients
    SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - p_total_amount)
    WHERE id = p_client_id
      AND tenant_id = p_tenant_id;
  END IF;
END;
$$;

-- ============================================================
-- RPC: process_purchase_return
-- Inserts debit note, deducts stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_purchase_return(
  p_id            TEXT,
  p_tenant_id     UUID,
  p_purchase_id   TEXT,
  p_supplier_id   TEXT,
  p_supplier_name TEXT,
  p_product_id    TEXT,
  p_product_name  TEXT,
  p_quantity      NUMERIC,
  p_unit_price    NUMERIC,
  p_total_amount  NUMERIC,
  p_reason        TEXT,
  p_date          DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert debit note
  INSERT INTO public.purchase_returns (
    id, tenant_id, purchase_id, supplier_id, supplier_name,
    product_id, product_name, quantity, unit_price, total_amount, reason, date
  ) VALUES (
    p_id, p_tenant_id, p_purchase_id, p_supplier_id, p_supplier_name,
    p_product_id, p_product_name, p_quantity, p_unit_price, p_total_amount, p_reason, p_date
  );

  -- Deduct stock
  UPDATE public.products
  SET stock = GREATEST(0, COALESCE(stock, 0) - p_quantity)
  WHERE id = p_product_id
    AND tenant_id = p_tenant_id;
END;
$$;
