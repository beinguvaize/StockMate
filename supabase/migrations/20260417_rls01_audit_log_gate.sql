-- ==============================================================
-- RLS-01 (patch): ENTERPRISE-only gate on audit_log reads
-- ==============================================================
-- The existing `audit_log_tenant_select` permissive policy lets any
-- tenant admin read their own audit log. This patch adds a restrictive
-- policy so only ENTERPRISE tenants (or GLOBAL_ADMIN) can read, matching
-- the client-side route gate in tenancy.js.
--
-- Writes/deletes are already locked down (no INSERT/UPDATE policies;
-- DELETE is admin-only), so no additional gates needed there.

DROP POLICY IF EXISTS "plan_gate_select" ON public.audit_log;

CREATE POLICY "plan_gate_select" ON public.audit_log
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.has_module_access('audit-log'));
