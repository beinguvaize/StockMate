-- Phase 3 companion: make the reconciliation survive the data it watches for.
--
-- Phase 3 moves the nightly audit from "a check that should always pass" to
-- "the thing that tells us a line could not be copied". That promotion exposes
-- two defects in the Phase 2 audit, both found while testing the dual-write
-- trigger on dev.
--
-- 1. IT RAISED ON EXACTLY THE DATA IT EXISTS TO FIND.
--    (e.it->>'quantity')::numeric was unguarded, so a single sale holding a
--    non-numeric quantity aborted audit_sale_items for the WHOLE tenant with
--    "invalid input syntax for type numeric". The one sale that most needed
--    reporting was the one that stopped the report being produced -- and the
--    nightly job would have logged a failure rather than the offender.
--
--    The guard deliberately does NOT skip such a line the way the trigger
--    does. blob_lines stays jsonb_array_length, so a line the trigger could
--    not represent still shows up as a line-count mismatch. An audit that
--    skipped the same lines as the writer would agree with it perfectly and
--    report nothing, which is the failure mode worth avoiding here.
--
-- 2. IT AUDITED SOFT-DELETED SALES.
--    trg_soft_delete turns a DELETE on sales into setting deleted_at, and the
--    audit never filtered it. A voided bill has no business being compared
--    against a live ledger, and every one of them would have been reported as
--    an offender forever.

CREATE OR REPLACE FUNCTION public.audit_sale_items(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sale_id text, tenant_id uuid, sale_date text, issue text, blob_lines integer, table_lines integer, blob_qty numeric, table_qty numeric, blob_value numeric, table_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH blob AS (
    SELECT s.id, s.tenant_id, s.date,
           jsonb_array_length(s.items) AS n,
           -- CASE, not a WHERE filter: CASE is defined to evaluate only the
           -- arm it selects, so the cast can never run on a value that failed
           -- its own test. A WHERE gives no such guarantee about the SELECT
           -- list. An unreadable figure counts as zero and the line-count
           -- mismatch is what surfaces the sale.
           SUM(CASE WHEN (e.it->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN (e.it->>'quantity')::numeric ELSE 0 END) AS qty,
           SUM(CASE WHEN (e.it->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
                     AND (e.it->>'rate')     ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN (e.it->>'quantity')::numeric * (e.it->>'rate')::numeric
                    ELSE 0 END) AS value
      FROM sales s, LATERAL jsonb_array_elements(s.items) AS e(it)
     WHERE jsonb_typeof(s.items) = 'array'
       AND s.deleted_at IS NULL
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
