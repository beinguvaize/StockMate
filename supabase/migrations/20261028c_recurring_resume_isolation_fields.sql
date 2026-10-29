-- Recurring expenses: review fixes (Senior Developer, PR #163)
-- ============================================================================
--
-- 1. HIGH -- resuming a paused template booked every paused day. Pause only
--    set active = false and last_generated stayed put, so the next run caught
--    up to 31 days: a Rs 500 daily expense paused for two weeks would have
--    booked Rs 7,500 on resume. A trigger now moves last_generated to today
--    (IST) whenever a template is switched back on -- server-side, so every
--    client (web, desktop, installed mobile builds) is covered.
--
-- 2. One bad template stopped the whole night for every shop: no per-template
--    error handling, and a failure was visible only in cron.job_run_details.
--    Each template now runs in its own subtransaction; a failure is recorded
--    on that template (last_error, last_error_at) for the screen to show, and
--    the run moves on.
--
-- 3. Generated expenses dropped the store, the exclude-from-P&L flag and the
--    GST fields, because the template had nowhere to keep them -- so a daily
--    owner's draw marked "exclude from P&L" would hit P&L every day. The
--    template now carries them and the generator copies them.
--
-- 4. generate_due_recurring_invoices had the same hole the expense generator
--    had: SECURITY DEFINER and executable by anon/authenticated. Locked to the
--    scheduler/service role, and scheduled on pg_cron like expenses (the
--    GitHub workflow that called it runs on an expired key).

ALTER TABLE public.recurring_expense_templates
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS exclude_from_pl boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_rate numeric,
  ADD COLUMN IF NOT EXISTS gst_amount numeric,
  ADD COLUMN IF NOT EXISTS vendor_gstin text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

-- ── 1. resume never back-fills ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recurring_expense_resume_from_today()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  -- A restore puts back exactly what was saved. This trigger would
  -- re-post, re-derive or rewrite it, so it stands aside while one runs.
  IF public.is_restoring() THEN
    RETURN NEW;
  END IF;
  IF NEW.active AND NOT COALESCE(OLD.active, false) THEN
    NEW.last_generated := GREATEST(COALESCE(NEW.last_generated, '-infinity'::date),
                                   (now() AT TIME ZONE 'Asia/Kolkata')::date);
    NEW.last_error := NULL;
    NEW.last_error_at := NULL;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_recurring_expense_resume ON public.recurring_expense_templates;
CREATE TRIGGER trg_recurring_expense_resume
  BEFORE UPDATE OF active ON public.recurring_expense_templates
  FOR EACH ROW EXECUTE FUNCTION public.recurring_expense_resume_from_today();

-- ── 2 + 3. generator: per-template isolation, copies every field ───────────
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
  v_made  int;
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
    -- Resume the day after the last run, never before start_date, never more
    -- than 31 days back. A template saved by an older client has neither
    -- start_date nor last_generated: it resumes the day after it was made.
    v_from := GREATEST(
      COALESCE(t.last_generated + 1, t.start_date, (t.created_at AT TIME ZONE 'Asia/Kolkata')::date + 1),
      COALESCE(t.start_date, '-infinity'::date),
      p_run_date - 31);

    BEGIN
      v_made := 0;
      FOR d IN SELECT generate_series(v_from, p_run_date, interval '1 day')::date LOOP
        IF t.frequency = 'DAILY' THEN
          v_due := t.weekdays IS NULL OR EXTRACT(isodow FROM d)::smallint = ANY (t.weekdays);
        ELSE
          v_due := EXTRACT(day FROM d)::int = LEAST(COALESCE(t.day_of_month, 1), 28);
        END IF;
        CONTINUE WHEN NOT v_due;

        v_eid := 'EXP-' || replace(gen_random_uuid()::text, '-', '');
        INSERT INTO public.expenses
          (id, tenant_id, category, amount, note, date, payment_method, recurring_template_id,
           location_id, exclude_from_pl, gst_rate, gst_amount, vendor_gstin)
        VALUES
          (v_eid, t.tenant_id, t.category, t.amount, COALESCE(t.note, t.category) || ' (recurring)',
           d::text, COALESCE(t.payment_method, 'CASH'), t.id,
           -- gst_amount is NOT NULL on expenses: a template without GST logs 0.
           t.location_id, COALESCE(t.exclude_from_pl, false), t.gst_rate, COALESCE(t.gst_amount, 0), t.vendor_gstin)
        ON CONFLICT (recurring_template_id, date)
          WHERE recurring_template_id IS NOT NULL AND deleted_at IS NULL
          DO NOTHING;
        IF FOUND THEN
          template_id := t.id; expense_id := v_eid; tenant_id := t.tenant_id; amount := t.amount;
          RETURN NEXT;
        END IF;
      END LOOP;

      UPDATE public.recurring_expense_templates
         SET last_generated = GREATEST(COALESCE(last_generated, p_run_date), p_run_date),
             last_error = NULL, last_error_at = NULL
       WHERE id = t.id;
    EXCEPTION WHEN OTHERS THEN
      -- This template's rows roll back; the night carries on for everyone
      -- else, and the failure is kept where the shop can see it.
      UPDATE public.recurring_expense_templates
         SET last_error = left(SQLERRM, 500), last_error_at = now()
       WHERE id = t.id;
    END;
  END LOOP;
END
$fn$;

REVOKE ALL ON FUNCTION public.generate_due_recurring_expenses(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses(date) TO service_role;

-- ── 4. recurring invoices: locked down and scheduled in the database ───────
REVOKE ALL ON FUNCTION public.generate_due_recurring_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_invoices() TO service_role;

DO $s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recurring-invoices-nightly';
    -- 00:30 UTC = 06:00 IST, so the function's CURRENT_DATE is the IST date.
    PERFORM cron.schedule('recurring-invoices-nightly', '30 0 * * *',
      $job$SELECT public.generate_due_recurring_invoices()$job$);
  END IF;
END $s$;
