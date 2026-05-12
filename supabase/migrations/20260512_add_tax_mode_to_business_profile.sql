-- Add tax_mode to business_profile for tax inclusive/exclusive setting
-- EXCLUSIVE = price shown before GST, tax added on top (default)
-- INCLUSIVE = price already contains GST, tax extracted from total
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'EXCLUSIVE'
  CHECK (tax_mode IN ('INCLUSIVE', 'EXCLUSIVE'));
