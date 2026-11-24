-- Record the live policies on accounts and account_transactions
-- ============================================================================
--
-- prod has accounts_all and acctxn_all, and no migration in this repo creates
-- them. dev has RLS on with no policy at all, so nothing can read either table
-- there, which is how AI chat's cash_bank came back empty on dev.
--
-- Definitions copied from prod's pg_policies, read 2026-11-04: PERMISSIVE, FOR
-- ALL, TO public, the same expression for USING and WITH CHECK. Created only if
-- missing, so applying this to prod changes nothing.

DO $p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounts' AND policyname = 'accounts_all') THEN
    CREATE POLICY accounts_all ON public.accounts
      FOR ALL TO public
      USING ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()))
      WITH CHECK ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'account_transactions' AND policyname = 'acctxn_all') THEN
    CREATE POLICY acctxn_all ON public.account_transactions
      FOR ALL TO public
      USING ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()))
      WITH CHECK ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()));
  END IF;
END $p$;
