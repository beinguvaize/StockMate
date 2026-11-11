-- ==============================================================
-- AI chat regression test -- docs/ai-chat-v1.md §4 and §11
-- ==============================================================
-- Proves, as the `authenticated` role with real JWT claims:
--
--   1. SHAPE     every read function is STABLE, has no tenant argument, does
--                no DML, and anon cannot execute any of them.
--   2. ISOLATION one shop's owner gets that shop's figures from every function
--                and nothing of another shop's, even with sentinels in both.
--   3. ADMIN     a global admin gets their own tenant only, not a total.
--   4. STAFF     a user who is not an owner is refused by every function.
--   5. VOIDED    soft-deleted and voided rows are excluded.
--   6. STORAGE   no direct client writes; a user sees only their own rows; the
--                quota stops at the plan's limit; both tables are outside
--                shop backups and have no trigger.
--   7. READ-ONLY every read function runs inside a read-only transaction.
--
-- Needs two tenants with an owner, and picks them itself. Everything it writes
-- is fixture data in this transaction, and ends in ROLLBACK. On failure it
-- raises naming the assertion. Must not run against real tenants' prod data
-- without review: the rows are rolled back, but it does lock them meanwhile.

BEGIN;

CREATE TEMP TABLE _ai_results (n serial, check_name text) ON COMMIT DROP;
GRANT ALL ON _ai_results TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_user), true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.back() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ── 1. shape ───────────────────────────────────────────────────────────────
DO $t$
DECLARE
  k_fns text[] := ARRAY['ai_sales_summary','ai_top_items','ai_low_stock','ai_expiring_stock','ai_dead_stock',
                        'ai_top_dues','ai_dues_ageing','ai_collections','ai_cash_bank','ai_gst_data_gaps',
                        'ai_purchases_summary','ai_top_suppliers','ai_supplier_dues','ai_cost_up',
                        'ai_gst_input','ai_gst_by_rate'];
  r record;
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY(k_fns);
  IF n <> 16 THEN RAISE EXCEPTION 'SHAPE: expected 16 read functions with one signature each, found %', n; END IF;
  -- ai_gst_home_state reads the shop's GSTIN and returns only its 2-digit state code,
  -- so it is checked here rather than by the private-column rule below.
  FOR r IN SELECT p.oid, p.provolatile, p.prosecdef, p.prosrc FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'ai_gst_home_state' LOOP
    IF r.provolatile <> 's' OR r.prosecdef OR r.prosrc !~ 'ai_owner_tenant\(\)' OR r.prosrc !~ 'left\(' THEN
      RAISE EXCEPTION 'SHAPE: ai_gst_home_state is not a STABLE, INVOKER, owner-only read of 2 characters';
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN RAISE EXCEPTION 'SHAPE: anon can execute ai_gst_home_state'; END IF;
  END LOOP;

  FOR r IN SELECT p.oid, p.proname, p.provolatile, p.prosecdef, p.prosrc,
                  pg_get_function_identity_arguments(p.oid) AS args
             FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(k_fns) LOOP
    IF r.provolatile <> 's' THEN RAISE EXCEPTION 'SHAPE: % is not STABLE', r.proname; END IF;
    IF r.prosecdef THEN RAISE EXCEPTION 'SHAPE: % is SECURITY DEFINER', r.proname; END IF;
    IF r.args ~* 'tenant' THEN RAISE EXCEPTION 'SHAPE: % takes a tenant argument', r.proname; END IF;
    IF r.prosrc ~* '\m(insert\s+into|update\s+public|delete\s+from|truncate)\M' THEN
      RAISE EXCEPTION 'SHAPE: % contains DML', r.proname;
    END IF;
    IF r.prosrc !~ 'ai_owner_tenant\(\)' THEN RAISE EXCEPTION 'SHAPE: % does not resolve the owner', r.proname; END IF;
    IF r.prosrc ~* '\m(phone|contact|gst_no|pan_number|aadhaar|account_no|ifsc|upi_id|billing_address)\M' THEN
      RAISE EXCEPTION 'SHAPE: % names a private column', r.proname;
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN RAISE EXCEPTION 'SHAPE: anon can execute %', r.proname; END IF;
    IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'SHAPE: authenticated cannot execute %', r.proname;
    END IF;
  END LOOP;

  FOR r IN SELECT p.proname, p.provolatile FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('current_tenant_id', 'is_tenant_admin', 'ai_owner_tenant', 'ai_shop_today') LOOP
    IF r.provolatile = 'v' THEN RAISE EXCEPTION 'SHAPE: % is VOLATILE and is called from a STABLE function', r.proname; END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('ai_save_answer','ai_usage_claim','ai_usage_record','ai_set_enabled','ai_usage_status')
       AND has_function_privilege('anon', oid, 'EXECUTE')) > 0 THEN
    RAISE EXCEPTION 'SHAPE: anon can execute a write function';
  END IF;
  INSERT INTO _ai_results (check_name) VALUES ('shape');
END $t$;

-- ── fixtures: two shops with an owner each, and a sentinel in each ─────────
DO $t$
DECLARE
  v_a uuid; v_b uuid; v_ua text; v_ub text; v_day date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r record;
