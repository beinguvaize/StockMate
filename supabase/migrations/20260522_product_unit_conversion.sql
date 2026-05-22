-- Unit conversion: each product may have one alternate (secondary) unit
-- with a conversion factor. 1 secondary_unit = conversion_factor x base unit
-- (base unit = the existing products.unit column).
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-22.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS secondary_unit text,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric;
