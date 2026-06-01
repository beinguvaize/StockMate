-- Phase 1b: per-store cash drawer. day_book gets location_id; the
-- all-zero UUID is the sentinel for the tenant-wide "All stores" drawer
-- so unique (tenant_id, date, location_id) holds without NULL ambiguity
-- and the supabase upsert onConflict target stays simple.
ALTER TABLE public.day_book ADD COLUMN IF NOT EXISTS location_id uuid;
UPDATE public.day_book SET location_id = '00000000-0000-0000-0000-000000000000' WHERE location_id IS NULL;
ALTER TABLE public.day_book ALTER COLUMN location_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.day_book ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE public.day_book DROP CONSTRAINT IF EXISTS day_book_tenant_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS day_book_tenant_date_location_key
  ON public.day_book (tenant_id, date, location_id);
