-- ==============================================================
-- Stock write-off moves no cash (20261128_stock_write_off_moves_no_cash.sql)
-- ==============================================================
-- Throwaway shop with fresh random ids (dev soft-deletes: reused ids no-op).
-- Writes a batch off with write_off_batch and checks:
--   * no account_transactions row for the write-off, cash and bank unchanged
--   * its journal balances: Dr 5200 / Cr 1200, and 1200 moves exactly once
--   * the P&L counts the write-off as an expense, the same amount as before
--   * ordinary CASH / UPI / BANK expenses post exactly as before (one OUT row
--     on the matching account, Dr 5200 / Cr 1000)
--   * re-saving the same row (replay) changes nothing; editing it reposts once
--
-- Leaves NOTHING behind. In psql it is BEGIN ... ROLLBACK. Over the Supabase
-- MCP, drop BEGIN/ROLLBACK and run SELECT set_config('wo_test.mcp','on',false)
-- in the same call first: the block then RAISES its pass list, rolling back.
BEGIN;

DO $test$
DECLARE
  x    text := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  t    uuid := gen_random_uuid();
  u    text := gen_random_uuid()::text;
  loc  uuid := gen_random_uuid();
  pid  text; bid uuid := gen_random_uuid();
  cash text; upi text; bank text;
  r    jsonb;
  wo   text;
  n    int;
  v    numeric;
  ok   text[] := '{}';
  fail text;
  m    text;
  cash0 numeric;
  gl_of  text;
