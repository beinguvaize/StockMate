-- ==============================================================
-- Staff advance READS test (20261129_staff_advance_reads.sql)
-- ==============================================================
-- What the phone advance screens read, and the behaviour they describe:
--   staff_advance_status   taken_back, runs_to_clear, editable, cancellable
--   staff_advance_history  GIVEN / RECOVERY (+ run dates) / COLLECTION /
--                          WRITE_OFF / CANCELLED, cancelled advances included;
--                          filtered by payroll_id = a saved line's split
--   staff_advance_balances one read for the whole shop under RLS
-- and, on the money side:
--   partial collect leaves the rest owing; cancel puts the money back on the
--   account it was paid from; recover_all clears every open advance oldest
--   first, capped at net; recovery_per_run = 0 takes nothing automatically.
--
-- Fresh random ids every run; leaves NOTHING behind. In psql the file is
-- BEGIN ... ROLLBACK. Over the Supabase MCP (execute_sql), drop the
-- BEGIN/ROLLBACK lines and run
--   SELECT set_config('staff_test.mcp', 'on', false);
-- first: the block then ends by RAISING its pass list, which rolls it all back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.bal(p_t uuid, p_acc text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0)
    FROM public.account_transactions WHERE tenant_id = p_t AND account_id = p_acc $$;
