-- Add discount column to sales (additive, default 0). Net total already
-- flows through process_sale unchanged; this stores the discount amount
-- for reporting/receipts.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
