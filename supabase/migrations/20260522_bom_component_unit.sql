-- BOM component quantity may be expressed in the raw product's base unit
-- or its alternate (secondary) unit. The app converts to base when a
-- production order scales the recipe.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-22.
ALTER TABLE public.bom_components
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'BASE';
