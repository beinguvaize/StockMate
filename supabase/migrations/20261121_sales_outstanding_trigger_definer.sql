-- Sales outstanding trigger runs as definer
-- ============================================================================
--
-- trg_sales_outstanding (AFTER INSERT/UPDATE/DELETE on sales) calls
-- _recalc_outstanding_for_client, whose EXECUTE was revoked from
-- authenticated when uncalled definer RPCs were locked down. The trigger
-- function itself was SECURITY INVOKER, so any direct client UPDATE of a sale
-- row (the phone writing amount_received after a sale, any sale edit made
-- with a plain update) failed with
--   permission denied for function _recalc_outstanding_for_client
--
-- Making the trigger function SECURITY DEFINER is safe: a function returning
-- trigger cannot be called through the API or directly, it only runs for a row
-- RLS has already let this user write, and it recalculates only that row's own
-- tenant and client. _recalc_outstanding_for_client stays revoked from clients.

ALTER FUNCTION public._trg_sales_recalc_outstanding() SECURITY DEFINER;
ALTER FUNCTION public._trg_sales_recalc_outstanding() SET search_path = public;
