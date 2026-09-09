-- Appointments: the two things 20260604_services_vertical.sql could not know.
--
-- 1. updated_at is missing.
--
--    20260521_phase0_sync_readiness.sql adds updated_at and deleted_at to every
--    table by looping over pg_tables — and it runs BEFORE the migration that
--    creates appointments. So this table got deleted_at only because both were
--    later applied to the live project by hand. On a clean `supabase db reset`
--    the loop finds no appointments table, the column never appears, and
--    useAppointments.js's `.is('deleted_at', null)` breaks on a fresh
--    environment. Dev shows the split today: deleted_at present, updated_at
--    absent.
--
--    It is also why offlineReads.test.js lists useAppointments.js as BLOCKED
--    from offline reads: pullOne filters on updated_at, so without it the table
--    can never be cached. This does not turn offline on; it removes the reason
--    it cannot be.
--
-- 2. status has no CHECK.
--
--    The four values live in a SQL comment and a JS object literal. Any string
--    can be written today, and a typo would render as an unknown chip and be
--    skipped by every status filter.

-- The trigger function itself is created by the same phase-0 migration, so an
-- environment that never ran it does not have this either — dev did not, which
-- is how this was found. Idempotent and identical to the live definition.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.appointments;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Existing rows first, or the constraint cannot be validated. Prod has none
-- today, so this is a no-op there and a safety net for any other environment.
UPDATE public.appointments
   SET status = 'BOOKED'
 WHERE status IS NULL
    OR upper(status) NOT IN ('BOOKED', 'COMPLETED', 'CANCELLED', 'NOSHOW');

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('BOOKED', 'COMPLETED', 'CANCELLED', 'NOSHOW'));

-- The update policy had USING but no WITH CHECK, so a row could be updated
-- INTO another tenant. Reads were never exposed; writes could move a booking
-- out of reach.
DROP POLICY IF EXISTS tenant_update ON public.appointments;
CREATE POLICY tenant_update ON public.appointments
  FOR UPDATE
  USING      ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()))
  WITH CHECK ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()));
