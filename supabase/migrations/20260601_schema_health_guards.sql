-- Schema-health guard RPCs.
--
-- Two read-only helpers the CI "schema-guard" workflow calls over the
-- Supabase REST API (same pattern as audit_outstanding_drift). They are
-- the running form of the Phase-1 hardening checks:
--   • audit_function_overloads()  — fails the build when any public
--     function has more than one signature. A duplicate overload is what
--     produced PGRST203 and silently blocked every mobile sale from
--     syncing (process_sale 13-arg vs 14-arg) and broke invoice
--     conversion (convert_sale_to_invoice 10-arg vs 11-arg).
--   • schema_signature()          — returns a stable, ordered text list
--     of every public table column and function signature. CI fetches it
--     from dev and prod and diffs the two; any difference means the
--     environments have drifted (e.g. the missing `deleted_at` column
--     that broke checkout).
--
-- Both are SECURITY DEFINER so the service-role CI caller can read
-- pg_catalog regardless of RLS, and STABLE since they only read
-- catalog state.

-- ── Duplicate-overload guard ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_function_overloads()
RETURNS TABLE (function_name text, overload_count bigint, signatures text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Only REST-exposed functions can collide into PGRST203. Trigger
  -- functions (prorettype = trigger) are never offered as RPC
  -- candidates, so a trigger fn sharing a name with a real RPC is NOT
  -- a sync risk — exclude them to avoid false positives (e.g.
  -- recompute_client_outstanding: the trigger version vs the manual
  -- (uuid, text) RPC).
  SELECT p.proname::text AS function_name,
         COUNT(*)        AS overload_count,
         string_agg(pg_get_function_identity_arguments(p.oid), ' || '
                    ORDER BY p.oid) AS signatures
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prorettype <> 'pg_catalog.trigger'::regtype
   GROUP BY p.proname
  HAVING COUNT(*) > 1;
$$;

-- ── Schema signature (for dev↔prod drift diff) ──────────────────────
CREATE OR REPLACE FUNCTION public.schema_signature()
RETURNS TABLE (entry text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Columns: "col:<table>.<column> <type>"
  SELECT format('col:%s.%s %s', c.table_name, c.column_name, c.data_type) AS entry
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
  UNION ALL
  -- Functions: "fn:<name>(<args>)"
  SELECT format('fn:%s(%s)', p.proname,
                pg_get_function_identity_arguments(p.oid)) AS entry
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
  ORDER BY 1;
$$;