BEGIN
  pid := 'PRD-' || x; cash := 'ACC-C-' || x; upi := 'ACC-U-' || x; bank := 'ACC-B-' || x;
  INSERT INTO public.tenants (id, name, slug, plan, status) VALUES (t, 'Write-off test ' || x, 'wo-test-' || x, 'PRO', 'ACTIVE');
  INSERT INTO public.users (id, name, email, roles, tenant_id) VALUES (u, 'Owner', 'owner-' || x || '@example.test', ARRAY['OWNER'], t);
  INSERT INTO public.accounts (id, tenant_id, name, type, is_default) VALUES
    (cash, t, 'Cash', 'CASH', true), (upi, t, 'UPI', 'UPI', false), (bank, t, 'Bank', 'BANK', false);
  INSERT INTO public.inventory_locations (id, name, type, tenant_id) VALUES (loc, 'Main', 'WAREHOUSE', t);
  INSERT INTO public.products (id, tenant_id, name) VALUES (pid, t, 'Test item');
  INSERT INTO public.inventory_balances (product_id, location_id, quantity, tenant_id) VALUES (pid, loc, 5, t);
  INSERT INTO public.product_batches (id, tenant_id, product_id, unit_cost, qty_received, qty_remaining, warehouse_id)
  VALUES (bid, t, pid, 40, 5, 5, loc);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  BEGIN
    -- money and books before
    cash0 := coalesce((SELECT sum(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) FROM public.account_transactions WHERE tenant_id = t), 0);
    IF public.gl_account_id(t, '1200') IS NULL THEN RAISE EXCEPTION 'FAIL setup: shop has no GL 1200'; END IF;

    -- ── 1. the write-off ────────────────────────────────────────────────────
    r := public.write_off_batch(bid::text, t, 'Expired');
    IF (r ->> 'loss')::numeric <> 200 THEN RAISE EXCEPTION 'FAIL write-off: loss % (expected 200)', r; END IF;
    SELECT id INTO wo FROM public.expenses WHERE tenant_id = t AND payment_method = 'ADJUSTMENT';
    IF wo IS NULL THEN RAISE EXCEPTION 'FAIL write-off: no ADJUSTMENT expense'; END IF;

    SELECT count(*) INTO n FROM public.account_transactions WHERE tenant_id = t AND ref_type = 'EXPENSE' AND ref_id = wo;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL cash: the write-off posted % account rows', n; END IF;
    IF coalesce((SELECT sum(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) FROM public.account_transactions WHERE tenant_id = t), 0) <> cash0 THEN
      RAISE EXCEPTION 'FAIL cash: cash/bank balance moved';
    END IF;
    ok := ok || 'write-off: no cash or bank row, balances unchanged'::text;

    SELECT string_agg(a.code || ':' || trim_scale(l.debit) || '/' || trim_scale(l.credit), ',' ORDER BY a.code) INTO gl_of
      FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id JOIN public.gl_accounts a ON a.id = l.account_id
     WHERE j.tenant_id = t AND j.reference_type = 'EXPENSE' AND j.reference_id = wo;
    IF gl_of IS DISTINCT FROM '1200:0/200,5200:200/0' THEN RAISE EXCEPTION 'FAIL GL: write-off journal is %', gl_of; END IF;
    SELECT count(*) INTO n FROM public.gl_lines l JOIN public.gl_accounts a ON a.id = l.account_id WHERE l.tenant_id = t AND a.code = '1200';
    v := (SELECT coalesce(sum(l.debit - l.credit), 0) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id = l.account_id WHERE l.tenant_id = t AND a.code = '1200');
    IF n <> 1 OR v <> -200 THEN RAISE EXCEPTION 'FAIL GL: 1200 has % lines, balance %', n, v; END IF;
    IF (SELECT coalesce(sum(l.debit - l.credit), 0) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id = l.account_id WHERE l.tenant_id = t AND a.code = '1000') <> 0 THEN
      RAISE EXCEPTION 'FAIL GL: the write-off touched 1000 Cash';
    END IF;
    ok := ok || 'write-off: journal Dr 5200 200 / Cr 1200 200, 1200 moves once, 1000 untouched'::text;

    SELECT expenses INTO v FROM public.get_pl_ranged(t, current_date - 1, current_date + 1);
    IF v <> 200 THEN RAISE EXCEPTION 'FAIL P&L: expenses % (expected the 200 write-off, as before the fix)', v; END IF;
    ok := ok || 'P&L: the write-off is a 200 expense, as before'::text;

    -- ── 2. replay: the same row saved again changes nothing ────────────────
    UPDATE public.expenses SET amount = amount WHERE id = wo;
    SELECT count(*) INTO n FROM public.account_transactions WHERE tenant_id = t AND ref_id = wo;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL replay: % account rows', n; END IF;
    SELECT count(*) INTO n FROM public.gl_journals WHERE tenant_id = t AND reference_type = 'EXPENSE' AND reference_id = wo;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL replay: % journals', n; END IF;
    r := public.write_off_batch(bid::text, t, 'Expired');
    IF (r ->> 'loss')::numeric <> 0 OR (SELECT count(*) FROM public.expenses WHERE tenant_id = t AND payment_method = 'ADJUSTMENT') <> 1 THEN
      RAISE EXCEPTION 'FAIL replay: a second write_off_batch wrote again: %', r;
    END IF;
    UPDATE public.expenses SET note = 'Expired, checked' WHERE id = wo;
    SELECT count(*) INTO n FROM public.gl_journals WHERE tenant_id = t AND reference_type = 'EXPENSE' AND reference_id = wo;
    IF n <> 1 OR (SELECT count(*) FROM public.account_transactions WHERE tenant_id = t AND ref_id = wo) <> 0 THEN
      RAISE EXCEPTION 'FAIL replay: an edit left % journals or a cash row', n;
    END IF;
    ok := ok || 'replay: re-saving or editing the write-off keeps one journal and no cash row; writing the batch off again is a no-op'::text;

    -- ── 3. ordinary expenses post exactly as before ─────────────────────────
    FOREACH m IN ARRAY ARRAY['CASH', 'UPI', 'BANK'] LOOP
      INSERT INTO public.expenses (id, tenant_id, category, amount, date, payment_method, note)
      VALUES ('EXP-' || m || '-' || x, t, 'Rent', 100, to_char(current_date, 'YYYY-MM-DD'), m, 'test');
      SELECT count(*) INTO n FROM public.account_transactions
       WHERE tenant_id = t AND ref_id = 'EXP-' || m || '-' || x AND direction = 'OUT' AND amount = 100 AND mode = m
         AND account_id = CASE m WHEN 'CASH' THEN cash WHEN 'UPI' THEN upi ELSE bank END;
      IF n <> 1 THEN RAISE EXCEPTION 'FAIL %: % matching OUT rows (expected 1 on its own account)', m, n; END IF;
      SELECT string_agg(a.code || ':' || trim_scale(l.debit) || '/' || trim_scale(l.credit), ',' ORDER BY a.code) INTO gl_of
        FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id JOIN public.gl_accounts a ON a.id = l.account_id
       WHERE j.tenant_id = t AND j.reference_id = 'EXP-' || m || '-' || x;
      IF gl_of IS DISTINCT FROM '1000:0/100,5200:100/0' THEN RAISE EXCEPTION 'FAIL %: journal %', m, gl_of; END IF;
    END LOOP;
    ok := ok || 'CASH, UPI and BANK expenses: one OUT row on their own account, Dr 5200 / Cr 1000, as before'::text;

    SELECT count(*) INTO n FROM (SELECT j.id FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id
                                  WHERE j.tenant_id = t GROUP BY j.id HAVING sum(l.debit) <> sum(l.credit)) b;
    IF n > 0 THEN RAISE EXCEPTION 'FAIL books: % unbalanced journals', n; END IF;
    ok := ok || 'books: every journal balanced'::text;
  EXCEPTION WHEN OTHERS THEN
    fail := SQLERRM;
  END;

  IF current_setting('wo_test.mcp', true) = 'on' THEN
    RAISE EXCEPTION E'stock_write_off_test: % passed%\n%', cardinality(ok),
      CASE WHEN fail IS NULL THEN ', 0 failed' ELSE E'\nFAILED: ' || fail END, array_to_string(ok, E'\n');
  END IF;
  IF fail IS NOT NULL THEN RAISE EXCEPTION 'stock_write_off_test FAILED: % (after % passing checks)', fail, cardinality(ok); END IF;
  RAISE NOTICE E'stock_write_off_test: % passed\n%', cardinality(ok), array_to_string(ok, E'\n');
END $test$;

ROLLBACK;
