-- Store-level expenses: tag an expense with the store/till it was paid
-- from. NULL = business-wide (not tied to one store's drawer). The
-- Day Book counts a store's tagged expenses against that store's cash
-- drawer; business-wide expenses only appear under "All Stores".
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS location_id uuid;
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_location
  ON public.expenses (tenant_id, location_id);
