-- Recurring expenses: daily (with weekdays), catch-up, in-database schedule
-- ============================================================================
--
-- Owner asked for a DAILY recurring expense option. Looking at what exists
-- turned up three things worth fixing in the same pass:
--
-- 1. Nothing has ever generated a recurring expense in prod. The generator is
--    called only by the GitHub "Nightly · Generate recurring" workflow, whose
--    service-role key has expired; it has failed every night. (0 templates in
--    prod today, so nothing was lost yet.) Generation now runs inside the
--    database on pg_cron -- no external key to expire.
--
-- 2. The generator was SECURITY DEFINER and EXECUTE-able by anon and
--    authenticated: any caller could generate expenses for EVERY shop, for any
--    date. Execute is now limited to the scheduler/service role, and a run
--    date in the future is refused.
--
-- 3. A missed night was lost for good -- it only matched "today". It now
--    catches up every due date since the template last ran (at most 31 days
--    back), and a unique index makes a second run on the same day a no-op.
--
-- Frequencies:
--   MONTHLY  as before: on day_of_month (clamped to 28).
--   DAILY    every day, or only on the ISO weekdays listed (1 = Mon … 7 = Sun),
--            e.g. {1,2,3,4,5,6} to skip Sunday when the shop is shut.
-- start_date: nothing is generated before it. last_generated: the last day the
-- template was considered; generation resumes the day after.
--
-- The generated expense is an ordinary expenses row, so the cash ledger and GL
-- post it through their existing triggers -- no money logic here.

ALTER TABLE public.recurring_expense_templates
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS weekdays smallint[];

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_expense_templates_frequency_ck') THEN
    ALTER TABLE public.recurring_expense_templates
      ADD CONSTRAINT recurring_expense_templates_frequency_ck CHECK (frequency IN ('DAILY', 'MONTHLY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_expense_templates_weekdays_ck') THEN
    ALTER TABLE public.recurring_expense_templates
      ADD CONSTRAINT recurring_expense_templates_weekdays_ck
      CHECK (weekdays IS NULL OR (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]));
  END IF;
END $c$;

-- One generated expense per template per day, whatever runs twice.
CREATE UNIQUE INDEX IF NOT EXISTS expenses_one_per_recurring_day
  ON public.expenses (recurring_template_id, date)
  WHERE recurring_template_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses(p_run_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(template_id text, expense_id text, tenant_id uuid, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  t       record;
  d       date;
  v_from  date;
  v_due   boolean;
  v_eid   text;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_run_date IS NULL OR p_run_date > v_today THEN
    RAISE EXCEPTION 'generate_due_recurring_expenses: run date % is in the future', p_run_date;
  END IF;

  FOR t IN
    SELECT * FROM public.recurring_expense_templates
     WHERE active = true AND deleted_at IS NULL
     ORDER BY id
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Resume the day after the last run, never before start_date, and never
    -- reach back more than 31 days.
    v_from := GREATEST(
      COALESCE(t.last_generated + 1, t.start_date, p_run_date),
      COALESCE(t.start_date, '-infinity'::date),
      p_run_date - 31);

    FOR d IN SELECT generate_series(v_from, p_run_date, interval '1 day')::date LOOP
      IF t.frequency = 'DAILY' THEN
        v_due := t.weekdays IS NULL OR EXTRACT(isodow FROM d)::smallint = ANY (t.weekdays);
      ELSE
        v_due := EXTRACT(day FROM d)::int = LEAST(COALESCE(t.day_of_month, 1), 28);
      END IF;
      CONTINUE WHEN NOT v_due;

      v_eid := 'EXP-' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO public.expenses
        (id, tenant_id, category, amount, note, date, payment_method, recurring_template_id)
      VALUES
        (v_eid, t.tenant_id, t.category, t.amount, COALESCE(t.note, t.category) || ' (recurring)',
         d::text, t.payment_method, t.id)
      ON CONFLICT (recurring_template_id, date)
        WHERE recurring_template_id IS NOT NULL AND deleted_at IS NULL
        DO NOTHING;
      IF FOUND THEN
        template_id := t.id; expense_id := v_eid; tenant_id := t.tenant_id; amount := t.amount;
        RETURN NEXT;
      END IF;
    END LOOP;

    UPDATE public.recurring_expense_templates
       SET last_generated = GREATEST(COALESCE(last_generated, p_run_date), p_run_date)
     WHERE id = t.id;
  END LOOP;
END
$fn$;

-- Only the scheduler (postgres) and the service role may run it.
REVOKE ALL ON FUNCTION public.generate_due_recurring_expenses(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses(date) TO service_role;

-- Nightly at 01:00 IST (19:30 UTC), for the IST date. Re-running is harmless.
DO $s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recurring-expenses-nightly';
    PERFORM cron.schedule('recurring-expenses-nightly', '30 19 * * *',
      $job$SELECT public.generate_due_recurring_expenses((now() AT TIME ZONE 'Asia/Kolkata')::date)$job$);
  ELSE
    RAISE NOTICE 'pg_cron not installed here; recurring expenses will not be scheduled';
  END IF;
END $s$;
