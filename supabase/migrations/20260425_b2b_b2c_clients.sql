-- ============================================================
-- B2B/B2C Client Classification
-- Adds client_type, price_tier, credit_days to clients table
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_type  TEXT NOT NULL DEFAULT 'B2C',
  ADD COLUMN IF NOT EXISTS price_tier   TEXT NOT NULL DEFAULT 'RETAIL',
  ADD COLUMN IF NOT EXISTS credit_days  INT  NOT NULL DEFAULT 0;

-- client_type: 'B2B' (business account, invoices, credit terms)
--              'B2C' (consumer, POS/van sale, receipt only)
-- price_tier:  'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR'
-- credit_days: 0 = cash, 30/60/90 = net terms

COMMENT ON COLUMN public.clients.client_type IS 'B2B = business account; B2C = end consumer';
COMMENT ON COLUMN public.clients.price_tier  IS 'Which price list tier applies: RETAIL | WHOLESALE | DISTRIBUTOR';
COMMENT ON COLUMN public.clients.credit_days IS 'Payment terms in days. 0 = cash on delivery.';
