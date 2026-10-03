-- The functions authorisation is built on
-- ============================================================================
--
-- Thirty-eight of production's 117 functions have no CREATE FUNCTION anywhere
-- in this directory. Six of them are these, and they are the ones that matter
-- most, because everything else assumes them:
--
--   current_tenant_id()  — which tenant the caller belongs to
--   is_global_admin()    — the override every tenant guard honours
--   is_tenant_admin()    — OWNER or GLOBAL_ADMIN
--   is_tenant_member()   — has a users row at all
--   is_staff()           — STAFF, OWNER or GLOBAL_ADMIN
--   is_admin_safe()      — OWNER or GLOBAL_ADMIN, the non-recursing form
--
-- The RLS policies call them. So do the twenty tenant guards, including the two
-- migrations immediately before this one:
--
--   20261002_a_tenant_id_argument_is_not_a_permission.sql
--   20261005_the_remaining_tenant_guards.sql
--
-- Which means this repository could not rebuild itself. `supabase db reset` on
-- a fresh database would run those two migrations and fail on the first call to
-- a function nothing had created -- and the security work they contain would
-- not exist on the rebuilt database at all. The only reason they apply today is
-- that production already had these six, from a change made outside the
-- migrations.
--
-- Bodies are production's own, read from pg_get_functiondef and not retyped.
-- CREATE OR REPLACE, so applying this to a database that already has them is a
-- no-op rather than a conflict.
--
-- THIS IS ONE SLICE. Thirty-two more production functions are still unrecorded,
-- among them the ledger posting triggers (post_sale_to_ledger,
-- post_purchase_to_ledger, post_client_payment_to_ledger,
-- post_supplier_payment_to_ledger), purchases_assign_bill_id, edit_purchase_bill,
-- convert_sale_to_invoice and the whole e-invoicing subsystem. They are listed
-- in the pull request. This one is first because the security migrations cannot
-- apply without it.

CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.users WHERE id = (auth.uid())::text LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
     WHERE id = (auth.uid())::text
       AND roles @> ARRAY['GLOBAL_ADMIN']::text[]
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
     WHERE id = (auth.uid())::text
       AND (roles @> ARRAY['OWNER']::text[] OR roles @> ARRAY['GLOBAL_ADMIN']::text[])
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_member()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (auth.uid())::text
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = (auth.uid())::text
    AND (public.users.roles @> '{STAFF}' OR public.users.roles @> '{GLOBAL_ADMIN}' OR public.users.roles @> '{OWNER}')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_safe()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE public.users.id = (auth.uid())::text
    AND (public.users.roles @> '{OWNER}' OR public.users.roles @> '{GLOBAL_ADMIN}')
  );
$function$;
