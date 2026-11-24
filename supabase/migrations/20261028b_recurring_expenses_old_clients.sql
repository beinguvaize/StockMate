-- Recurring expenses: a template saved by an older client never double-books
-- ============================================================================
--
-- Installed mobile builds (and cached web clients) insert recurring templates
-- without start_date or last_generated. The expense they log alongside covers
-- its own day; the generator, seeing no last_generated, resumed from the run
-- date -- so a template created just after midnight IST could book that same
-- day a second time on the 01:00 run. (Found by the Director in PR #163.)
--
-- A template with neither now resumes the day after it was created (IST).
-- New clients set last_generated explicitly and are unaffected.

DO $p$
DECLARE
  v_src text;
  v_old text := 'COALESCE(t.last_generated + 1, t.start_date, p_run_date)';
  v_new text := 'COALESCE(t.last_generated + 1, t.start_date, (t.created_at AT TIME ZONE ''Asia/Kolkata'')::date + 1)';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'generate_due_recurring_expenses' AND pronamespace = 'public'::regnamespace;
  IF v_src IS NULL OR (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'anchor not found exactly once in generate_due_recurring_expenses';
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses(p_run_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(template_id text, expense_id text, tenant_id uuid, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$, replace(v_src, v_old, v_new));
END $p$;

-- CREATE OR REPLACE keeps the grants, but state them again so this file is
-- complete on its own.
REVOKE ALL ON FUNCTION public.generate_due_recurring_expenses(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses(date) TO service_role;
