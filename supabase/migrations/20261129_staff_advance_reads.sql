-- Staff advances: the reads the phone screens need (29 Nov 2026). SERVER SIDE ONLY.
--
-- Additive only. Nothing that writes money changes; no function changes.
--
--   staff_advance_status   four columns APPENDED (existing columns, their
--                          order and their meaning are untouched, so the
--                          released phone, the web and every function that
--                          reads the view keep working):
--       taken_back     recovered + collected + written_off
--       runs_to_clear  ceil(outstanding / recovery_per_run); 0 when nothing is
--                      owed; NULL when recovery_per_run is 0 (never taken
--                      automatically). Counts this advance's own per-run
--                      amount only: a run with too little net pay takes less,
--                      so it is "at least this many runs".
--       editable       amount, account and date may still change
--                      (update_staff_advance): nothing taken back yet. The
--                      per-run amount and the note can ALWAYS change.
--       cancellable    cancel_staff_advance would succeed: nothing taken back yet.
--
--   staff_advance_history  NEW. One row per event on an advance, cancelled
--                          advances included: GIVEN, RECOVERY (with the pay
--                          run's period and dates), COLLECTION, WRITE_OFF,
--                          CANCELLED. Built from existing rows only.
--                          A recovery whose pay run (or PAYADV expense) was
--                          deleted is left out, exactly as staff_advance_status
--                          stops counting it.
--                          The same view, filtered by payroll_id and
--                          event = 'RECOVERY', is the per-pay-line split of a
--                          saved run ("₹500 + ₹1,000").
--
-- Both views are security_invoker: the tables' RLS (own shop + payroll on the
-- plan) decides what anyone sees. Read-only grants to authenticated only.

-- ── 0. precondition: the view is the one 20261127 created ──────────────────
DO $pre$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'staff_advance_status';
  IF v_cols = 'advance_id,tenant_id,employee_id,given_on,created_at,amount,recovery_per_run,account_id,method,note,recovered,collected,written_off,outstanding,status,taken_back,runs_to_clear,editable,cancellable' THEN
    RAISE NOTICE 'staff_advance_status already carries the new columns; restating it';
  ELSIF v_cols IS DISTINCT FROM 'advance_id,tenant_id,employee_id,given_on,created_at,amount,recovery_per_run,account_id,method,note,recovered,collected,written_off,outstanding,status' THEN
    RAISE EXCEPTION 'staff_advance_reads: staff_advance_status is not the view 20261127 created (columns %). Re-read it first.', v_cols;
  END IF;
END $pre$;

-- ── 1. staff_advance_status: the 20261127 body, four columns appended ──────
CREATE OR REPLACE VIEW public.staff_advance_status
WITH (security_invoker = true) AS
SELECT
  a.id                AS advance_id,
  a.tenant_id,
  a.employee_id,
  a.given_on,
  a.created_at,
  a.amount,
  a.recovery_per_run,
  a.account_id,
  a.method,
  a.note,
  coalesce(x.recovered, 0)   AS recovered,
  coalesce(x.collected, 0)   AS collected,
  coalesce(x.written_off, 0) AS written_off,
  a.amount - coalesce(x.recovered, 0) - coalesce(x.collected, 0) - coalesce(x.written_off, 0) AS outstanding,
  CASE
    WHEN a.amount - coalesce(x.recovered, 0) - coalesce(x.collected, 0) - coalesce(x.written_off, 0) > 0 THEN 'OPEN'
    WHEN coalesce(x.collected, 0) + coalesce(x.written_off, 0) > 0 THEN 'SETTLED'
    ELSE 'CLEARED'
  END AS status,
  -- appended 20261129
  coalesce(x.recovered, 0) + coalesce(x.collected, 0) + coalesce(x.written_off, 0) AS taken_back,
  CASE
    WHEN a.amount - coalesce(x.recovered, 0) - coalesce(x.collected, 0) - coalesce(x.written_off, 0) <= 0 THEN 0
    WHEN a.recovery_per_run <= 0 THEN NULL
    ELSE ceil((a.amount - coalesce(x.recovered, 0) - coalesce(x.collected, 0) - coalesce(x.written_off, 0))
              / a.recovery_per_run)::integer
  END AS runs_to_clear,
  coalesce(x.recovered, 0) + coalesce(x.collected, 0) + coalesce(x.written_off, 0) = 0 AS editable,
  coalesce(x.recovered, 0) + coalesce(x.collected, 0) + coalesce(x.written_off, 0) = 0 AS cancellable
FROM public.staff_advances a
LEFT JOIN LATERAL (
  SELECT
    sum(e.amount) FILTER (WHERE e.kind = 'RECOVERY')   AS recovered,
    sum(e.amount) FILTER (WHERE e.kind = 'COLLECTION') AS collected,
    sum(e.amount) FILTER (WHERE e.kind = 'WRITE_OFF')  AS written_off
  FROM public.staff_advance_entries e
  WHERE e.advance_id = a.id
    AND e.tenant_id = a.tenant_id
    AND e.deleted_at IS NULL
    AND (e.kind <> 'RECOVERY' OR (
          EXISTS (SELECT 1 FROM public.payroll p
                   WHERE p.id = e.payroll_id AND p.tenant_id = e.tenant_id AND p.deleted_at IS NULL)
      AND (e.expense_id IS NULL OR EXISTS (SELECT 1 FROM public.expenses x
                   WHERE x.id = e.expense_id AND x.tenant_id = e.tenant_id AND x.deleted_at IS NULL))))
) x ON true
WHERE a.deleted_at IS NULL AND a.status <> 'CANCELLED';

