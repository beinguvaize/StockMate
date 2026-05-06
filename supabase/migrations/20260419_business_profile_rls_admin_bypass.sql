-- GLOBAL_ADMIN impersonation path: JWT still carries admin's home tenant, so
-- the prior policy `tenant_id = current_tenant_id()` silently blocked updates
-- when an admin edited a different tenant's profile. Allow is_global_admin()
-- to bypass the tenant match.
DROP POLICY IF EXISTS tenant_update ON public.business_profile;
DROP POLICY IF EXISTS tenant_insert ON public.business_profile;

CREATE POLICY tenant_update ON public.business_profile
  FOR UPDATE
  USING (
    is_global_admin()
    OR (tenant_id = current_tenant_id() AND is_tenant_admin())
  );

CREATE POLICY tenant_insert ON public.business_profile
  FOR INSERT
  WITH CHECK (
    is_global_admin()
    OR (tenant_id = current_tenant_id() AND is_tenant_admin())
  );