BEGIN
  SELECT t.id, min(u.id) INTO v_a, v_ua FROM tenants t JOIN users u ON u.tenant_id = t.id
   WHERE t.deleted_at IS NULL AND 'OWNER' = ANY(u.roles) AND NOT 'GLOBAL_ADMIN' = ANY(u.roles)
   GROUP BY t.id ORDER BY t.id LIMIT 1;
  SELECT t.id, min(u.id) INTO v_b, v_ub FROM tenants t JOIN users u ON u.tenant_id = t.id
   WHERE t.deleted_at IS NULL AND 'OWNER' = ANY(u.roles) AND NOT 'GLOBAL_ADMIN' = ANY(u.roles) AND t.id <> v_a
   GROUP BY t.id ORDER BY t.id LIMIT 1;
  IF v_b IS NULL THEN RAISE EXCEPTION 'FIXTURE: needs two tenants with an owner'; END IF;

  PERFORM set_config('ai_test.a', v_a::text, true);
  PERFORM set_config('ai_test.b', v_b::text, true);
  PERFORM set_config('ai_test.ua', v_ua, true);
  PERFORM set_config('ai_test.ub', v_ub, true);
  PERFORM set_config('ai_test.day', v_day::text, true);

  -- The sentinels are plain rows; triggers are off so they post nothing to the
  -- ledgers. Amounts are unique to each shop, so a leak shows up exactly.
  SET LOCAL session_replication_role = replica;
  FOR r IN SELECT * FROM (VALUES (v_a, 'A', 1111111.11::numeric), (v_b, 'B', 2222222.22::numeric)) x(t, tag, amt) LOOP
    -- The bill's own line carries no taxRate: ai_gst_by_rate shows it as "rate not set".
    INSERT INTO sales (id, tenant_id, "totalAmount", "paidAmount", date, status, "paymentStatus", "paymentMethod", items)
    VALUES ('AITEST-S-' || r.tag, r.t, r.amt, 0, v_day::text, 'COMPLETED', 'UNPAID', 'CREDIT', '[{"qty": 1}]'::jsonb);
    INSERT INTO sale_items (tenant_id, sale_id, line_no, product_id, product_name, quantity, rate, hsn_code)
    VALUES (r.t, 'AITEST-S-' || r.tag, 1, 'AITEST-P-' || r.tag, 'AITEST item ' || r.tag, 1, r.amt, NULL);
    INSERT INTO products (id, tenant_id, name, unit, stock, "costPrice", "lowStockThreshold", product_type, "sellingPrice")
    VALUES ('AITEST-P-' || r.tag, r.t, 'AITEST item ' || r.tag, 'PCS', 1, r.amt, 100, 'STANDARD', 1),
           ('AITEST-Q-' || r.tag, r.t, 'AITEST stuck ' || r.tag, 'PCS', 7, r.amt, 1, 'STANDARD', 1);
    INSERT INTO product_batches (tenant_id, product_id, received_date, unit_cost, qty_received, qty_remaining, expiry_date, origin)
    VALUES (r.t, 'AITEST-P-' || r.tag, v_day, r.amt, 1, 1, v_day + 5, 'ADJUSTMENT');
    INSERT INTO clients (id, tenant_id, name, outstanding_balance)
    VALUES ('AITEST-C-' || r.tag, r.t, 'AITEST client ' || r.tag, r.amt);
    INSERT INTO client_payments (id, tenant_id, client_id, amount, date, payment_method)
    VALUES ('AITEST-CP-' || r.tag, r.t, 'AITEST-C-' || r.tag, r.amt, v_day::text, 'CASH');
    INSERT INTO accounts (id, tenant_id, name, type, opening_balance)
    VALUES ('AITEST-AC-' || r.tag, r.t, 'AITEST account ' || r.tag, 'CASH', r.amt);
    INSERT INTO purchases (id, tenant_id, date, total_amount, quantity, bill_no, supplier_id)
    VALUES ('AITEST-PU-' || r.tag, r.t, v_day::text, r.amt, 1, NULL, NULL);
    -- A supplier owed one unpaid bill, whose item cost more than on the bill before.
    INSERT INTO suppliers (id, tenant_id, name) VALUES ('AITEST-SU-' || r.tag, r.t, 'AITEST supplier ' || r.tag);
    INSERT INTO purchases (id, tenant_id, date, created_at, total_amount, paid_amount, quantity, supplier_id, supplier_name, status, payment_type, linked_product_id)
    VALUES ('AITEST-PU3-' || r.tag, r.t, (v_day - 1)::text, now() - interval '1 day', r.amt, r.amt, 4, 'AITEST-SU-' || r.tag,
            'AITEST supplier ' || r.tag, 'RECEIVED', 'CASH', 'AITEST-P-' || r.tag),
           ('AITEST-PU2-' || r.tag, r.t, v_day::text, now(), r.amt + 1, 0, 1, 'AITEST-SU-' || r.tag,
            'AITEST supplier ' || r.tag, 'RECEIVED', 'CREDIT', 'AITEST-P-' || r.tag);
  END LOOP;
  SET LOCAL session_replication_role = origin;
END $t$;

-- ── 2 + 3 + 4. who sees what ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.all_reads(p_day date) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object(
    'sales', public.ai_sales_summary(p_day, p_day),
    'top',   public.ai_top_items(p_day, p_day, 100),
    'low',   public.ai_low_stock(100),
    'exp',   public.ai_expiring_stock(30, 100),
    'dead',  public.ai_dead_stock(0, 100),
    'dues',  public.ai_top_dues(100),
    'age',   public.ai_dues_ageing(),
    'coll',  public.ai_collections(p_day, p_day),
    'cash',  public.ai_cash_bank(),
    'gaps',  public.ai_gst_data_gaps(p_day, p_day),
    'pur',   public.ai_purchases_summary(p_day, p_day),
    'tsup',  public.ai_top_suppliers(p_day, p_day, 100),
    'sdue',  public.ai_supplier_dues(100),
    'cost',  public.ai_cost_up(90, 100),
    'gin',   public.ai_gst_input(p_day, p_day),
    'rate',  public.ai_gst_by_rate(p_day, p_day));
END $$;

DO $t$
DECLARE
  v_ua text := current_setting('ai_test.ua'); v_ub text := current_setting('ai_test.ub');
  v_a uuid := current_setting('ai_test.a')::uuid;
  v_day date := current_setting('ai_test.day')::date;
  v jsonb; s text; k text;
  v_expect jsonb;
