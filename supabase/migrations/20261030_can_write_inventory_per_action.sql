-- can_write_inventory(): mirror permits() exactly -- its precedence, and its
-- per-action answer.
--
-- Two bugs in the first version, both making the DATABASE looser than the app:
--
-- 1. It ORed the role templates with the granular permissions object, so a
--    STAFF user carrying permissions.inventory.edit = true was denied by the
--    app and granted by the database. permits() in src/lib/rbac.js decides by
--    FIRST MATCH, not by OR. A CASE reproduces that ordering.
--
-- 2. It ORed create/edit/delete together, justified with "RLS has only INSERT
--    and UPDATE hooks". Half right: INSERT *is* 'create' and UPDATE *is*
--    'edit', so a CUSTOM user holding {create: true} could edit every product.
--    Only edit/delete genuinely cannot be split -- a product delete here is a
--    PATCH of deleted_at, and an UPDATE policy cannot see a column transition
--    (USING sees OLD, WITH CHECK sees NEW) -- so UPDATE accepts either.
--
-- The precedence this reproduces:
--   GLOBAL_ADMIN -> true
--   OWNER        -> true
--   STAFF        -> writes only sales/clients/daybook, so inventory is false
--   SALES        -> sales/clients/daybook  -> false
--   INVENTORY    -> includes inventory     -> true
--   DRIVER       -> vehicles/sales         -> false
--   otherwise    -> permissions.inventory ->> p_action
--
-- SALES is tested before INVENTORY, so a user holding both is answered by
-- SALES and denied; any template short-circuits the permissions fallback.
-- Both are what the app does today. src/lib/rbac.test.js pins all 27 cases.
--
-- One signature only, per the project rule on overloads: the 0-arg version is
-- dropped at the end, once the policies no longer refer to it. The new one
-- takes no DEFAULT, so an old caller cannot silently resolve to it.
--
-- Identity still comes from auth.uid() against public.users, never from
-- auth.jwt() -> 'user_metadata' / raw_user_meta_data.

CREATE OR REPLACE FUNCTION public.can_write_inventory(p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN u.roles @> ARRAY['GLOBAL_ADMIN']::text[] THEN true
      WHEN u.roles @> ARRAY['OWNER']::text[]        THEN true
      WHEN u.roles @> ARRAY['STAFF']::text[]        THEN false
      WHEN u.roles @> ARRAY['SALES']::text[]        THEN false
      WHEN u.roles @> ARRAY['INVENTORY']::text[]    THEN true
      WHEN u.roles @> ARRAY['DRIVER']::text[]       THEN false
      ELSE COALESCE((u.permissions -> 'inventory' ->> p_action)::boolean, false)
    END
      FROM public.users u
     WHERE u.id = (auth.uid())::text
  ), false);
$$;

COMMENT ON FUNCTION public.can_write_inventory(text) IS
  'True when the current user may perform p_action (create/edit/delete) on the inventory module. Mirrors permits() in src/lib/rbac.js and its first-match precedence. Reads public.users by auth.uid() only.';

-- Repoint the policies before the old signature goes away.
DROP POLICY IF EXISTS tenant_insert ON public.products;
CREATE POLICY tenant_insert ON public.products
  FOR INSERT
  WITH CHECK (
    ((tenant_id = (SELECT current_tenant_id())) AND (SELECT can_write_inventory('create')))
    OR (SELECT is_global_admin())
  );

-- A soft delete is an UPDATE of deleted_at, so UPDATE has to accept either the
-- edit right or the delete right. For every role template the two agree; it
-- only parts for a CUSTOM user given one and not the other.
DROP POLICY IF EXISTS tenant_update ON public.products;
CREATE POLICY tenant_update ON public.products
  FOR UPDATE
  USING (
    ((tenant_id = (SELECT current_tenant_id()))
      AND ((SELECT can_write_inventory('edit')) OR (SELECT can_write_inventory('delete'))))
    OR (SELECT is_global_admin())
  );

DROP FUNCTION IF EXISTS public.can_write_inventory();
