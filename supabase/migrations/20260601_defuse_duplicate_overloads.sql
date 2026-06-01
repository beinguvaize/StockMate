-- Defuse duplicate RPC overloads surfaced by audit_function_overloads().
-- Each pair returns PGRST203 the moment a caller omits the differing arg
-- (the bug class that silently blocked sale sync via process_sale).
--
-- For every function: all live web (src/) + mobile (mobile_app/lib/)
-- callers were checked, the superset/used signature kept, the rest
-- dropped. Applied to dev; mirror on prod during the dev→prod sync
-- (see docs/ARCHITECTURE_HARDENING.md for the critical ordering — the
-- get_next_invoice_number drop must follow the AppContext deploy).

-- get_next_invoice_number → fully superseded by issue_invoice_number.
DROP FUNCTION IF EXISTS public.get_next_invoice_number();
DROP FUNCTION IF EXISTS public.get_next_invoice_number(uuid);

-- create_staff_account → legacy 4-arg has no live caller (staff are
-- created by the create-staff-account edge function). Keep the 5-arg
-- tenant-scoped version.
DROP FUNCTION IF EXISTS public.create_staff_account(text, text, text[], text);

-- adjust_inventory_atomic → keep the 9-arg superset (all extras default;
-- also enables movement logging). Every caller passes only base args.
DROP FUNCTION IF EXISTS public.adjust_inventory_atomic(
  text, uuid, numeric, text, text, uuid
);

-- dispatch_vehicle_route → keep the 10-arg version both surfaces call
-- (jsonb orders/stock, uuid tenant). Legacy 6-arg (text[] invoice ids)
-- has no caller.
DROP FUNCTION IF EXISTS public.dispatch_vehicle_route(
  text, text, text, text[], text, text
);
