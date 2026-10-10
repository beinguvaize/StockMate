-- ==============================================================
-- Replay regression test — an op replayed is not an op applied twice
-- ==============================================================
-- Exercises the guards added in
--   20261012_a_replayed_sale_is_not_a_second_sale.sql
--
-- The offline outbox replays an RPC when the network comes back, so every
-- function it can queue must survive being called twice with the same id.
-- Before that migration none of these did:
--
--   process_sale           unique violation -> six retries -> FAILED, for a
--                          sale that is already in the books
--   process_sales_return   same shape
--   settle_client_payment  allocated the receipt A SECOND TIME, marking bills
--                          PAID that the customer had not paid
--
-- Each case runs the op TWICE and compares against a CONTROL that runs the
-- same op ONCE. Comparing to a control rather than to a hardcoded number is
-- the point: a guard that swallows the first call as well as the second also
-- produces "one row", and would pass a weaker test. Measured on dev while
-- writing this, both of these are true of a single call on some databases:
-- sale_items can be empty and the stock delta can differ from the quantity.
-- Asserting replay == control is immune to all of that.
--
-- Side-effect-free: BEGIN / ROLLBACK wraps everything. Fails loud with
-- RAISE EXCEPTION on any mismatch; emits 'OK:' notices per passing case.
--
-- Subject tenant: pass one explicitly, or let it find a demo/test tenant by
-- name. It refuses rather than guessing, and that refusal has already earned
-- itself once -- run unpointed on dev it declined, because every tenant there
-- is a copy named after the real business.
--
-- Run:
--   psql "<conn>" -f supabase/tests/replay_idempotency_test.sql              -- finds a demo tenant
--   psql "<conn>" -c "SET stockmate.test_tenant = '<uuid>'" -f ...           -- or name one
-- or via the Supabase MCP execute_sql.

BEGIN;

DO $test$
DECLARE
  k_tenant   uuid;
  k_user     uuid;
  k_product  text;
  v_items    jsonb;
  v_id       text;
  -- replayed / control measurements
  r_sales int; r_lines int; r_gl int; r_txn int; r_stock numeric;
  c_sales int; c_lines int; c_gl int; c_txn int; c_stock numeric;
  v_paid   numeric;
  v_status text;
  v_nargs  int;