BEGIN
  -- Owner A: A's sentinels in every function, nothing of B's.
  PERFORM pg_temp.act_as(v_ua);
  v := pg_temp.all_reads(v_day);
  PERFORM pg_temp.back();
  s := v::text;
  FOREACH k IN ARRAY ARRAY['AITEST item A', 'AITEST client A', 'AITEST account A', 'AITEST stuck A', 'AITEST supplier A'] LOOP
    IF position(k IN s) = 0 THEN RAISE EXCEPTION 'ISOLATION: % missing from owner A''s figures', k; END IF;
  END LOOP;
  IF s ~ 'AITEST (item|client|account|stuck|supplier) B' OR s ~ '2222222' THEN
    RAISE EXCEPTION 'ISOLATION: owner A can see shop B: %', left(s, 400);
  END IF;
  IF (v #>> '{sales,gross_sales}')::numeric < 1111111.11 THEN RAISE EXCEPTION 'ISOLATION: sentinel sale not counted'; END IF;
  IF (v #>> '{coll,collected}')::numeric < 1111111.11 THEN RAISE EXCEPTION 'ISOLATION: sentinel receipt not counted'; END IF;
  IF (v #>> '{cash,total_balance}')::numeric < 1111111.11 THEN RAISE EXCEPTION 'ISOLATION: sentinel account not counted'; END IF;
  IF (v #>> '{gaps,purchases_no_bill_no}')::int < 1 THEN RAISE EXCEPTION 'ISOLATION: sentinel purchase not counted'; END IF;
  IF (v #>> '{pur,total_value}')::numeric < 1111111.11 * 2 + 1 THEN RAISE EXCEPTION 'ISOLATION: sentinel purchases not in the month total'; END IF;
  IF (v #>> '{sdue,total_owed}')::numeric < 1111112.11 THEN RAISE EXCEPTION 'ISOLATION: sentinel supplier bill not owed'; END IF;
  IF NOT (v -> 'cost' -> 'items') @> '[{"product_name": "AITEST item A", "new_cost": 1111112.11}]'::jsonb THEN
    RAISE EXCEPTION 'ISOLATION: sentinel cost rise missing: %', v -> 'cost';
  END IF;
  IF (v #>> '{gin,bill_count}')::int < 2 OR (v #>> '{gin,invoice_value}')::numeric < 1111111.11 * 2 + 1 THEN
    RAISE EXCEPTION 'ISOLATION: sentinel purchases not in GST on purchases: %', v -> 'gin';
  END IF;
  IF (v #>> '{rate,not_set_lines}')::int < 1 THEN RAISE EXCEPTION 'ISOLATION: sentinel line with no rate not shown as rate not set'; END IF;
  -- Totals cover every row even when the list is capped.
  PERFORM pg_temp.act_as(v_ua);
  IF (public.ai_low_stock(1) ->> 'items_low')::int <> (v #>> '{low,items_low}')::int
     OR jsonb_array_length(public.ai_low_stock(1) -> 'items') <> 1 THEN
    RAISE EXCEPTION 'ISOLATION: a capped list changed its total, or was not capped';
  END IF;
  PERFORM pg_temp.back();
  INSERT INTO _ai_results (check_name) VALUES ('isolation');

  -- The same figures for B the other way round.
  PERFORM pg_temp.act_as(v_ub);
  s := pg_temp.all_reads(v_day)::text;
  PERFORM pg_temp.back();
  IF s ~ 'AITEST (item|client|account|stuck|supplier) A' OR s ~ '1111111' THEN
    RAISE EXCEPTION 'ISOLATION: owner B can see shop A';
  END IF;

  -- Global admin: A's owner promoted. RLS now passes every shop, so only the
  -- explicit tenant filter stands between this call and a total of all shops.
  UPDATE users SET roles = array_append(roles, 'GLOBAL_ADMIN') WHERE id = v_ua;
  PERFORM pg_temp.act_as(v_ua);
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'ADMIN: fixture is not a global admin'; END IF;
  v_expect := pg_temp.all_reads(v_day);
  -- Proof the guard is what holds: the same read without the filter does see B.
  IF NOT EXISTS (SELECT 1 FROM public.sales WHERE id = 'AITEST-S-B') THEN
    RAISE EXCEPTION 'ADMIN: fixture cannot prove anything, RLS already hides shop B';
  END IF;
  PERFORM pg_temp.back();
  s := v_expect::text;
  IF s ~ 'AITEST (item|client|account|stuck|supplier) B' OR s ~ '2222222' THEN
    RAISE EXCEPTION 'ADMIN: a global admin''s figures include another shop';
  END IF;
  IF (v_expect #>> '{sales,gross_sales}') <> (v #>> '{sales,gross_sales}')
     OR (v_expect #>> '{dues,total_outstanding}') <> (v #>> '{dues,total_outstanding}')
     OR (v_expect #>> '{cash,total_balance}') <> (v #>> '{cash,total_balance}')
     OR (v_expect #>> '{pur,total_value}') <> (v #>> '{pur,total_value}')
     OR (v_expect #>> '{sdue,total_owed}') <> (v #>> '{sdue,total_owed}') THEN
    RAISE EXCEPTION 'ADMIN: figures differ from the owner''s own';
  END IF;
  UPDATE users SET roles = array_remove(roles, 'GLOBAL_ADMIN') WHERE id = v_ua;
  INSERT INTO _ai_results (check_name) VALUES ('global_admin');

  -- Staff: A's owner demoted, every function refuses.
  UPDATE users SET roles = ARRAY['STAFF'] WHERE id = v_ua;
  PERFORM pg_temp.act_as(v_ua);
  FOREACH k IN ARRAY ARRAY[
    format('ai_sales_summary(%L, %L)', v_day, v_day), format('ai_top_items(%L, %L)', v_day, v_day), 'ai_low_stock()',
    'ai_expiring_stock()', 'ai_dead_stock()', 'ai_top_dues()', 'ai_dues_ageing()',
    format('ai_collections(%L, %L)', v_day, v_day), 'ai_cash_bank()', format('ai_gst_data_gaps(%L, %L)', v_day, v_day),
    format('ai_purchases_summary(%L, %L)', v_day, v_day), format('ai_top_suppliers(%L, %L)', v_day, v_day),
    'ai_supplier_dues()', 'ai_cost_up()',
    format('ai_gst_input(%L, %L)', v_day, v_day), format('ai_gst_by_rate(%L, %L)', v_day, v_day), 'ai_gst_home_state()',
    'ai_set_enabled(true)', $q$ai_usage_claim('sales_today', 'en', 'm')$q$
  ] LOOP
    BEGIN
      EXECUTE 'SELECT public.' || k;
      PERFORM pg_temp.back();
      RAISE EXCEPTION 'STAFF_NOT_REFUSED %', k;
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;   -- refused, as it should be
    END;
    PERFORM pg_temp.act_as(v_ua);
  END LOOP;
  PERFORM pg_temp.back();
  UPDATE users SET roles = ARRAY['OWNER'] WHERE id = v_ua;
  INSERT INTO _ai_results (check_name) VALUES ('staff_refused');

  -- No user row at all.
  PERFORM pg_temp.act_as('00000000-0000-4000-8000-00000000abcd');
  BEGIN
    PERFORM public.ai_cash_bank();
    PERFORM pg_temp.back();
    RAISE EXCEPTION 'A user with no shop was not refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.back();
END $t$;

-- ── 10. sales and stock, second set: shape, isolation, staff, deleted ─────
-- Runs here, before 5, because it reads the shared fixtures while they are
-- still live. Self-contained: its own rows go in, and a closing sentinel
-- exception undoes every one of them, so the checks after it see the shared
-- fixtures only.
CREATE OR REPLACE FUNCTION pg_temp.ss_reads(p_day date) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN jsonb_build_object(
    'day',  public.ai_sales_by_day(p_day, p_day),
    'cust', public.ai_best_customers(p_day, p_day, 100),
    'ret',  public.ai_sales_returns(p_day, p_day, 100),
    'val',  public.ai_stock_value(100),
    'out',  public.ai_out_of_stock(100),
    'fast', public.ai_fast_movers_low(30, 100, 7, 100));
END $$;

DO $t$
DECLARE
  k_fns text[] := ARRAY['ai_sales_by_day','ai_best_customers','ai_sales_returns','ai_stock_value','ai_out_of_stock','ai_fast_movers_low'];
  v_ua text := current_setting('ai_test.ua'); v_ub text := current_setting('ai_test.ub');
  v_a uuid := current_setting('ai_test.a')::uuid; v_b uuid := current_setting('ai_test.b')::uuid;
  v_day date := current_setting('ai_test.day')::date;
  r record; n int; v jsonb; s text; k text;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY(k_fns);
    IF n <> 6 THEN RAISE EXCEPTION 'SS SHAPE: expected 6 functions with one signature each, found %', n; END IF;
    FOR r IN SELECT p.oid, p.proname, p.provolatile, p.prosecdef, p.prosrc, pg_get_function_identity_arguments(p.oid) AS args
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(k_fns) LOOP
      IF r.provolatile <> 's' OR r.prosecdef THEN RAISE EXCEPTION 'SS SHAPE: % is not STABLE INVOKER', r.proname; END IF;
      IF r.args ~* 'tenant' THEN RAISE EXCEPTION 'SS SHAPE: % takes a tenant argument', r.proname; END IF;
      IF r.prosrc ~* '\m(insert\s+into|update\s+public|delete\s+from|truncate)\M' THEN RAISE EXCEPTION 'SS SHAPE: % contains DML', r.proname; END IF;
      IF r.prosrc !~ 'ai_owner_tenant\(\)' THEN RAISE EXCEPTION 'SS SHAPE: % does not resolve the owner', r.proname; END IF;
      IF r.prosrc ~* '\m(phone|contact|gstin|gst_no|pan_number|aadhaar|account_no|ifsc|upi_id|billing_address|shipping_address)\M' THEN
        RAISE EXCEPTION 'SS SHAPE: % names a private column', r.proname;
      END IF;
      IF has_function_privilege('anon', r.oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'SS SHAPE: wrong grants on %', r.proname;
      END IF;
    END LOOP;

    -- Per shop: a sale to the shop's client, a return of the sentinel item,
    -- and a product at zero. The shared sentinel sale is walk-in.
    SET LOCAL session_replication_role = replica;
    FOR r IN SELECT * FROM (VALUES (v_a, 'A', 1111111.11::numeric), (v_b, 'B', 2222222.22::numeric)) x(t, tag, amt) LOOP
      INSERT INTO sales (id, tenant_id, "totalAmount", "paidAmount", date, status, "paymentStatus", "paymentMethod", "customerInfo")
      VALUES ('AITEST-S2-' || r.tag, r.t, r.amt + 1, 0, v_day::text, 'COMPLETED', 'UNPAID', 'CREDIT',
              jsonb_build_object('id', 'AITEST-C-' || r.tag, 'name', 'AITEST client ' || r.tag));
      INSERT INTO sales_returns (id, tenant_id, sale_id, total_amount, date)
      VALUES ('AITEST-R-' || r.tag, r.t, 'AITEST-S-' || r.tag, r.amt + 2, v_day);
      INSERT INTO sales_return_items (tenant_id, return_id, line_no, product_id, product_name, quantity, rate)
      VALUES (r.t, 'AITEST-R-' || r.tag, 1, 'AITEST-P-' || r.tag, 'AITEST item ' || r.tag, 1, r.amt + 2);
      INSERT INTO products (id, tenant_id, name, unit, stock, "costPrice", product_type, "sellingPrice")
      VALUES ('AITEST-O-' || r.tag, r.t, 'AITEST out ' || r.tag, 'PCS', 0, 1, 'STANDARD', 1);
    END LOOP;
    SET LOCAL session_replication_role = origin;

    PERFORM pg_temp.act_as(v_ua);
    v := pg_temp.ss_reads(v_day);
    PERFORM pg_temp.back();
    s := v::text;
    FOREACH k IN ARRAY ARRAY['AITEST item A', 'AITEST client A', 'AITEST out A'] LOOP
      IF position(k IN s) = 0 THEN RAISE EXCEPTION 'SS ISOLATION: % missing from owner A''s figures', k; END IF;
    END LOOP;
    IF s ~ 'AITEST (item|client|out|stuck) B' OR s ~ '2222222' THEN RAISE EXCEPTION 'SS ISOLATION: owner A sees shop B: %', left(s, 400); END IF;
    IF (v #>> '{day,gross_sales}')::numeric < 2222223.22 THEN RAISE EXCEPTION 'SS ISOLATION: sentinel sales not in the day'; END IF;
    IF (v #>> '{cust,walk_in_sales}')::numeric < 1111111.11 THEN RAISE EXCEPTION 'SS ISOLATION: walk-in sentinel not counted'; END IF;
    IF NOT (v -> 'cust' -> 'customers') @> '[{"name": "AITEST client A", "sales_value": 1111112.11}]'::jsonb THEN
      RAISE EXCEPTION 'SS ISOLATION: customer sentinel missing';
    END IF;
    IF (v #>> '{ret,returns_total}')::numeric < 1111113.11 THEN RAISE EXCEPTION 'SS ISOLATION: return sentinel not counted'; END IF;
    IF (v #>> '{val,stock_value}')::numeric < 1111111.11 * 8 THEN RAISE EXCEPTION 'SS ISOLATION: sentinel stock not valued'; END IF;
    IF NOT (v -> 'fast' -> 'items') @> '[{"product_name": "AITEST item A", "reason": "limit"}]'::jsonb THEN
      RAISE EXCEPTION 'SS ISOLATION: sentinel best seller not flagged: %', v -> 'fast';
    END IF;
    -- Totals cover every row even when the list is capped.
    PERFORM pg_temp.act_as(v_ua);
    IF (public.ai_out_of_stock(1) ->> 'items_out') <> (v #>> '{out,items_out}') OR jsonb_array_length(public.ai_out_of_stock(1) -> 'items') <> 1
       OR (public.ai_stock_value(1) ->> 'stock_value') <> (v #>> '{val,stock_value}') THEN
      RAISE EXCEPTION 'SS ISOLATION: a capped list changed its total, or was not capped';
    END IF;
    PERFORM pg_temp.back();

    PERFORM pg_temp.act_as(v_ub);
    s := pg_temp.ss_reads(v_day)::text;
    PERFORM pg_temp.back();
    IF s ~ 'AITEST (item|client|out|stuck) A' OR s ~ '1111111' THEN RAISE EXCEPTION 'SS ISOLATION: owner B sees shop A'; END IF;

    -- A global admin gets their own shop only.
    UPDATE users SET roles = array_append(roles, 'GLOBAL_ADMIN') WHERE id = v_ua;
    PERFORM pg_temp.act_as(v_ua);
    s := pg_temp.ss_reads(v_day)::text;
    PERFORM pg_temp.back();
    IF s ~ 'AITEST (item|client|out|stuck) B' OR s ~ '2222222' THEN RAISE EXCEPTION 'SS ADMIN: a global admin sees another shop'; END IF;
    UPDATE users SET roles = ARRAY['STAFF'] WHERE id = v_ua;
    PERFORM pg_temp.act_as(v_ua);
    FOREACH k IN ARRAY ARRAY[format('ai_sales_by_day(%L, %L)', v_day, v_day), format('ai_best_customers(%L, %L)', v_day, v_day),
      format('ai_sales_returns(%L, %L)', v_day, v_day), 'ai_stock_value()', 'ai_out_of_stock()', 'ai_fast_movers_low()'] LOOP
      BEGIN
        EXECUTE 'SELECT public.' || k;
        PERFORM pg_temp.back();
        RAISE EXCEPTION 'SS STAFF: % was not refused', k;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      PERFORM pg_temp.act_as(v_ua);
    END LOOP;
    PERFORM pg_temp.back();
    UPDATE users SET roles = ARRAY['OWNER'] WHERE id = v_ua;

    -- Soft-deleted rows are not read.
    SET LOCAL session_replication_role = replica;
    UPDATE sales SET deleted_at = now() WHERE id IN ('AITEST-S-A', 'AITEST-S2-A');
    UPDATE sales_returns SET deleted_at = now() WHERE id = 'AITEST-R-A';
    UPDATE products SET deleted_at = now() WHERE id IN ('AITEST-P-A', 'AITEST-Q-A', 'AITEST-O-A');
    SET LOCAL session_replication_role = origin;
    PERFORM pg_temp.act_as(v_ua);
    s := pg_temp.ss_reads(v_day)::text;
    PERFORM pg_temp.back();
    IF s ~ 'AITEST' OR s ~ '111111[123]' THEN RAISE EXCEPTION 'SS DELETED: a soft-deleted row was read: %', left(s, 400); END IF;

    RAISE EXCEPTION 'SS_UNDO';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SS_UNDO' THEN RAISE; END IF;
  END;
  INSERT INTO _ai_results (check_name) VALUES ('sales_stock_second_set');
END $t$;

-- ── 5. soft-deleted and voided rows ────────────────────────────────────────
DO $t$
DECLARE
  v_ua text := current_setting('ai_test.ua');
  v_a uuid := current_setting('ai_test.a')::uuid;
  v_day date := current_setting('ai_test.day')::date;
  v_base numeric; v_now numeric; v_age numeric; v_age0 numeric; v jsonb; k text;
BEGIN
  SET LOCAL session_replication_role = replica;
  PERFORM pg_temp.act_as(v_ua);
  v_base := (public.ai_sales_summary(v_day, v_day) ->> 'gross_sales')::numeric;
  v_age0 := (public.ai_dues_ageing() -> 'buckets' -> 0 ->> 'amount')::numeric;
  PERFORM pg_temp.back();

  UPDATE sales SET voided_at = now() WHERE id = 'AITEST-S-A';
  PERFORM pg_temp.act_as(v_ua);
  v_now := (public.ai_sales_summary(v_day, v_day) ->> 'gross_sales')::numeric;
  v_age := (public.ai_dues_ageing() -> 'buckets' -> 0 ->> 'amount')::numeric;
  v := public.ai_top_items(v_day, v_day, 100);
  PERFORM pg_temp.back();
  IF v_base - v_now <> 1111111.11 THEN RAISE EXCEPTION 'VOIDED: a voided sale still counts in sales (% -> %)', v_base, v_now; END IF;
  IF v_age0 - v_age <> 1111111.11 THEN RAISE EXCEPTION 'VOIDED: a voided sale still counts in dues'; END IF;
  IF v::text ~ 'AITEST item A' THEN RAISE EXCEPTION 'VOIDED: a voided sale still counts in top items'; END IF;

  FOREACH k IN ARRAY ARRAY['VOIDED', 'void', 'CANCELLED', 'FAILED', 'REFUNDED'] LOOP
    UPDATE sales SET voided_at = NULL, status = k WHERE id = 'AITEST-S-A';
    PERFORM pg_temp.act_as(v_ua);
    v_now := (public.ai_sales_summary(v_day, v_day) ->> 'gross_sales')::numeric;
    PERFORM pg_temp.back();
    IF v_base - v_now <> 1111111.11 THEN RAISE EXCEPTION 'VOIDED: status % still counts', k; END IF;
  END LOOP;
  UPDATE sales SET status = 'COMPLETED', "paymentStatus" = 'REFUNDED' WHERE id = 'AITEST-S-A';
  PERFORM pg_temp.act_as(v_ua);
  v_now := (public.ai_sales_summary(v_day, v_day) ->> 'gross_sales')::numeric;
  PERFORM pg_temp.back();
  IF v_base - v_now <> 1111111.11 THEN RAISE EXCEPTION 'VOIDED: paymentStatus REFUNDED still counts'; END IF;

  UPDATE sales SET "paymentStatus" = 'UNPAID', deleted_at = now() WHERE id = 'AITEST-S-A';
  UPDATE clients SET deleted_at = now() WHERE id = 'AITEST-C-A';
  UPDATE client_payments SET deleted_at = now() WHERE id = 'AITEST-CP-A';
  UPDATE accounts SET deleted_at = now() WHERE id = 'AITEST-AC-A';
  UPDATE products SET deleted_at = now() WHERE id IN ('AITEST-P-A', 'AITEST-Q-A');
  UPDATE product_batches SET deleted_at = now() WHERE product_id = 'AITEST-P-A';
  UPDATE purchases SET deleted_at = now() WHERE id IN ('AITEST-PU-A', 'AITEST-PU2-A', 'AITEST-PU3-A');
  UPDATE suppliers SET deleted_at = now() WHERE id = 'AITEST-SU-A';
  PERFORM pg_temp.act_as(v_ua);
  v := pg_temp.all_reads(v_day);
  PERFORM pg_temp.back();
  IF v::text ~ 'AITEST' OR v::text ~ '1111111' THEN RAISE EXCEPTION 'VOIDED: a soft-deleted row was read: %', left(v::text, 400); END IF;
  SET LOCAL session_replication_role = origin;
  INSERT INTO _ai_results (check_name) VALUES ('voided_and_deleted');
END $t$;

-- ── 6. storage ─────────────────────────────────────────────────────────────
DO $t$
DECLARE
  v_ua text := current_setting('ai_test.ua'); v_ub text := current_setting('ai_test.ub');
  v_a uuid := current_setting('ai_test.a')::uuid;
  v jsonb; v_id uuid; i int; n int;
BEGIN
  -- Backups and triggers.
  IF EXISTS (SELECT 1 FROM public.shop_backup_tables() t WHERE t.table_name IN ('ai_answer_cache', 'ai_usage')) THEN
    RAISE EXCEPTION 'STORAGE: an AI table would be backed up as shop data';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
              AND tgrelid IN ('public.ai_answer_cache'::regclass, 'public.ai_usage'::regclass)) THEN
    RAISE EXCEPTION 'STORAGE: an AI table has a trigger; it needs the is_restoring guard';
  END IF;

  -- No direct writes.
  IF has_table_privilege('authenticated', 'public.ai_usage', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.ai_answer_cache', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.ai_usage', 'SELECT')
     OR has_table_privilege('anon', 'public.ai_answer_cache', 'SELECT') THEN
    RAISE EXCEPTION 'STORAGE: a table takes direct client access';
  END IF;

  -- Save through the RPC; a user sees their own row; another owner sees none.
  UPDATE tenants SET plan = 'FREE', status = 'ACTIVE' WHERE id = v_a;
  PERFORM pg_temp.act_as(v_ua);
  PERFORM public.ai_save_answer('sales_today', 'en', 'h1', 'first', 'm');
  PERFORM public.ai_save_answer('sales_today', 'en', 'h2', 'second', 'm');
  SELECT count(*) INTO n FROM public.ai_answer_cache WHERE text_with_standins = 'second';
  IF n <> 1 OR (SELECT count(*) FROM public.ai_answer_cache WHERE question_id = 'sales_today') <> 1 THEN
    RAISE EXCEPTION 'STORAGE: the cache did not keep one row per question';
  END IF;

  -- Quota: FREE is 10 a month. The minute limit is also 10, so age the claims.
  FOR i IN 1..10 LOOP
    v := public.ai_usage_claim('sales_today', 'en', 'm');
    IF NOT (v ->> 'ok')::boolean THEN RAISE EXCEPTION 'STORAGE: claim % refused: %', i, v; END IF;
    v_id := (v ->> 'id')::uuid;
  END LOOP;
  v := public.ai_usage_claim('sales_today', 'en', 'm');
  IF (v ->> 'ok')::boolean OR v ->> 'reason' <> 'rate_limited' THEN RAISE EXCEPTION 'STORAGE: minute limit did not hold: %', v; END IF;
  PERFORM pg_temp.back();
  UPDATE ai_usage SET created_at = now() - interval '5 minutes' WHERE tenant_id = v_a;
  PERFORM pg_temp.act_as(v_ua);
  v := public.ai_usage_claim('sales_today', 'en', 'm');
  IF (v ->> 'ok')::boolean OR v ->> 'reason' <> 'quota_reached' THEN RAISE EXCEPTION 'STORAGE: FREE quota did not stop at 10: %', v; END IF;

  -- A model_error gives the answer back; a claim closes once.
  PERFORM public.ai_usage_record(v_id, 'sales_today', 'en', 'm', 0, 0, 0, 'model_error', 5);
  v := public.ai_usage_claim('sales_today', 'en', 'm');
  IF NOT (v ->> 'ok')::boolean THEN RAISE EXCEPTION 'STORAGE: a model_error did not give the answer back: %', v; END IF;
  BEGIN
    PERFORM public.ai_usage_record(v_id, 'sales_today', 'en', 'm', 0, 0, 0, 'answered', 5);
    RAISE EXCEPTION 'CLOSED_TWICE';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'CLOSED_TWICE' THEN RAISE EXCEPTION 'STORAGE: a closed claim closed again'; END IF;
  END;
  PERFORM pg_temp.back();

  -- The other shop's owner sees none of it, and cannot close A's claim.
  PERFORM pg_temp.act_as(v_ub);
  IF (SELECT count(*) FROM public.ai_usage) + (SELECT count(*) FROM public.ai_answer_cache) <> 0 THEN
    RAISE EXCEPTION 'STORAGE: owner B can read owner A''s rows';
  END IF;
  BEGIN
    PERFORM public.ai_usage_record((v ->> 'id')::uuid, 'sales_today', 'en', 'm', 0, 0, 0, 'answered', 5);
    RAISE EXCEPTION 'CROSS_CLOSE';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'CROSS_CLOSE' THEN RAISE EXCEPTION 'STORAGE: owner B closed owner A''s claim'; END IF;
  END;
  PERFORM pg_temp.back();

  -- The switch: owner writes own tenant only, and keeps other settings.
  UPDATE tenants SET settings = '{"keep": 1}' WHERE id = v_a;
  PERFORM pg_temp.act_as(v_ua);
  PERFORM public.ai_set_enabled(true);
  PERFORM pg_temp.back();
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_a AND settings ->> 'ai_enabled' = 'true' AND settings ->> 'keep' = '1') THEN
    RAISE EXCEPTION 'STORAGE: ai_set_enabled did not turn on, or lost other settings';
  END IF;
  INSERT INTO _ai_results (check_name) VALUES ('storage');
END $t$;

-- ── 8. expenses (ai_expense_summary) ───────────────────────────────────────
-- Self-contained: its own shape check and sentinels. Ties `total` to
-- get_pl_ranged's expenses line, keeps drawings and deleted rows out, caps the
-- list but not the total, and never returns a payroll entry's note.
DO $t$
DECLARE
  v_ua text := current_setting('ai_test.ua'); v_ub text := current_setting('ai_test.ub');
  v_a uuid := current_setting('ai_test.a')::uuid;
  v_day date := current_setting('ai_test.day')::date;
  v_has_payroll boolean;
  r record; v jsonb; v0 jsonb; v_pl numeric; s text;
BEGIN
  SELECT p.oid, p.provolatile, p.prosecdef, p.prosrc, pg_get_function_identity_arguments(p.oid) AS args INTO r
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'ai_expense_summary';
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'ai_expense_summary') <> 1 THEN
    RAISE EXCEPTION 'EXPENSES: ai_expense_summary must have exactly one signature';
  END IF;
  IF r.provolatile <> 's' OR r.prosecdef OR r.args ~* 'tenant' OR r.prosrc !~ 'ai_owner_tenant\(\)'
     OR r.prosrc ~* '\m(insert\s+into|update\s+public|delete\s+from|truncate)\M' THEN
    RAISE EXCEPTION 'EXPENSES: ai_expense_summary breaks the read-function rules';
  END IF;
  IF has_function_privilege('anon', r.oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'EXPENSES: wrong grants on ai_expense_summary';
  END IF;

  PERFORM pg_temp.act_as(v_ua);
  v0 := public.ai_expense_summary(v_day, v_day, 100);
  PERFORM pg_temp.back();

  SET LOCAL session_replication_role = replica;
  INSERT INTO expenses (id, tenant_id, category, amount, note, date, exclude_from_pl) VALUES
    ('AITEST-E-A1', v_a, 'AITEST cat A', 3333333.33, 'AITEST note A', v_day::text, false),
    ('AITEST-E-A2', v_a, 'AITEST cat A', 1.11, 'AITEST small A', v_day::text, false),
    ('AITEST-E-A3', v_a, 'AITEST drawings A', 7777777.77, 'AITEST drawing A', v_day::text, true),
    ('AITEST-E-A4', v_a, 'AITEST cat A', 5555555.55, 'AITEST deleted A', v_day::text, false),
    ('AITEST-E-B1', current_setting('ai_test.b')::uuid, 'AITEST cat B', 4444444.44, 'AITEST note B', v_day::text, false);
  UPDATE expenses SET deleted_at = now() WHERE id = 'AITEST-E-A4';
  v_has_payroll := EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'payroll_id');
  IF v_has_payroll THEN
    INSERT INTO expenses (id, tenant_id, category, amount, note, date, payroll_id)
    VALUES ('AITEST-E-A5', v_a, 'AITEST salary A', 2.22, 'Salary AITEST staff name A', v_day::text, 'AITEST-PR-A');
  END IF;
  SET LOCAL session_replication_role = origin;

  PERFORM pg_temp.act_as(v_ua);
  v := public.ai_expense_summary(v_day, v_day, 100);
  SELECT expenses INTO v_pl FROM public.get_pl_ranged(v_a, v_day, v_day);
  PERFORM pg_temp.back();
  s := v::text;
  IF (v ->> 'total')::numeric <> v_pl THEN
    RAISE EXCEPTION 'EXPENSES: total % does not tie to get_pl_ranged expenses %', v ->> 'total', v_pl;
  END IF;
  v_pl := 3333334.44 + (CASE WHEN v_has_payroll THEN 2.22 ELSE 0 END);
  IF (v ->> 'total')::numeric - (v0 ->> 'total')::numeric <> v_pl THEN
    RAISE EXCEPTION 'EXPENSES: sentinels not counted exactly (% -> %)', v0 ->> 'total', v ->> 'total';
  END IF;
  IF (v ->> 'drawings_total')::numeric - (v0 ->> 'drawings_total')::numeric <> 7777777.77 THEN
    RAISE EXCEPTION 'EXPENSES: drawings not returned apart';
  END IF;
  IF s ~ 'AITEST deleted A' OR s ~ '5555555' THEN RAISE EXCEPTION 'EXPENSES: a deleted expense was read'; END IF;
  IF s ~ 'AITEST drawing A' THEN RAISE EXCEPTION 'EXPENSES: a drawing is in the list'; END IF;
  IF s ~ 'AITEST (cat|note) B' OR s ~ '4444444' THEN RAISE EXCEPTION 'EXPENSES: owner A can see shop B'; END IF;
  IF s ~ 'AITEST staff name' THEN RAISE EXCEPTION 'EXPENSES: a payroll entry''s note was returned'; END IF;
  IF v_has_payroll AND NOT (v -> 'entries') @> '[{"category": "AITEST salary A", "from_payroll": true}]' THEN
    RAISE EXCEPTION 'EXPENSES: the payroll entry is not marked';
  END IF;
  IF v -> 'entries' -> 0 ->> 'description' <> 'AITEST note A' THEN RAISE EXCEPTION 'EXPENSES: the biggest entry is not first'; END IF;

  -- A capped list keeps every total.
  PERFORM pg_temp.act_as(v_ua);
  v0 := public.ai_expense_summary(v_day, v_day, 1);
  PERFORM pg_temp.back();
  IF jsonb_array_length(v0 -> 'entries') <> 1 OR v0 ->> 'total' <> v ->> 'total' OR v0 ->> 'entry_count' <> v ->> 'entry_count' THEN
    RAISE EXCEPTION 'EXPENSES: a capped list changed a total, or was not capped';
  END IF;

  -- The other shop sees none of A's.
  PERFORM pg_temp.act_as(v_ub);
  s := public.ai_expense_summary(v_day, v_day, 100)::text;
  PERFORM pg_temp.back();
  IF s ~ 'AITEST (cat|note|drawing) A' OR s ~ '3333333' THEN RAISE EXCEPTION 'EXPENSES: owner B can see shop A'; END IF;

  -- Staff are refused.
  UPDATE users SET roles = ARRAY['STAFF'] WHERE id = v_ua;
  PERFORM pg_temp.act_as(v_ua);
  BEGIN
    PERFORM public.ai_expense_summary(v_day, v_day, 10);
    PERFORM pg_temp.back();
    RAISE EXCEPTION 'STAFF_NOT_REFUSED ai_expense_summary';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.back();
  UPDATE users SET roles = ARRAY['OWNER'] WHERE id = v_ua;
  INSERT INTO _ai_results (check_name) VALUES ('expenses');
END $t$;

-- ── 9. dues and cash (ask-dues-cash) ───────────────────────────────────────
-- Its own shape check, fixtures and reads, so it rebases cleanly past the
-- other question batches. Shop A gets an unpaid bill from 75 days ago and two
-- ledger rows today (a cash sale receipt and a manual entry); the sentinels
-- above add today's unpaid credit sale and a cash client payment.
DO $t$
DECLARE
  k_fns text[] := ARRAY['ai_dues_over_60','ai_credit_sales','ai_cash_today','ai_payment_mix'];
  r record; n int;
  v_ua text := current_setting('ai_test.ua'); v_ub text := current_setting('ai_test.ub');
  v_day date := current_setting('ai_test.day')::date;
  v jsonb; s text; k text;
BEGIN
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY(k_fns);
  IF n <> 4 THEN RAISE EXCEPTION 'DUES_CASH SHAPE: expected 4 functions with one signature each, found %', n; END IF;
  FOR r IN SELECT p.oid, p.proname, p.provolatile, p.prosecdef, p.prosrc, pg_get_function_identity_arguments(p.oid) AS args
             FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(k_fns) LOOP
    IF r.provolatile <> 's' OR r.prosecdef OR r.args ~* 'tenant' THEN RAISE EXCEPTION 'DUES_CASH SHAPE: % is not STABLE INVOKER without a tenant argument', r.proname; END IF;
    IF r.prosrc ~* '\m(insert\s+into|update\s+public|delete\s+from|truncate)\M' THEN RAISE EXCEPTION 'DUES_CASH SHAPE: % contains DML', r.proname; END IF;
    IF r.prosrc !~ 'ai_owner_tenant\(\)' THEN RAISE EXCEPTION 'DUES_CASH SHAPE: % does not resolve the owner', r.proname; END IF;
    IF r.prosrc ~* '\m(phone|contact|gstin|gst_no|pan_number|aadhaar|account_no|ifsc|upi_id|billing_address)\M' THEN
      RAISE EXCEPTION 'DUES_CASH SHAPE: % names a private column', r.proname;
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'DUES_CASH SHAPE: wrong grants on %', r.proname;
    END IF;
  END LOOP;

  SET LOCAL session_replication_role = replica;
  FOR r IN SELECT * FROM (VALUES (current_setting('ai_test.a')::uuid, 'A', 1111111.11::numeric, 1000.01::numeric),
                                 (current_setting('ai_test.b')::uuid, 'B', 2222222.22::numeric, 2000.02::numeric)) x(t, tag, amt, rcpt) LOOP
    INSERT INTO sales (id, tenant_id, "shopId", "totalAmount", "paidAmount", date, status, "paymentStatus", "paymentMethod")
    VALUES ('AITEST-OLD-' || r.tag, r.t, 'AITEST-C-' || r.tag, r.amt, 0, (v_day - 75)::text, 'COMPLETED', 'UNPAID', 'CREDIT');
    INSERT INTO account_transactions (id, tenant_id, account_id, date, direction, amount, mode, ref_type)
    VALUES ('AITEST-AT-' || r.tag, r.t, 'AITEST-AC-' || r.tag, v_day, 'IN', r.rcpt, 'CASH', 'SALE'),
           ('AITEST-AT2-' || r.tag, r.t, 'AITEST-AC-' || r.tag, v_day, 'OUT', 7, NULL, 'MANUAL'),
           ('AITEST-AT3-' || r.tag, r.t, 'AITEST-AC-' || r.tag, v_day, 'OUT', r.amt, 'CASH', 'TRANSFER');
  END LOOP;
  SET LOCAL session_replication_role = origin;

  PERFORM pg_temp.act_as(v_ua);
  v := jsonb_build_object('over', public.ai_dues_over_60(100), 'credit', public.ai_credit_sales(v_day, v_day),
                          'cash', public.ai_cash_today(), 'mix', public.ai_payment_mix(v_day, v_day));
  PERFORM pg_temp.back();
  s := v::text;
  IF s ~ '2222222|2000\.02' OR s ~ 'AITEST (client|account) B' THEN RAISE EXCEPTION 'DUES_CASH ISOLATION: owner A sees shop B: %', left(s, 400); END IF;
  IF position('AITEST client A' IN s) = 0 OR position('AITEST account A' IN s) = 0 THEN RAISE EXCEPTION 'DUES_CASH: sentinel names missing'; END IF;
  IF (v #>> '{over,total_over}')::numeric < 1111111.11 OR (v #>> '{over,oldest_days}')::int < 75 THEN RAISE EXCEPTION 'DUES_CASH: old unpaid bill not over 60 days'; END IF;
  IF (v #>> '{over,total_over}')::numeric <> (v #>> '{over,aged_61_90}')::numeric + (v #>> '{over,aged_91_120}')::numeric + (v #>> '{over,aged_over_120}')::numeric THEN
    RAISE EXCEPTION 'DUES_CASH: buckets do not add up to the total';
  END IF;
  IF (v #>> '{credit,credit_billed}')::numeric < 1111111.11 OR (v #>> '{credit,credit_open}')::numeric < 1111111.11 THEN RAISE EXCEPTION 'DUES_CASH: sentinel credit sale not counted'; END IF;
  IF (v #>> '{cash,money_in}')::numeric < 1000.01 OR (v #>> '{cash,money_out}')::numeric < 7 THEN RAISE EXCEPTION 'DUES_CASH: ledger rows not counted'; END IF;
  IF (v #>> '{cash,money_out}')::numeric >= 1111111.11 THEN RAISE EXCEPTION 'DUES_CASH: a transfer was counted'; END IF;
  IF NOT (v -> 'cash' -> 'unlisted') @> '[{"type": "MANUAL", "direction": "OUT"}]' THEN RAISE EXCEPTION 'DUES_CASH: manual entry not named as unlisted'; END IF;
  IF (v #>> '{cash,daybook_in}')::numeric < 1111111.11 + 1000.01 THEN RAISE EXCEPTION 'DUES_CASH: Day Book total misses the sale receipt or the collection'; END IF;
  IF NOT (v -> 'mix' -> 'by_method') @> '[{"method": "CREDIT"}]' THEN RAISE EXCEPTION 'DUES_CASH: payment mix misses credit'; END IF;
  INSERT INTO _ai_results (check_name) VALUES ('dues_cash_isolation');

  -- Global admin: the explicit tenant filter keeps it to the admin's own shop.
  UPDATE users SET roles = array_append(roles, 'GLOBAL_ADMIN') WHERE id = v_ua;
  PERFORM pg_temp.act_as(v_ua);
  s := jsonb_build_object('over', public.ai_dues_over_60(100), 'credit', public.ai_credit_sales(v_day, v_day),
                          'cash', public.ai_cash_today(), 'mix', public.ai_payment_mix(v_day, v_day))::text;
  PERFORM pg_temp.back();
  UPDATE users SET roles = array_remove(roles, 'GLOBAL_ADMIN') WHERE id = v_ua;
  IF s ~ '2222222|2000\.02' THEN RAISE EXCEPTION 'DUES_CASH ADMIN: a global admin''s figures include another shop'; END IF;

  -- Staff are refused by every one.
  UPDATE users SET roles = ARRAY['STAFF'] WHERE id = v_ua;
  PERFORM pg_temp.act_as(v_ua);
  FOREACH k IN ARRAY ARRAY['ai_dues_over_60()', format('ai_credit_sales(%L, %L)', v_day, v_day), 'ai_cash_today()',
                           format('ai_payment_mix(%L, %L)', v_day, v_day)] LOOP
    BEGIN
      EXECUTE 'SELECT public.' || k;
      PERFORM pg_temp.back();
      RAISE EXCEPTION 'STAFF_NOT_REFUSED %', k;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM pg_temp.act_as(v_ua);
  END LOOP;
  PERFORM pg_temp.back();
  UPDATE users SET roles = ARRAY['OWNER'] WHERE id = v_ua;
  INSERT INTO _ai_results (check_name) VALUES ('dues_cash_staff_refused');
END $t$;

-- ── 7. read-only ───────────────────────────────────────────────────────────
-- A function that wrote would fail here. Last, because it cannot be undone
-- inside the transaction.
SET LOCAL transaction_read_only = on;
DO $t$
BEGIN
  PERFORM pg_temp.act_as(current_setting('ai_test.ub'));
  PERFORM pg_temp.all_reads(current_setting('ai_test.day')::date);
  PERFORM pg_temp.back();
END $t$;
DO $t$
BEGIN
  PERFORM pg_temp.act_as(current_setting('ai_test.ub'));
  PERFORM public.ai_expense_summary(current_setting('ai_test.day')::date, current_setting('ai_test.day')::date, 10);
  PERFORM pg_temp.back();
END $t$;
DO $t$
DECLARE v_day date := current_setting('ai_test.day')::date;
BEGIN
  PERFORM pg_temp.act_as(current_setting('ai_test.ua'));
  PERFORM public.ai_dues_over_60(), public.ai_credit_sales(v_day, v_day), public.ai_cash_today(), public.ai_payment_mix(v_day, v_day);
  PERFORM pg_temp.back();
END $t$;

SELECT string_agg(check_name, ', ' ORDER BY n) AS passed FROM _ai_results;

ROLLBACK;
