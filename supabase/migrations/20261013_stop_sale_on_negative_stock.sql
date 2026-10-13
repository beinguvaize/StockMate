-- Stop a sale that would take stock below zero
-- ============================================================================
--
-- A supermarket counts its shelves against the system. Today the system will
-- happily sell the eleventh unit of a product that has ten, and the stock
-- report then reads -1 for ever: nobody can tell whether that is a miscount, a
-- theft, a missed purchase entry or a sale that should not have happened. The
-- shop stops trusting the report, which is the end of its usefulness.
--
-- Off by default, because a shop that has been running with loose stock has
-- negative balances already and a hard block would stop it billing on the
-- morning it upgrades. Turning it on is a decision with a date, taken when the
-- shelves have been counted.
--
-- WHERE THE CHECK GOES, AND WHY NOT IN THE TILL
--
-- The POS could refuse before sending, and it should for the message -- but it
-- cannot be the enforcement. Three clients write sales (web, desktop, mobile),
-- the desktop queues them offline and replays them later, and a mobile sale
-- arrives through the same RPC with no screen involved at all. A rule that
-- lives in one client is a rule the other two break.
--
-- So it goes where the credit limit already is: inside process_sale, raising
-- the same shape of error -- a MARKER, then a sentence a cashier can act on.
-- InvoiceBuilder already strips that marker and shows the sentence.
--
-- The check runs BEFORE anything is written, so a refused sale leaves no sale
-- row, no lines and no stock movement.
--
-- SERVICES ARE EXEMPT. A haircut has no stock to go negative, and a services
-- tenant with the flag on would be unable to bill anything at all.
--
-- A DELIVERY sale is exempt too: it is not fulfilled at the counter, so its
-- stock has not moved yet and the dispatch is where the shortfall shows up.

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS block_negative_stock boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.business_profile.block_negative_stock IS
  'When true, process_sale refuses a bill that would take any stocked item below '
  'zero at the selling location. Off by default: a shop with existing negative '
  'balances would be unable to bill on the morning it upgraded.';

DO $patch$
DECLARE
  r        record;
  v_src    text;
  v_new    text;
  v_anchor text;
  v_hits   int;
  v_guard  text;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result,
         p.prosecdef, p.provolatile, p.proconfig
    INTO r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_sale';
  IF r IS NULL THEN
    RAISE NOTICE 'process_sale is not present here; nothing to guard';
    RETURN;
  END IF;

  v_src := r.prosrc;
  IF position('NEGATIVE_STOCK_BLOCKED' in v_src) > 0 THEN
    RAISE NOTICE 'process_sale already refuses negative stock';
    RETURN;
  END IF;

  -- Anchored on the line that opens the write phase: everything above it is
  -- resolution (tenant, location, fulfilment), everything below it writes. The
  -- guard therefore sits exactly at the last moment nothing has happened yet.
  v_anchor := '  SET CONSTRAINTS public.sale_items_sale_id_fkey DEFERRED;';
  SELECT count(*) INTO v_hits
    FROM regexp_matches(v_src, 'SET CONSTRAINTS public\.sale_items_sale_id_fkey DEFERRED;', 'g');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'process_sale: write-phase anchor found % times, expected exactly 1', v_hits;
  END IF;

  v_guard :=
    '  -- Stop sale on negative stock, when the shop has asked for it.' || E'\n' ||
    '  -- Services are exempt (nothing to go negative) and so is a delivery,' || E'\n' ||
    '  -- which has not been fulfilled at the counter yet.' || E'\n' ||
    '  IF v_fulfillment_status = ''FULFILLED''' || E'\n' ||
    '     AND COALESCE((SELECT bp.block_negative_stock FROM public.business_profile bp' || E'\n' ||
    '                    WHERE bp.tenant_id = v_tenant_id LIMIT 1), FALSE) THEN' || E'\n' ||
    '    FOR item IN' || E'\n' ||
    '      SELECT x.name AS nm, x.quantity AS want, COALESCE(b.quantity, 0) AS have' || E'\n' ||
    '      FROM jsonb_to_recordset(p_items) AS x(id TEXT, quantity NUMERIC, name TEXT)' || E'\n' ||
    '      JOIN public.products p ON p.id = x.id AND p.tenant_id = v_tenant_id' || E'\n' ||
    '      LEFT JOIN public.inventory_balances b' || E'\n' ||
    '        ON b.product_id = x.id AND b.tenant_id = v_tenant_id' || E'\n' ||
    '       AND b.location_id = v_source_location' || E'\n' ||
    '      WHERE COALESCE(p.product_type, ''GOODS'') <> ''SERVICE''' || E'\n' ||
    '        AND COALESCE(b.quantity, 0) < x.quantity' || E'\n' ||
    '      ORDER BY x.name LIMIT 1' || E'\n' ||
    '    LOOP' || E'\n' ||
    '      RAISE EXCEPTION ''NEGATIVE_STOCK_BLOCKED: % has % in stock and this bill needs %'',' || E'\n' ||
        -- Cast before ROUND: inventory_balances.quantity is double precision on
    -- one of the two databases, and round(double precision, int) does not
    -- exist -- the guard fired correctly and then died formatting its own
    -- message, which would have refused every sale with the wrong reason.
    '        item.nm, ROUND(item.have::numeric, 2), ROUND(item.want::numeric, 2)' || E'\n' ||
    '        USING ERRCODE = ''check_violation'';' || E'\n' ||
    '    END LOOP;' || E'\n' ||
    '  END IF;' || E'\n\n';

  v_new := replace(v_src, v_anchor, v_guard || v_anchor);
  IF v_new = v_src THEN
    RAISE EXCEPTION 'process_sale: anchor matched but nothing changed';
  END IF;

  -- Every attribute read back from the catalog, not hardcoded: prod and dev
  -- differ on this function's argument list and search_path, and a migration
  -- that assumes either would change one of them.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.process_sale(%s) RETURNS %s LANGUAGE plpgsql %s %s %s AS %L',
    r.args, r.result,
    CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN r.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
    COALESCE((SELECT string_agg('SET ' || split_part(c, '=', 1) || ' TO ' || quote_literal(split_part(c, '=', 2)), ' ')
                FROM unnest(r.proconfig) AS c), ''),
    v_new);
END $patch$;

-- Prove it, rather than report a success the patch did not achieve.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'process_sale'
       AND position('NEGATIVE_STOCK_BLOCKED' in p.prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'process_sale still has no negative-stock guard';
  END IF;
END $check$;