BEGIN
  -- An explicit tenant wins; otherwise look for one that announces itself as
  -- disposable. Never fall back to "the first tenant", which on dev is a copy
  -- of the real business and on prod IS the real business.
  k_tenant := NULLIF(current_setting('stockmate.test_tenant', true), '')::uuid;
  IF k_tenant IS NULL THEN
    SELECT id INTO k_tenant FROM public.tenants
     WHERE name ILIKE '%demo%' OR name ILIKE '%test%' ORDER BY created_at LIMIT 1;
  END IF;
  IF k_tenant IS NULL THEN
    RAISE EXCEPTION 'no demo/test tenant here and none named via stockmate.test_tenant — refusing to write to a real one';
  END IF;

  SELECT id INTO k_user FROM public.users WHERE tenant_id = k_tenant LIMIT 1;
  SELECT id INTO k_product FROM public.products
   WHERE tenant_id = k_tenant AND deleted_at IS NULL AND COALESCE(stock, 0) > 5
   ORDER BY stock DESC LIMIT 1;
  IF k_user IS NULL OR k_product IS NULL THEN
    RAISE EXCEPTION 'tenant % has no user or no stocked product to bill', k_tenant;
  END IF;

  -- process_sale's signature differs between databases (prod carries a
  -- trailing p_discount that dev does not), so dispatch on the arity rather
  -- than hardcoding one call shape.
  SELECT count(*) INTO v_nargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL unnest(p.proargtypes) AS t
   WHERE n.nspname = 'public' AND p.proname = 'process_sale';

  v_items := jsonb_build_array(jsonb_build_object(
    'id', k_product, 'quantity', 2, 'name', 'replay probe', 'price', 100, 'taxRate', 0));

  -- ---------------------------------------------------------------
  -- 1. process_sale, replayed
  -- ---------------------------------------------------------------
  -- Measure the REPLAY, not a separate control sale. An earlier version of
  -- this test compared a replayed sale against a control sale rung once, and
  -- it failed on prod with "stock 1 replayed vs 2 control". That turned out
  -- NOT to be the guard: three single sales, no replay anywhere, move stock
  -- 1, then 2, then 2. The first sale of a product at a location deducts one
  -- less than the ones after it, which is a real and separate defect. A test
  -- that compares two different sales inherits it; a test that calls once,
  -- measures, calls again and asserts NOTHING MOVED does not.
  v_id := 'REPLAY-' || to_char(clock_timestamp(), 'HH24MISSMS');

  IF v_nargs = 15 THEN
    PERFORM public.process_sale(v_id, 'WALKIN', v_items, 200::numeric, 'CASH', 'PAID',
      to_char(current_date,'YYYY-MM-DD'), k_user, NULL::uuid, NULL::text, k_tenant,
      'PICKUP', 'TEST', 200::numeric, 0::numeric);
  ELSE
    PERFORM public.process_sale(v_id, 'WALKIN', v_items, 200::numeric, 'CASH', 'PAID',
      to_char(current_date,'YYYY-MM-DD'), k_user, NULL::uuid, NULL::text, k_tenant,
      'PICKUP', 'TEST', 200::numeric);
  END IF;

  -- the state one honest sale leaves behind
  SELECT COALESCE(stock, 0) INTO c_stock FROM public.products            WHERE id = k_product;
  SELECT count(*) INTO c_sales FROM public.sales                         WHERE id      = v_id;
  SELECT count(*) INTO c_lines FROM public.sale_items                    WHERE sale_id = v_id;
  SELECT count(*) INTO c_gl    FROM public.gl_journals                   WHERE reference_id = v_id;
  SELECT count(*) INTO c_txn   FROM public.account_transactions          WHERE ref_id = v_id;

  IF c_sales <> 1 THEN
    RAISE EXCEPTION 'process_sale wrote % sales rows for one call — the probe itself is wrong', c_sales;
  END IF;

  -- now the outbox replays it
  IF v_nargs = 15 THEN
    PERFORM public.process_sale(v_id, 'WALKIN', v_items, 200::numeric, 'CASH', 'PAID',
      to_char(current_date,'YYYY-MM-DD'), k_user, NULL::uuid, NULL::text, k_tenant,
      'PICKUP', 'TEST', 200::numeric, 0::numeric);
  ELSE
    PERFORM public.process_sale(v_id, 'WALKIN', v_items, 200::numeric, 'CASH', 'PAID',
      to_char(current_date,'YYYY-MM-DD'), k_user, NULL::uuid, NULL::text, k_tenant,
      'PICKUP', 'TEST', 200::numeric);
  END IF;

  SELECT COALESCE(stock, 0) INTO r_stock FROM public.products            WHERE id = k_product;
  SELECT count(*) INTO r_sales FROM public.sales                         WHERE id      = v_id;
  SELECT count(*) INTO r_lines FROM public.sale_items                    WHERE sale_id = v_id;
  SELECT count(*) INTO r_gl    FROM public.gl_journals                   WHERE reference_id = v_id;
  SELECT count(*) INTO r_txn   FROM public.account_transactions          WHERE ref_id = v_id;

  IF r_stock <> c_stock THEN RAISE EXCEPTION 'process_sale replay moved stock % -> %', c_stock, r_stock; END IF;
  IF r_sales <> c_sales THEN RAISE EXCEPTION 'process_sale replay wrote a second sale row (% -> %)', c_sales, r_sales; END IF;
  IF r_lines <> c_lines THEN RAISE EXCEPTION 'process_sale replay wrote more line rows (% -> %)', c_lines, r_lines; END IF;
  IF r_gl    <> c_gl    THEN RAISE EXCEPTION 'process_sale replay posted another journal (% -> %)', c_gl, r_gl; END IF;
  IF r_txn   <> c_txn   THEN RAISE EXCEPTION 'process_sale replay posted another ledger row (% -> %)', c_txn, r_txn; END IF;
  RAISE NOTICE 'OK: process_sale replay changed nothing (1 sale, % lines, % journals, stock held at %)',
    r_lines, r_gl, r_stock;

  -- ---------------------------------------------------------------
  -- 2. settle_client_payment, replayed — the one that moved money twice
  -- ---------------------------------------------------------------
  -- A PART payment against a non-credit bill is the shape that double
  -- allocated: 300 against a 500 bill left the sale PARTIAL, so the replay
  -- found it still unpaid and allocated the remaining 200. An ON CONFLICT on
  -- client_payments did not help, because when the receipt is fully absorbed
  -- by non-credit sales that insert never runs at all.
  INSERT INTO public.clients (id, tenant_id, name)
  VALUES ('CL-REPLAY-PROBE', k_tenant, 'Replay probe')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.sales (id, tenant_id, "shopId", items, "totalAmount",
                            "paymentMethod", "paymentStatus", "paidAmount", date, "customerInfo")
  VALUES ('SALE-REPLAY-PROBE', k_tenant, 'CL-REPLAY-PROBE', '[]'::jsonb, 500,
          'CASH', 'UNPAID', 0, to_char(current_date, 'YYYY-MM-DD'),
          jsonb_build_object('id', 'CL-REPLAY-PROBE', 'name', 'Replay probe'));

  PERFORM public.settle_client_payment('CP-REPLAY-PROBE', k_tenant, 'CL-REPLAY-PROBE',
                                       300::numeric, current_date, 'CASH', NULL, NULL);
  PERFORM public.settle_client_payment('CP-REPLAY-PROBE', k_tenant, 'CL-REPLAY-PROBE',
                                       300::numeric, current_date, 'CASH', NULL, NULL);

  SELECT "paidAmount", "paymentStatus" INTO v_paid, v_status
    FROM public.sales WHERE id = 'SALE-REPLAY-PROBE';

  IF v_paid <> 300 THEN
    RAISE EXCEPTION 'settle_client_payment: Rs 300 paid twice allocated Rs % — the receipt was applied more than once', v_paid;
  END IF;
  IF v_status <> 'PARTIAL' THEN
    RAISE EXCEPTION 'settle_client_payment: bill is % after one Rs 300 receipt against Rs 500', v_status;
  END IF;
  RAISE NOTICE 'OK: settle_client_payment replay allocated once (paid %, %)', v_paid, v_status;

  -- ---------------------------------------------------------------
  -- 3. the claim itself
  -- ---------------------------------------------------------------
  IF (SELECT count(*) FROM public.processed_ops
       WHERE fn = 'settle_client_payment' AND op_id = 'CP-REPLAY-PROBE') <> 1 THEN
    RAISE EXCEPTION 'processed_ops holds % claims for one op id',
      (SELECT count(*) FROM public.processed_ops WHERE op_id = 'CP-REPLAY-PROBE');
  END IF;
  RAISE NOTICE 'OK: processed_ops holds exactly one claim';

  RAISE NOTICE 'ALL REPLAY CASES PASSED';
END $test$;

ROLLBACK;
