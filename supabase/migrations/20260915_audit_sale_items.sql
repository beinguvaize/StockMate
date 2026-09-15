-- Phase 2: does sale_items still agree with sales.items?
--
-- Phase 1 copied 4,311 lines into sale_items and nothing has written it since.
-- Until phase 3 turns on dual-write, every NEW sale appears in the blob and not
-- in the table. That drift is expected and will grow daily.
--
-- Which is exactly why this separates two things that a single "mismatch count"
-- would blur together:
--
--   missing   -- the sale has lines in the blob and no rows in the table.
--                Expected before dual-write. Grows until phase 3, then must
--                stop growing and stay flat.
--   mismatch  -- the sale is in BOTH and they disagree on line count, quantity
--                or value. Never acceptable, at any phase. This is the number
--                that means something is wrong.
--
-- Lumping them into one figure would let a real disagreement hide inside a
-- number everyone had already learned to ignore.

CREATE OR REPLACE FUNCTION public.audit_sale_items(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  sale_id     text,
  tenant_id   uuid,
  sale_date   text,
  issue       text,
  blob_lines  int,
  table_lines int,
  blob_qty    numeric,
  table_qty   numeric,
  blob_value  numeric,
  table_value numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH blob AS (
    SELECT s.id, s.tenant_id, s.date,
           jsonb_array_length(s.items)                                          AS n,
           SUM((e.it->>'quantity')::numeric)                                    AS qty,
           SUM((e.it->>'quantity')::numeric * (e.it->>'rate')::numeric)         AS value
      FROM sales s, LATERAL jsonb_array_elements(s.items) AS e(it)
     WHERE jsonb_typeof(s.items) = 'array'
       AND (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id)
     GROUP BY s.id, s.tenant_id, s.date, s.items
  ), tbl AS (
    SELECT si.sale_id AS id, COUNT(*)::int AS n,
           SUM(si.quantity) AS qty, SUM(si.line_total) AS value
      FROM sale_items si
     WHERE si.deleted_at IS NULL
       AND (p_tenant_id IS NULL OR si.tenant_id = p_tenant_id)
     GROUP BY si.sale_id
  )
  SELECT b.id, b.tenant_id, b.date,
         CASE WHEN t.id IS NULL THEN 'missing' ELSE 'mismatch' END,
         b.n, COALESCE(t.n, 0), b.qty, COALESCE(t.qty, 0), b.value, COALESCE(t.value, 0)
    FROM blob b
    LEFT JOIN tbl t ON t.id = b.id
   WHERE t.id IS NULL
      OR b.n     IS DISTINCT FROM t.n
      OR b.qty   IS DISTINCT FROM t.qty
      OR b.value IS DISTINCT FROM t.value
$function$;

-- Somewhere for a scheduled run to leave its result. A cron job has nobody to
-- return rows to, and "it was fine when I last looked" is not a record.
CREATE TABLE IF NOT EXISTS public.reconciliation_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name   text NOT NULL,
  ran_at       timestamptz NOT NULL DEFAULT now(),
  missing      int NOT NULL DEFAULT 0,
  mismatched   int NOT NULL DEFAULT 0,
  details      jsonb,
  ok           boolean GENERATED ALWAYS AS (mismatched = 0) STORED
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_log_recent
  ON public.reconciliation_log (check_name, ran_at DESC);

-- Admin-only: this is an operational record, not tenant data.
ALTER TABLE public.reconciliation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_read ON public.reconciliation_log;
CREATE POLICY admin_read ON public.reconciliation_log FOR SELECT
  USING ((SELECT public.is_global_admin()));

CREATE OR REPLACE FUNCTION public.run_sale_items_reconciliation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_missing int;
  v_mismatch int;
  v_details jsonb;
BEGIN
  SELECT count(*) FILTER (WHERE issue = 'missing'),
         count(*) FILTER (WHERE issue = 'mismatch')
    INTO v_missing, v_mismatch
    FROM public.audit_sale_items();

  -- Keep the offenders, not just the count: a mismatch you cannot name is a
  -- mismatch you cannot chase. Capped so one bad day cannot bloat the table.
  SELECT jsonb_agg(x) INTO v_details FROM (
    SELECT * FROM public.audit_sale_items()
     WHERE issue = 'mismatch'
     LIMIT 50
  ) x;

  INSERT INTO public.reconciliation_log (check_name, missing, mismatched, details)
  VALUES ('sale_items_vs_blob', v_missing, v_mismatch, v_details);
END;
$function$;

-- 02:00 UTC = 07:30 IST, before the shops open, and clear of the existing
-- 03:00 and 03:30 jobs.
SELECT cron.schedule(
  'sale-items-reconciliation',
  '0 2 * * *',
  $$SELECT public.run_sale_items_reconciliation();$$
);
