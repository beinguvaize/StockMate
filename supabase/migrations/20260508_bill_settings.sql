-- Add bill_settings JSONB to business_profile.
-- Tenants control what appears on their 80mm POS receipt.
-- NULL means "use defaults" — no breaking change for existing rows.

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS bill_settings jsonb;

COMMENT ON COLUMN public.business_profile.bill_settings IS
  'Per-tenant POS receipt layout. Keys: show_address, show_phone, show_gstin, '
  'show_customer_name, show_customer_gstin, show_tax_breakdown, show_upi, '
  'show_discount, bill_title, footer_message. NULL = use defaults.';
