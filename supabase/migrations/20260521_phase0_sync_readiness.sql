-- Phase 0: offline-sync readiness.
-- Adds updated_at (auto-maintained) + deleted_at (soft delete) to every
-- public table, plus an index on updated_at for delta-sync queries.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-21.

-- 1. Generic trigger function: stamp updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Apply columns, trigger and index to every table in public schema.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_updated_at ON public.%I (updated_at)', t, t);
  END LOOP;
END $$;