COMMENT ON COLUMN public.staff_advance_status.runs_to_clear IS
  'ceil(outstanding / recovery_per_run); 0 when nothing is owed; NULL when recovery_per_run is 0 (nothing is taken automatically). A run with too little net pay takes less, so this is a minimum.';
COMMENT ON COLUMN public.staff_advance_status.editable IS
  'Amount, account and date can still change (nothing recovered, collected or written off). The per-run amount and note can always change.';
COMMENT ON COLUMN public.staff_advance_status.cancellable IS
  'cancel_staff_advance would succeed: nothing recovered, collected or written off.';

-- ── 2. staff_advance_history ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.staff_advance_history
WITH (security_invoker = true) AS
SELECT
  e.id                        AS event_id,
  e.tenant_id,
  e.advance_id,
  e.employee_id,
  e.kind                      AS event,
  e.amount,
  e.on_date,
  e.created_at                AS recorded_at,
  e.account_id,
  e.payroll_id,
  p.period                    AS run_period,
  CASE WHEN p.period ~ '^\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}$' THEN least(split_part(p.period, '/', 1), split_part(p.period, '/', 2))::date
       WHEN p.period ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN to_date(p.period || '-01', 'YYYY-MM-DD')
  END                         AS run_from,
  CASE WHEN p.period ~ '^\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}$' THEN greatest(split_part(p.period, '/', 1), split_part(p.period, '/', 2))::date
       WHEN p.period ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN (to_date(p.period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
  END                         AS run_to,
  p.processed_at              AS run_processed_at,
  e.op_id,
  e.expense_id,
  e.note,
  a.given_on                  AS advance_given_on,
  a.amount                    AS advance_amount,
  a.status                    AS advance_status
FROM public.staff_advance_entries e
JOIN public.staff_advances a ON a.id = e.advance_id AND a.tenant_id = e.tenant_id
LEFT JOIN public.payroll p ON p.id = e.payroll_id AND p.tenant_id = e.tenant_id
WHERE (a.deleted_at IS NULL OR a.status = 'CANCELLED')
  -- A cancelled advance's GIVEN entry is soft-deleted by the cancel; it is
  -- still history.
  AND (e.deleted_at IS NULL OR (e.kind = 'GIVEN' AND a.status = 'CANCELLED'))
  AND (e.kind <> 'RECOVERY' OR (
        p.id IS NOT NULL AND p.deleted_at IS NULL
    AND (e.expense_id IS NULL OR EXISTS (SELECT 1 FROM public.expenses x
                 WHERE x.id = e.expense_id AND x.tenant_id = e.tenant_id AND x.deleted_at IS NULL))))
UNION ALL
-- The cancel itself. Its money went back to the account the advance was paid
-- from (the advance's OUT row is removed), which is account_id here.
SELECT
  'ADVCAN-' || a.id, a.tenant_id, a.id, a.employee_id, 'CANCELLED', a.amount,
  (coalesce(a.deleted_at, a.updated_at) AT TIME ZONE 'Asia/Kolkata')::date,
  coalesce(a.deleted_at, a.updated_at),
  a.account_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  a.given_on, a.amount, a.status
FROM public.staff_advances a
WHERE a.status = 'CANCELLED';

COMMENT ON VIEW public.staff_advance_history IS
  'Every event on a staff advance, cancelled ones included: GIVEN, RECOVERY (run_period/run_from/run_to of its pay run), COLLECTION, WRITE_OFF, CANCELLED. Order by on_date, recorded_at, event_id. Filter payroll_id + event=RECOVERY for a saved pay line''s split per advance. Reversed recoveries (pay run deleted) are left out.';

REVOKE ALL ON public.staff_advance_status, public.staff_advance_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_advance_status, public.staff_advance_history TO authenticated;

-- ── 3. prove it ────────────────────────────────────────────────────────────
DO $check$
BEGIN
  IF has_table_privilege('anon', 'public.staff_advance_history', 'SELECT')
     OR has_table_privilege('anon', 'public.staff_advance_status', 'SELECT')
     OR has_table_privilege('authenticated', 'public.staff_advance_history', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.staff_advance_history', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.staff_advance_status', 'SELECT') THEN
    RAISE EXCEPTION 'staff_advance_reads: grants are wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'staff_advance_history'
                    AND 'security_invoker=true' = ANY (c.reloptions))
     OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'staff_advance_status'
                    AND 'security_invoker=true' = ANY (c.reloptions)) THEN
    RAISE EXCEPTION 'staff_advance_reads: a view is not security_invoker';
  END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
