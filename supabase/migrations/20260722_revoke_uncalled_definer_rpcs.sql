-- Revoke EXECUTE from client roles on SECURITY DEFINER functions that no client
-- calls. Each trusts p_tenant_id blindly and runs past RLS; leaving them
-- callable was pure attack surface.
--
-- create_staff_account is the serious one: it takes p_roles text[] and
-- p_tenant_id straight into auth.users + public.users, so any authenticated
-- user could mint an account in any tenant with any roles — GLOBAL_ADMIN
-- included. No client, edge function, or trigger calls it. Revoked outright.
--
-- The other three are internal helpers or maintenance tools with no client
-- caller. Functions that call them internally (issue_invoice_number ->
-- next_invoice_number; process_sale/edit_sale -> consume_fifo) are themselves
-- SECURITY DEFINER owned by postgres, so those calls run as the owner and keep
-- working — the EXECUTE check only bites a direct client call. Verified:
-- issue_invoice_number still returns a number after the revoke.

REVOKE EXECUTE ON FUNCTION public.create_staff_account(text, text, text[], text, uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.consume_fifo(uuid, text, text, numeric)              FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid, text, text)                 FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.recompute_client_outstanding(uuid, text)              FROM authenticated, anon, public;
