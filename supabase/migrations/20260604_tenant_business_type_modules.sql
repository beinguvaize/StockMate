-- Stage A foundation: vertical identity on the tenant.
-- business_type drives the default module set + terminology; modules is a
-- per-tenant override layer (jsonb). Existing tenants default to RETAIL
-- (the current product). Idempotent.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'RETAIL',
  ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenants_business_type_chk') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_business_type_chk
      CHECK (business_type IN ('RETAIL','RESTAURANT','SERVICES'));
  END IF;
END $$;
