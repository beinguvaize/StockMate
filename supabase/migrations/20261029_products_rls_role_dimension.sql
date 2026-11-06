-- products: carry the app's role matrix into RLS for INSERT and UPDATE.
--
-- Until now the products policies only asked "is this your tenant?", so any
-- authenticated member of a tenant -- STAFF, SALES, DRIVER -- could create,
-- edit or soft-delete a product straight through PostgREST. The /inventory UI
-- gates those actions with hasPermission('inventory', ...) in
-- src/context/AuthContext.jsx, but the UI was the only gate.
--
-- A product soft delete is a PATCH of deleted_at (useInventory.remove), so it
-- is governed by tenant_update, not tenant_delete. The role check on
-- tenant_delete therefore protected nothing in practice.
--
-- Identity is resolved from auth.uid() against public.users. Never from
-- auth.jwt() -> 'user_metadata' / raw_user_meta_data, which the user can write.
--
-- The helper calls stay wrapped in (SELECT ...) to match the other policies on
-- this table: a STABLE function behind an InitPlan is evaluated once per
-- statement instead of once per row, which matters on a full products scan.

CREATE OR REPLACE FUNCTION public.can_write_inventory()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = (auth.uid())::text
       AND (
         -- Role templates that the app grants inventory writes to.
         u.roles @> ARRAY['OWNER']::text[]
         OR u.roles @> ARRAY['GLOBAL_ADMIN']::text[]
         OR u.roles @> ARRAY['INVENTORY']::text[]
         -- CUSTOM (and any other role): the granular permissions object, the
         -- same jsonb hasPermission() falls through to. Any one inventory
         -- write action is enough -- RLS has only INSERT and UPDATE hooks, so
         -- create/edit/delete cannot be told apart here; the UI stays the
         -- finer gate.
         OR COALESCE((u.permissions -> 'inventory' ->> 'create')::boolean, false)
         OR COALESCE((u.permissions -> 'inventory' ->> 'edit')::boolean, false)
         OR COALESCE((u.permissions -> 'inventory' ->> 'delete')::boolean, false)
       )
  );
$$;

COMMENT ON FUNCTION public.can_write_inventory() IS
  'True when the current user may write the inventory module. Mirrors hasPermission(''inventory'', ...) in src/context/AuthContext.jsx: OWNER, GLOBAL_ADMIN, INVENTORY, or a granular permissions.inventory write flag. Reads public.users by auth.uid() only.';

DROP POLICY IF EXISTS tenant_insert ON public.products;
CREATE POLICY tenant_insert ON public.products
  FOR INSERT
  WITH CHECK (
    ((tenant_id = (SELECT current_tenant_id())) AND (SELECT can_write_inventory()))
    OR (SELECT is_global_admin())
  );

DROP POLICY IF EXISTS tenant_update ON public.products;
CREATE POLICY tenant_update ON public.products
  FOR UPDATE
  USING (
    ((tenant_id = (SELECT current_tenant_id())) AND (SELECT can_write_inventory()))
    OR (SELECT is_global_admin())
  );