CREATE OR REPLACE FUNCTION pg_temp.owed(p_t uuid, p_e text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce((SELECT outstanding FROM public.staff_advance_balances WHERE tenant_id = p_t AND employee_id = p_e), 0) $$;
CREATE OR REPLACE FUNCTION pg_temp.item(p_run text, p_e text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT i FROM public.payroll p, jsonb_array_elements(p.items) i WHERE p.id = p_run AND i ->> 'employeeId' = p_e $$;
CREATE OR REPLACE FUNCTION pg_temp.line(p_e text, p_name text, p_net numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('employeeId', p_e, 'employeeName', p_name, 'payType', 'MONTHLY',
                            'basePay', p_net, 'netPay', p_net, 'overtime', 0, 'commission', 0, 'bonus', 0, 'deductions', 0) $$;
-- A saved run's split for one person, as the phone reads it.
CREATE OR REPLACE FUNCTION pg_temp.split(p_t uuid, p_run text, p_e text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(advance_id || '=' || trim_scale(amount), ',' ORDER BY advance_given_on, advance_id), '')
    FROM public.staff_advance_history
   WHERE tenant_id = p_t AND payroll_id = p_run AND employee_id = p_e AND event = 'RECOVERY' $$;
CREATE OR REPLACE FUNCTION pg_temp.hist(p_a text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(event || ':' || trim_scale(amount) || coalesce('@' || run_from || '..' || run_to, ''), ',' ORDER BY on_date, recorded_at, event_id), '')
    FROM public.staff_advance_history WHERE advance_id = p_a $$;
CREATE OR REPLACE FUNCTION pg_temp.st(p_a text) RETURNS text LANGUAGE sql AS $$
  SELECT trim_scale(taken_back) || '/' || coalesce(runs_to_clear::text, 'null') || '/' || editable || '/' || cancellable || '/' || status
    FROM public.staff_advance_status WHERE advance_id = p_a $$;

DO $test$
DECLARE
  x     text := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  t     uuid := gen_random_uuid();
  t2    uuid := gen_random_uuid();
  u     text := gen_random_uuid()::text;
  u2    text := gen_random_uuid()::text;
  cash  text; bank text;
  e1 text; e2 text; e3 text;
  a1 text; a2 text; a3 text; a4 text; a5 text;
  r   jsonb;
  b0  numeric; c0 numeric;
  n   int;
  s   text;
  ok  text[] := '{}';
  fail text;
  claims_owner text;
BEGIN
  cash := 'ACC-C-' || x; bank := 'ACC-B-' || x;
  e1 := 'EMP1-' || x; e2 := 'EMP2-' || x; e3 := 'EMP3-' || x;
  -- ids chosen so id order is NOT given_on order: oldest first must come from the date
  a1 := 'ADVZ1-' || x; a2 := 'ADVB2-' || x; a3 := 'ADVA3-' || x; a4 := 'ADV4-' || x; a5 := 'ADV5-' || x;
  claims_owner := json_build_object('sub', u, 'role', 'authenticated')::text;

  INSERT INTO public.tenants (id, name, slug, plan, status) VALUES (t,  'Advance reads ' || x, 'adv-reads-' || x, 'PRO', 'ACTIVE');
  INSERT INTO public.tenants (id, name, slug, plan, status) VALUES (t2, 'Advance reads other ' || x, 'adv-reads-o-' || x, 'PRO', 'ACTIVE');
  INSERT INTO public.users (id, name, email, roles, tenant_id) VALUES
    (u,  'Owner',  'rowner-'  || x || '@example.test', ARRAY['OWNER'], t),
    (u2, 'Other owner', 'rowner2-' || x || '@example.test', ARRAY['OWNER'], t2);
  INSERT INTO public.accounts (id, tenant_id, name, type, is_default) VALUES
    (cash, t, 'Cash', 'CASH', true), (bank, t, 'Bank', 'BANK', false);
  INSERT INTO public.employees (id, tenant_id, name, pay_type, salary, status) VALUES
    (e1, t, 'Asha',  'MONTHLY', 20000, 'ACTIVE'),
    (e2, t, 'Ravi',  'MONTHLY', 10000, 'ACTIVE'),
    (e3, t, 'Meena', 'MONTHLY', 15000, 'ACTIVE');
  PERFORM set_config('request.jwt.claims', claims_owner, true);

  BEGIN
    -- ── 1. status columns on fresh advances ────────────────────────────────
    PERFORM public.give_staff_advance(t, a1, e1, 3000, bank, '2026-10-01', 1000, 'first');
    PERFORM public.give_staff_advance(t, a2, e1, 2000, cash, '2026-10-10', 1500, NULL);
    PERFORM public.give_staff_advance(t, a3, e1, 1000, cash, '2026-10-15', 0,    'no auto');
    PERFORM public.give_staff_advance(t, a4, e2,  500, cash, '2026-10-05', 0,    NULL);
    IF pg_temp.st(a1) <> '0/3/true/true/OPEN' OR pg_temp.st(a2) <> '0/2/true/true/OPEN' OR pg_temp.st(a3) <> '0/null/true/true/OPEN' THEN
      RAISE EXCEPTION 'FAIL status fresh: % | % | %', pg_temp.st(a1), pg_temp.st(a2), pg_temp.st(a3);
    END IF;
    ok := ok || 'status: fresh advances taken_back 0, runs_to_clear ceil(3000/1000)=3, ceil(2000/1500)=2, NULL when per-run 0; editable + cancellable'::text;

    -- ── 2. balances: one read, whole shop ──────────────────────────────────
    SELECT string_agg(employee_id || '=' || trim_scale(outstanding) || '/' || trim_scale(due_per_run) || '/' || open_advances, ',' ORDER BY employee_id)
      INTO s FROM public.staff_advance_balances WHERE tenant_id = t;
    IF s <> format('%s=6000/2500/3,%s=500/0/1', e1, e2) THEN RAISE EXCEPTION 'FAIL balances: %', s; END IF;
    ok := ok || 'balances: one row per person with advances: outstanding, due_per_run (sum of per-run amounts capped at what is left; 0 for per-run 0), open count'::text;

    -- ── 3. run R1: oldest first, capped at net; per-run 0 takes nothing ────
    r := public.process_payroll_run(t, 'R1-' || x, '2026-10', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 2000), pg_temp.line(e2, 'Ravi', 5000)),
           NULL, '{"advance_aware": true}');
    IF pg_temp.split(t, 'R1-' || x, e1) <> format('%s=1000,%s=1000', a1, a2)
       OR (pg_temp.item('R1-' || x, e1) ->> 'advanceRecovered')::numeric <> 2000
       OR (pg_temp.item('R1-' || x, e1) ->> 'netPay')::numeric <> 0 THEN
      RAISE EXCEPTION 'FAIL R1 split: % / %', pg_temp.split(t, 'R1-' || x, e1), pg_temp.item('R1-' || x, e1);
    END IF;
    IF pg_temp.split(t, 'R1-' || x, e2) <> '' OR (pg_temp.item('R1-' || x, e2) ->> 'advanceRecovered')::numeric <> 0
       OR (pg_temp.item('R1-' || x, e2) ->> 'netPay')::numeric <> 5000 OR pg_temp.owed(t, e2) <> 500 THEN
      RAISE EXCEPTION 'FAIL per-run 0: Ravi lost money: %', pg_temp.item('R1-' || x, e2);
    END IF;
    ok := ok || 'saved line split from staff_advance_history (payroll_id + RECOVERY): 1000 + 1000, sums to advanceRecovered; per-run 0 took nothing from Ravi''s 5000'::text;

    IF pg_temp.st(a1) <> '1000/2/false/false/OPEN' OR pg_temp.st(a2) <> '1000/1/false/false/OPEN' OR pg_temp.st(a3) <> '0/null/true/true/OPEN' THEN
      RAISE EXCEPTION 'FAIL status after R1: % | % | %', pg_temp.st(a1), pg_temp.st(a2), pg_temp.st(a3);
    END IF;
    BEGIN
      PERFORM public.cancel_staff_advance(t, a1);
      RAISE EXCEPTION 'FAIL: cancellable=false but cancel succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Part of this advance has already been taken back%' THEN RAISE; END IF;
    END;
    ok := ok || 'status after a recovery: runs_to_clear drops, editable/cancellable false, and cancel really is refused'::text;

    -- ── 4. partial collect leaves the rest owing ───────────────────────────
    c0 := pg_temp.bal(t, cash);
    r := public.settle_staff_advance(t, 'C1-' || x, e2, 'COLLECT', 300, cash, '2026-11-02');
    IF pg_temp.owed(t, e2) <> 200 OR pg_temp.bal(t, cash) <> c0 + 300 OR pg_temp.st(a4) <> '300/null/false/false/OPEN' THEN
      RAISE EXCEPTION 'FAIL partial collect: owed %, cash %, %', pg_temp.owed(t, e2), pg_temp.bal(t, cash) - c0, pg_temp.st(a4);
    END IF;
    IF pg_temp.hist(a4) <> 'GIVEN:500,COLLECTION:300' THEN RAISE EXCEPTION 'FAIL collect history: %', pg_temp.hist(a4); END IF;
    ok := ok || 'partial collect 300 of 500: 200 still owing, advance OPEN, +300 on the cash account; history GIVEN, COLLECTION'::text;

    -- ── 5. cancel puts the money back on the account it came from ──────────
    b0 := pg_temp.bal(t, bank); c0 := pg_temp.bal(t, cash);
    PERFORM public.give_staff_advance(t, a5, e3, 700, bank, '2026-11-03', 100, NULL);
    IF pg_temp.bal(t, bank) <> b0 - 700 OR pg_temp.bal(t, cash) <> c0 THEN RAISE EXCEPTION 'FAIL give from bank'; END IF;
    PERFORM public.cancel_staff_advance(t, a5);
    IF pg_temp.bal(t, bank) <> b0 OR pg_temp.bal(t, cash) <> c0 OR pg_temp.owed(t, e3) <> 0
       OR EXISTS (SELECT 1 FROM public.staff_advance_status WHERE advance_id = a5) THEN
      RAISE EXCEPTION 'FAIL cancel: bank %, cash %', pg_temp.bal(t, bank) - b0, pg_temp.bal(t, cash) - c0;
    END IF;
    IF pg_temp.hist(a5) <> 'GIVEN:700,CANCELLED:700'
       OR (SELECT account_id FROM public.staff_advance_history WHERE advance_id = a5 AND event = 'CANCELLED') <> bank THEN
      RAISE EXCEPTION 'FAIL cancel history: %', pg_temp.hist(a5);
    END IF;
    ok := ok || 'cancel: the 700 goes back to the BANK account it was paid from (cash untouched); advance leaves staff_advance_status; history keeps GIVEN + CANCELLED (account = bank)'::text;

    -- ── 6. recover_all: every open advance, oldest first, capped at net ────
    -- owed: a1 2000 (01 Oct), a2 1000 (10 Oct), a3 1000 (15 Oct, per-run 0)
    r := public.process_payroll_run(t, 'R2-' || x, '2026-11-01/2026-11-15', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 2500)), NULL,
           jsonb_build_object('advance_aware', true, 'recover_all', jsonb_build_array(e1)));
    IF pg_temp.split(t, 'R2-' || x, e1) <> format('%s=2000,%s=500', a1, a2) OR (pg_temp.item('R2-' || x, e1) ->> 'netPay')::numeric <> 0 THEN
      RAISE EXCEPTION 'FAIL recover_all capped: %', pg_temp.split(t, 'R2-' || x, e1);
    END IF;
    r := public.process_payroll_run(t, 'R3-' || x, '2026-11-16/2026-11-30', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 10000)), NULL,
           jsonb_build_object('advance_aware', true, 'recover_all', jsonb_build_array(e1)));
    -- a2 (10 Oct) before a3 (15 Oct) although 'ADVA3' sorts before 'ADVB2' by id
    IF pg_temp.split(t, 'R3-' || x, e1) <> format('%s=500,%s=1000', a2, a3)
       OR pg_temp.owed(t, e1) <> 0 OR (pg_temp.item('R3-' || x, e1) ->> 'netPay')::numeric <> 8500 THEN
      RAISE EXCEPTION 'FAIL recover_all clears: %, owed %', pg_temp.split(t, 'R3-' || x, e1), pg_temp.owed(t, e1);
    END IF;
    IF pg_temp.st(a1) <> '3000/0/false/false/CLEARED' OR pg_temp.st(a3) <> '1000/0/false/false/CLEARED' THEN
      RAISE EXCEPTION 'FAIL cleared status: % | %', pg_temp.st(a1), pg_temp.st(a3);
    END IF;
    ok := ok || 'recover_all: net 2500 takes oldest 2000 then 500 (capped, net 0); next run takes the last 500 + 1000 (even the per-run-0 one); owes 0, CLEARED, runs_to_clear 0'::text;

    -- ── 7. history: ordered, with the run''s dates ──────────────────────────
    IF pg_temp.hist(a1) <> 'GIVEN:3000,RECOVERY:1000@2026-10-01..2026-10-31,RECOVERY:2000@2026-11-01..2026-11-15' THEN
      RAISE EXCEPTION 'FAIL history a1: %', pg_temp.hist(a1);
    END IF;
    IF pg_temp.hist(a2) <> 'GIVEN:2000,RECOVERY:1000@2026-10-01..2026-10-31,RECOVERY:500@2026-11-01..2026-11-15,RECOVERY:500@2026-11-16..2026-11-30' THEN
      RAISE EXCEPTION 'FAIL history a2: %', pg_temp.hist(a2);
    END IF;
    ok := ok || 'history: GIVEN then each RECOVERY with its run''s from/to (month and custom periods), in date order'::text;

    -- ── 8. a deleted run drops out of history and status ───────────────────
    PERFORM public.delete_payroll_run(t, 'R3-' || x);
    IF pg_temp.hist(a3) <> 'GIVEN:1000' OR pg_temp.split(t, 'R3-' || x, e1) <> '' OR pg_temp.owed(t, e1) <> 1500
       OR pg_temp.st(a3) <> '0/null/true/true/OPEN' THEN
      RAISE EXCEPTION 'FAIL deleted run: % / % / owed %', pg_temp.hist(a3), pg_temp.st(a3), pg_temp.owed(t, e1);
    END IF;
    ok := ok || 'deleting a run removes its recoveries from history and the split; the advance is owed, editable and cancellable again'::text;

    -- ── 9. write off shows in history ──────────────────────────────────────
    r := public.settle_staff_advance(t, 'W1-' || x, e2, 'WRITE_OFF', 200, NULL, '2026-11-20');
    IF pg_temp.hist(a4) <> 'GIVEN:500,COLLECTION:300,WRITE_OFF:200' OR pg_temp.st(a4) <> '500/0/false/false/SETTLED' THEN
      RAISE EXCEPTION 'FAIL write-off history: % / %', pg_temp.hist(a4), pg_temp.st(a4);
    END IF;
    ok := ok || 'write off the last 200: history GIVEN, COLLECTION, WRITE_OFF; SETTLED'::text;

    -- ── 10. RLS: own shop only, anon nothing ───────────────────────────────
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO n FROM public.staff_advance_history WHERE tenant_id = t;
    IF n < 10 THEN RAISE EXCEPTION 'FAIL rls: owner sees % history rows', n; END IF;
    SELECT count(*) INTO n FROM public.staff_advance_balances;
    IF n <> 2 THEN RAISE EXCEPTION 'FAIL rls: owner sees % balance rows (no tenant filter), expected 2', n; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    SELECT (SELECT count(*) FROM public.staff_advance_history) + (SELECT count(*) FROM public.staff_advance_status)
         + (SELECT count(*) FROM public.staff_advance_balances) INTO n;
    PERFORM set_config('request.jwt.claims', claims_owner, true);
    EXECUTE 'RESET ROLE';
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL rls: another shop sees % rows', n; END IF;
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN PERFORM 1 FROM public.staff_advance_history; fail := 'history';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM 1 FROM public.staff_advance_status; fail := coalesce(fail, 'status');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXECUTE 'RESET ROLE';
    IF fail IS NOT NULL THEN RAISE EXCEPTION 'FAIL anon could read %', fail; END IF;
    ok := ok || 'RLS: owner reads the whole shop''s balances in one unfiltered read (2 rows); another shop''s owner sees 0 rows in all three views; anon refused'::text;

  EXCEPTION WHEN OTHERS THEN
    fail := SQLERRM;
  END;

  IF current_setting('staff_test.mcp', true) = 'on' THEN
    RAISE EXCEPTION E'staff_advances_reads_test: % passed%\n%', cardinality(ok),
      CASE WHEN fail IS NULL THEN ', 0 failed' ELSE E'\nFAILED: ' || fail END, array_to_string(ok, E'\n');
  END IF;
  IF fail IS NOT NULL THEN RAISE EXCEPTION 'staff_advances_reads_test FAILED: % (after % passing checks)', fail, cardinality(ok); END IF;
  RAISE NOTICE E'staff_advances_reads_test: % passed\n%', cardinality(ok), array_to_string(ok, E'\n');
END $test$;

ROLLBACK;
