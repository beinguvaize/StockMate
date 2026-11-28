-- A stock write-off moves no cash (owner-approved, 28 Nov 2026). SERVER SIDE ONLY.
--
-- write_off_batch (the only writer of method ADJUSTMENT expenses) books the
-- lost stock as an expense, category 'Inventory Write-off', method
-- 'ADJUSTMENT'. It writes NO journal of its own: it only lowers the batch and
-- inventory_balances. Two triggers then mis-posted that expense as if cash
-- had been paid:
--   post_expense_to_ledger  wrote an OUT row on the BANK account
--                           (any method that is not CASH/UPI fell to BANK);
--   gl_post_expenses        posted Dr 5200 / Cr 1000 Cash.
-- The goods left the shelf, not money left the till, so:
--   post_expense_to_ledger  posts nothing for ADJUSTMENT (as for ADVANCE);
--   gl_post_expenses        posts Dr 5200 / Cr 1200 Inventory.
-- 1200 Inventory is the stock asset every perpetual movement already uses
-- (purchases Dr 1200; sales and returns move it by COGS), and nothing else
-- credits it for a write-off, so this is its one and only credit.
--
-- The P&L (get_pl_ranged) sums every live expense whatever its method, so the
-- write-off counts there exactly as before; P&L and COGS functions are not
-- touched. No other method changes. Existing rows are NOT reposted here: see
-- supabase/scripts/NOT_RUN_correct_adjustment_expense_postings.sql.
--
-- Requires 20261127_staff_advances (the anchors below are its text). By
-- asserted replacement: each anchor must be found exactly once. Attributes are
-- read back from the catalog; CREATE OR REPLACE keeps the grants, and the
-- is_restoring() guard at the top of both bodies is left as it is.
DO $patch$
DECLARE
  r        record;
  v_new    text;
  v_hits   int;
  targets  text[][] := ARRAY[
    ARRAY['post_expense_to_ledger',
          E'  IF v_method = ''ADVANCE'' THEN RETURN NEW; END IF;\n',
          E'  IF v_method = ''ADVANCE'' THEN RETURN NEW; END IF;\n'
          || E'  -- stock write-off: an ADJUSTMENT expense is stock lost, not money paid.\n'
          || E'  IF v_method = ''ADJUSTMENT'' THEN RETURN NEW; END IF;\n'],
    ARRAY['gl_post_expenses',
          E'CASE WHEN upper(COALESCE(NEW.payment_method, '''')) = ''ADVANCE'' THEN ''1300'' ELSE ''1000'' END), v_amount);',
          E'CASE upper(COALESCE(NEW.payment_method, ''''))\n'
          || E'      WHEN ''ADVANCE'' THEN ''1300''\n'
          || E'      -- stock write-off: an ADJUSTMENT expense credits 1200 Inventory, not cash.\n'
          || E'      WHEN ''ADJUSTMENT'' THEN ''1200''\n'
          || E'      ELSE ''1000'' END), v_amount);']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    SELECT p.prosrc, pg_get_function_result(p.oid) AS result, p.prosecdef, p.provolatile, p.proconfig INTO r
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = targets[i][1];
    IF r IS NULL THEN
      RAISE EXCEPTION 'stock_write_off: % is not on this database', targets[i][1];
    END IF;
    IF position('stock write-off:' in r.prosrc) > 0 THEN
      RAISE NOTICE '% already patched', targets[i][1];
      CONTINUE;
    END IF;
    IF position('is_restoring()' in r.prosrc) = 0 THEN
      RAISE EXCEPTION 'stock_write_off: % has lost its shop-restore guard; re-read it first', targets[i][1];
    END IF;
    v_hits := (length(r.prosrc) - length(replace(r.prosrc, targets[i][2], ''))) / length(targets[i][2]);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'stock_write_off: anchor in % found % times, expected exactly 1 (is 20261127_staff_advances applied?)', targets[i][1], v_hits;
    END IF;
    v_new := replace(r.prosrc, targets[i][2], targets[i][3]);
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I() RETURNS %s LANGUAGE plpgsql %s %s %s AS %L',
      targets[i][1], r.result,
      CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN r.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
      COALESCE((SELECT string_agg('SET ' || split_part(c, '=', 1) || ' TO ' || quote_literal(split_part(c, '=', 2)), ' ')
                  FROM unnest(r.proconfig) AS c), ''),
      v_new);
  END LOOP;
END $patch$;

-- Prove it landed.
DO $check$
BEGIN
  IF position('''ADJUSTMENT'' THEN RETURN NEW' in (SELECT prosrc FROM pg_proc WHERE proname = 'post_expense_to_ledger')) = 0
     OR position('''ADJUSTMENT'' THEN ''1200''' in (SELECT prosrc FROM pg_proc WHERE proname = 'gl_post_expenses')) = 0
     OR position('is_restoring()' in (SELECT prosrc FROM pg_proc WHERE proname = 'post_expense_to_ledger')) = 0
     OR position('is_restoring()' in (SELECT prosrc FROM pg_proc WHERE proname = 'gl_post_expenses')) = 0 THEN
    RAISE EXCEPTION 'stock_write_off: an edit did not land';
  END IF;
END $check$;
