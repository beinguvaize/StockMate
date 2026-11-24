-- ─────────────────────────────────────────────────────────────────────────────
-- The credit limit stops being decoration.
--
-- clients.credit_limit has existed for months. ClientWorkspace draws a
-- utilisation bar from it and turns it red past 100%. ClientOutstandingReport
-- has a column headed "Approved Credit Limit". And nothing has ever stopped a
-- sale: process_sale has never contained the string `credit_limit`. A shop
-- could watch the bar go red and keep selling on credit all afternoon.
--
-- WHY ZERO MEANS NO LIMIT
--
-- All 56 clients in production sit at credit_limit = 0, which is the column
-- default -- nobody has ever set one, because until the companion change to
-- the client form there was no input to set it with. If 0 meant "no credit
-- allowed" this migration would refuse EVERY credit sale in the system the
-- moment it landed. 0 is therefore "no limit", which is also how the two
-- existing readers already treat it (both guard with `> 0`).
--
-- Consequence worth stating: on the day this ships it changes nothing. It
-- starts working when a shopkeeper sets a limit. That is the correct order --
-- the rule before the data -- but it does mean this cannot be verified by
-- watching production behave differently.
--
-- WHY THE FUNCTION IS PATCHED BY ANCHOR AND NOT PASTED
--
-- process_sale is 6,723 characters of money logic and dev is known to be
-- BEHIND prod on the COGS path. Pasting a full copy taken from either
-- database silently reverts the other. Both anchors below are asserted to
-- appear exactly once before anything is replaced, and the previous source is
-- snapshotted first.
--
-- The signature is untouched. Adding a parameter would create a second
-- overload and every caller would break with PGRST203.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public._phase5b_fn_snapshot (
  taken_at  timestamptz NOT NULL DEFAULT now(),
  proname   text NOT NULL,
  args      text NOT NULL,
  prosrc    text NOT NULL
);

INSERT INTO public._phase5b_fn_snapshot (proname, args, prosrc)
SELECT p.proname, pg_get_function_arguments(p.oid), p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'process_sale';

DO $patch$
DECLARE
  v_src text; v_args text; v_new text; v_hits int;
  v_declare_anchor CONSTANT text := '  v_total_cogs     NUMERIC := 0;';
  v_check_anchor   CONSTANT text := '  v_outstanding := GREATEST(0, v_total_rounded - v_paid);';
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_sale';

  IF v_src IS NULL THEN RAISE EXCEPTION 'process_sale not found'; END IF;

  -- Idempotent: a second run must not stack two checks into the function.
  IF position('CREDIT_LIMIT_EXCEEDED' in v_src) > 0 THEN
    RAISE NOTICE 'process_sale already enforces the credit limit; nothing to do';
    RETURN;
  END IF;

  SELECT count(*) INTO v_hits
    FROM regexp_matches(v_src, 'v_total_cogs     NUMERIC := 0;', 'g');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'process_sale DECLARE anchor found % times, expected exactly 1', v_hits;
  END IF;

  SELECT count(*) INTO v_hits
    FROM regexp_matches(v_src, 'v_outstanding := GREATEST\(0, v_total_rounded - v_paid\);', 'g');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'process_sale check anchor found % times, expected exactly 1', v_hits;
  END IF;

  v_new := replace(v_src, v_declare_anchor,
    v_declare_anchor || E'\n' ||
    '  v_credit_limit   NUMERIC;' || E'\n' ||
    '  v_client_owes    NUMERIC;');

  -- Placed straight after the outstanding is known and BEFORE the first write:
  -- no stock has moved, no batch consumed, no ledger posted. Raising here
  -- leaves nothing to unwind.
  v_new := replace(v_new, v_check_anchor,
    v_check_anchor || E'\n\n' ||
    '  -- Credit limit. Only a sale that actually adds to what a client owes' || E'\n' ||
    '  -- can breach one, so a paid-in-full bill never consults it. 0 is NO' || E'\n' ||
    '  -- LIMIT, matching both existing readers and the fact that every client' || E'\n' ||
    '  -- in production is still on the default.' || E'\n' ||
    '  IF p_shop_id IS NOT NULL AND v_outstanding > 0 THEN' || E'\n' ||
    '    SELECT COALESCE(credit_limit, 0), COALESCE(outstanding_balance, 0), name' || E'\n' ||
    '      INTO v_credit_limit, v_client_owes, v_client_name' || E'\n' ||
    '    FROM public.clients' || E'\n' ||
    '    WHERE id = p_shop_id AND tenant_id = v_tenant_id AND deleted_at IS NULL;' || E'\n\n' ||
    '    IF COALESCE(v_credit_limit, 0) > 0' || E'\n' ||
    '       AND COALESCE(v_client_owes, 0) + v_outstanding > v_credit_limit THEN' || E'\n' ||
    '      RAISE EXCEPTION ''CREDIT_LIMIT_EXCEEDED: % already owes %, and this bill adds % against an approved limit of %'',' || E'\n' ||
    '        COALESCE(v_client_name, p_shop_id), ROUND(COALESCE(v_client_owes,0),2), ROUND(v_outstanding,2), ROUND(v_credit_limit,2)' || E'\n' ||
    '        USING ERRCODE = ''check_violation'';' || E'\n' ||
    '    END IF;' || E'\n' ||
    '  END IF;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.process_sale(%s) RETURNS void '
    'LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);
END $patch$;

COMMENT ON COLUMN public.clients.credit_limit IS
  'Approved credit, in currency. 0 means NO LIMIT, not no credit -- every '
  'client in production is still on the 0 default, so the other reading would '
  'refuse every credit sale in the system. Enforced server-side in '
  'process_sale, which raises CREDIT_LIMIT_EXCEEDED before any stock moves.';
