-- ============================================================
-- Invoice delivery flag management
-- Ensures column exists + provides SECURITY DEFINER RPC
-- so admin impersonation / RLS bypass works correctly
-- ============================================================

-- 1. Ensure column exists (idempotent)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS delivery_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_status   TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_route_id  TEXT;

-- Index for dispatching queries
CREATE INDEX IF NOT EXISTS idx_invoices_delivery
  ON public.invoices (tenant_id, delivery_required, delivery_status)
  WHERE delivery_required = true;

-- 2. RPC: toggle delivery flag (bypasses RLS)
CREATE OR REPLACE FUNCTION public.set_invoice_delivery(
  p_invoice_id TEXT,
  p_required   BOOLEAN,
  p_tenant_id  UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Resolve tenant — prefer explicit param, else from invoices row
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  ELSE
    SELECT tenant_id INTO v_tenant_id
    FROM public.invoices WHERE id = p_invoice_id LIMIT 1;
  END IF;

  UPDATE public.invoices
  SET
    delivery_required = p_required,
    delivery_status   = CASE
                          WHEN p_required THEN COALESCE(delivery_status, 'PENDING')
                          ELSE NULL
                        END
  WHERE id = p_invoice_id
    AND (v_tenant_id IS NULL OR tenant_id = v_tenant_id);
END;
$$;
