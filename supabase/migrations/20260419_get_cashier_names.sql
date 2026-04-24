-- Resolve display names for sale authors. A GLOBAL_ADMIN impersonating another
-- tenant writes sales under that tenant but their auth user is in the admin's
-- home tenant, so tenant-scoped users lookups miss them. This SECURITY DEFINER
-- RPC returns just {id, name, email} for a given set of user ids, gated by:
--   1. global admin, OR
--   2. user belongs to caller's tenant, OR
--   3. user authored a sale visible to the caller's tenant.
CREATE OR REPLACE FUNCTION public.get_cashier_names(user_ids text[])
RETURNS TABLE(id text, name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.name, u.email
  FROM public.users u
  WHERE u.id = ANY(user_ids)
    AND (
      is_global_admin()
      OR u.tenant_id = current_tenant_id()
      OR EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s."bookedBy" = u.id
          AND s.tenant_id = current_tenant_id()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_cashier_names(text[]) TO authenticated;
