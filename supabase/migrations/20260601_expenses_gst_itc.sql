-- Expense feature: GST input-tax-credit capture.
--
-- For a GST-registered business, the GST paid on a business expense
-- (with a valid vendor GSTIN) is claimable as input tax credit. We
-- capture the vendor's GSTIN and the GST component of the expense so
-- the ITC can be totalled and fed into GST reporting later.
--
--   gst_rate     — % applied (0/5/12/18/28), nullable.
--   gst_amount   — the tax component in currency (the claimable ITC).
--   vendor_gstin — supplier's GSTIN; ITC is only valid when present.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS gst_rate     numeric,
  ADD COLUMN IF NOT EXISTS gst_amount   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_gstin text;
