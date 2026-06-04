-- R1 Menu: dish semantics on products (restaurant vertical). Retail ignores these.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS food_type text,        -- VEG | NONVEG | EGG | null
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,  -- 86'ing
  ADD COLUMN IF NOT EXISTS station text;          -- kitchen station (Tandoor, Bar…)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_food_type_chk') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_food_type_chk
      CHECK (food_type IS NULL OR food_type IN ('VEG','NONVEG','EGG'));
  END IF;
END $$;
