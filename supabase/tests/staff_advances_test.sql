-- ==============================================================
-- Staff advances regression test (20261127_staff_advances.sql)
-- ==============================================================
-- Builds a throwaway shop (fresh random ids every run: dev soft-deletes, so a
-- reused id would silently no-op), drives every advance function as that
-- shop's owner, and checks the money after each step:
--
--   cash  = IN - OUT over the shop's account_transactions
--   1300  = GL Staff Advances balance, which must ALWAYS equal the sum of
--           staff_advance_balances.outstanding
--
-- Leaves NOTHING behind. In psql the file is BEGIN ... ROLLBACK. Over the
-- Supabase MCP (execute_sql), drop the BEGIN/ROLLBACK lines and run
--   SELECT set_config('staff_test.mcp', 'on', false);
-- first: the block then ends by RAISING its pass list, which rolls it all back.
--
-- Not covered here (cannot be, in one transaction): two pay runs at the same
-- moment. See staff_advances_concurrency_test.sql.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.cash(p_t uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0)
    FROM public.account_transactions WHERE tenant_id = p_t $$;
CREATE OR REPLACE FUNCTION pg_temp.gl(p_t uuid, p_code text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(l.debit - l.credit), 0)
    FROM public.gl_lines l JOIN public.gl_accounts a ON a.id = l.account_id
   WHERE l.tenant_id = p_t AND a.code = p_code $$;
CREATE OR REPLACE FUNCTION pg_temp.owed(p_t uuid, p_e text) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce((SELECT outstanding FROM public.staff_advance_balances WHERE tenant_id = p_t AND employee_id = p_e), 0) $$;
CREATE OR REPLACE FUNCTION pg_temp.owed_all(p_t uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce(sum(outstanding), 0) FROM public.staff_advance_balances WHERE tenant_id = p_t $$;
CREATE OR REPLACE FUNCTION pg_temp.item(p_run text, p_e text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT i FROM public.payroll p, jsonb_array_elements(p.items) i WHERE p.id = p_run AND i ->> 'employeeId' = p_e $$;
CREATE OR REPLACE FUNCTION pg_temp.line(p_e text, p_name text, p_net numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('employeeId', p_e, 'employeeName', p_name, 'payType', 'MONTHLY',
                            'basePay', p_net, 'netPay', p_net, 'overtime', 0, 'commission', 0, 'bonus', 0, 'deductions', 0) $$;

-- The body process_payroll_run had before this migration (20261126), to prove
-- a shop with no advances gets exactly the same rows from the new one.
CREATE OR REPLACE FUNCTION pg_temp.old_ppr(p_tenant_id uuid, p_run_id text, p_period text, p_payment_method text, p_items jsonb, p_processed_at text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_existing  public.payroll%ROWTYPE;
  v_method    text := upper(coalesce(nullif(trim(p_payment_method), ''), 'CASH'));
  v_pay_date  text; v_item jsonb; v_net numeric; v_expenses integer := 0;
BEGIN
  IF p_period ~ '^\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}$' THEN
    v_pay_date := greatest(split_part(p_period, '/', 1), split_part(p_period, '/', 2));
  ELSE
    v_pay_date := to_char((to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date, 'YYYY-MM-DD');
  END IF;
  INSERT INTO public.payroll (id, tenant_id, period, items, total_base, total_net, total_overtime, total_commission, total_bonus, total_deductions, processed_at)
  SELECT p_run_id, p_tenant_id, p_period, p_items,
    coalesce(sum((i->>'basePay')::numeric), 0), coalesce(sum((i->>'netPay')::numeric), 0),
    coalesce(sum((i->>'overtime')::numeric), 0), coalesce(sum((i->>'commission')::numeric), 0),
    coalesce(sum((i->>'bonus')::numeric), 0), coalesce(sum((i->>'deductions')::numeric), 0), p_processed_at
  FROM jsonb_array_elements(p_items) AS i RETURNING * INTO v_existing;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_net := coalesce((v_item->>'netPay')::numeric, 0);
    CONTINUE WHEN v_net = 0;
    INSERT INTO public.expenses (id, tenant_id, category, amount, note, date, payment_method, payroll_id)
    VALUES ('PAY-' || p_run_id || '-' || (v_item->>'employeeId'), p_tenant_id, 'Salary', v_net,
            'Payroll ' || p_period || ' — ' || coalesce(v_item->>'employeeName', ''), v_pay_date, v_method, p_run_id);
    v_expenses := v_expenses + 1;
  END LOOP;
  RETURN jsonb_build_object('run', to_jsonb(v_existing), 'expenses', v_expenses, 'replayed', false);
END $$;

DO $test$
DECLARE
  x     text := substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  t     uuid := gen_random_uuid();
  t2    uuid := gen_random_uuid();
  u     text := gen_random_uuid()::text;
  us    text := gen_random_uuid()::text;   -- STAFF template: may not edit payroll
  uc    text := gen_random_uuid()::text;   -- custom role with payroll.edit
  cash  text; bank text;
  e1 text; e2 text; e3 text;
  a1 text; a2 text; a3 text; a4 text; a5 text; a6 text;
  r   jsonb;
  v   numeric;
  n   int;
  ok  text[] := '{}';
  fail text;
  c0 numeric; g0 numeric;
  claims_owner text;
BEGIN
  cash := 'ACC-C-' || x; bank := 'ACC-B-' || x;
  e1 := 'EMP1-' || x; e2 := 'EMP2-' || x; e3 := 'EMP3-' || x;
  a1 := 'ADV1-' || x; a2 := 'ADV2-' || x; a3 := 'ADV3-' || x; a4 := 'ADV4-' || x; a5 := 'ADV5-' || x; a6 := 'ADV6-' || x;
  claims_owner := json_build_object('sub', u, 'role', 'authenticated')::text;

  -- ── the shop ─────────────────────────────────────────────────────────────
  INSERT INTO public.tenants (id, name, slug, plan, status) VALUES (t,  'Advances test ' || x, 'adv-test-' || x, 'PRO', 'ACTIVE');
  INSERT INTO public.tenants (id, name, slug, plan, status) VALUES (t2, 'Advances test other ' || x, 'adv-test-o-' || x, 'PRO', 'ACTIVE');
  INSERT INTO public.users (id, name, email, roles, tenant_id) VALUES
    (u,  'Owner',  'owner-'  || x || '@example.test', ARRAY['OWNER'], t),
    (us, 'Staff',  'staff-'  || x || '@example.test', ARRAY['STAFF'], t),
    (uc, 'Payroll clerk', 'clerk-' || x || '@example.test', ARRAY['CUSTOM'], t);
  UPDATE public.users SET permissions = '{"payroll":{"view":true,"edit":true}}' WHERE id = uc;
  INSERT INTO public.accounts (id, tenant_id, name, type, is_default) VALUES
    (cash, t, 'Cash', 'CASH', true), (bank, t, 'Bank', 'BANK', false);
  INSERT INTO public.employees (id, tenant_id, name, pay_type, salary, status) VALUES
    (e1, t, 'Asha',  'MONTHLY', 20000, 'ACTIVE'),
    (e2, t, 'Ravi',  'DAILY',   0,     'ACTIVE'),
    (e3, t, 'Meena', 'MONTHLY', 15000, 'ACTIVE');
  PERFORM set_config('request.jwt.claims', claims_owner, true);

  BEGIN
    -- ── 1. the seed gives a new shop GL 1300 ───────────────────────────────
    IF public.gl_account_id(t, '1300') IS NULL THEN RAISE EXCEPTION 'FAIL seed: new shop has no GL 1300'; END IF;
    ok := ok || 'seed: a new shop gets GL 1300 Staff Advances'::text;

    -- ── 2. no advances: the new process_payroll_run writes what the old one did
    PERFORM pg_temp.old_ppr(t, 'RO-' || x, '2026-09', 'CASH', jsonb_build_array(pg_temp.line(e3, 'Meena', 15000)), '2026-09-30T10:00:00.000Z');
    r := public.process_payroll_run(t, 'RN-' || x, '2026-09', 'CASH', jsonb_build_array(pg_temp.line(e3, 'Meena', 15000)), '2026-09-30T10:00:00.000Z');
    IF (SELECT items::text || total_base || total_net || total_deductions FROM public.payroll WHERE id = 'RO-' || x)
       IS DISTINCT FROM (SELECT items::text || total_base || total_net || total_deductions FROM public.payroll WHERE id = 'RN-' || x) THEN
      RAISE EXCEPTION 'FAIL no-advance run: payroll row differs from the old function';
    END IF;
    IF (SELECT string_agg(category || trim_scale(amount) || date || payment_method || note, '|') FROM public.expenses WHERE payroll_id = 'RO-' || x)
       IS DISTINCT FROM (SELECT string_agg(category || trim_scale(amount) || date || payment_method || note, '|') FROM public.expenses WHERE payroll_id = 'RN-' || x) THEN
      RAISE EXCEPTION 'FAIL no-advance run: expenses differ from the old function';
    END IF;
    IF (SELECT string_agg(direction || amount || mode || account_id || date, '|') FROM public.account_transactions WHERE ref_id = 'PAY-RO-' || x || '-' || e3)
       IS DISTINCT FROM (SELECT string_agg(direction || amount || mode || account_id || date, '|') FROM public.account_transactions WHERE ref_id = 'PAY-RN-' || x || '-' || e3) THEN
      RAISE EXCEPTION 'FAIL no-advance run: cash rows differ from the old function';
    END IF;
    IF (SELECT string_agg(a.code || l.debit || '/' || l.credit, ',' ORDER BY a.code) FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id JOIN public.gl_accounts a ON a.id = l.account_id WHERE j.reference_id = 'PAY-RO-' || x || '-' || e3)
       IS DISTINCT FROM (SELECT string_agg(a.code || l.debit || '/' || l.credit, ',' ORDER BY a.code) FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id JOIN public.gl_accounts a ON a.id = l.account_id WHERE j.reference_id = 'PAY-RN-' || x || '-' || e3) THEN
      RAISE EXCEPTION 'FAIL no-advance run: GL differs from the old function';
    END IF;
    IF (pg_temp.item('RN-' || x, e3) ? 'advanceRecovered') OR (r ->> 'expenses')::int <> 1 THEN
      RAISE EXCEPTION 'FAIL no-advance run: old caller got new fields or extra expenses: %', r;
    END IF;
    ok := ok || 'no advances, old caller: payroll row, expense, cash row and GL identical to the old function'::text;

    -- ── 3. give, and replay the same id twice ──────────────────────────────
    c0 := pg_temp.cash(t);
    r := public.give_staff_advance(t, a1, e1, 6000, cash, '2026-10-05', 2000, 'Rent');
    IF (r ->> 'replayed')::boolean THEN RAISE EXCEPTION 'FAIL give: first call says replayed'; END IF;
    r := public.give_staff_advance(t, a1, e1, 6000, cash, '2026-10-05', 2000, 'Rent');
    IF NOT (r ->> 'replayed')::boolean THEN RAISE EXCEPTION 'FAIL give: replay not reported'; END IF;
    r := public.give_staff_advance(t, a1, e1, 9999, bank, '2026-10-06', 1, 'changed');
    IF NOT (r ->> 'replayed')::boolean OR (r ->> 'amount')::numeric <> 6000 THEN RAISE EXCEPTION 'FAIL give: a replay changed the advance: %', r; END IF;
    SELECT count(*) INTO n FROM public.staff_advances WHERE id = a1;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL give: % advances', n; END IF;
    SELECT count(*) INTO n FROM public.account_transactions WHERE tenant_id = t AND ref_type = 'STAFF_ADVANCE';
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL give: % OUT rows, expected 1', n; END IF;
    SELECT count(*) INTO n FROM public.gl_journals WHERE tenant_id = t AND reference_type = 'STAFF_ADVANCE';
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL give: % journals, expected 1', n; END IF;
    IF pg_temp.cash(t) <> c0 - 6000 OR pg_temp.gl(t, '1300') <> 6000 OR pg_temp.owed(t, e1) <> 6000 THEN
      RAISE EXCEPTION 'FAIL give: cash %, 1300 %, owed %', pg_temp.cash(t) - c0, pg_temp.gl(t, '1300'), pg_temp.owed(t, e1);
    END IF;
    IF EXISTS (SELECT 1 FROM public.expenses WHERE tenant_id = t AND payroll_id IS NULL) THEN
      RAISE EXCEPTION 'FAIL give: an expense row was written';
    END IF;
    ok := ok || 'give + same id twice more: one advance, one OUT row, one journal, no expense; cash -6000, 1300 +6000'::text;

    PERFORM public.give_staff_advance(t, a2, e1, 3000, bank, '2026-10-20', 2000, NULL);
    PERFORM public.give_staff_advance(t, a3, e2, 1000, cash, '2026-10-10', 5000, NULL);
    IF pg_temp.gl(t, '1300') <> pg_temp.owed_all(t) OR pg_temp.owed_all(t) <> 10000 THEN
      RAISE EXCEPTION 'FAIL give: 1300 % vs owed %', pg_temp.gl(t, '1300'), pg_temp.owed_all(t);
    END IF;

    -- ── 4. an old app is refused when a recovery is due ────────────────────
    BEGIN
      PERFORM public.process_payroll_run(t, 'R0-' || x, '2026-10', 'CASH', jsonb_build_array(pg_temp.line(e1, 'Asha', 20000)));
      RAISE EXCEPTION 'FAIL old app: a run with a recovery due was NOT refused';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'APP_UPDATE_REQUIRED:%' THEN RAISE; END IF;
    END;
    IF EXISTS (SELECT 1 FROM public.payroll WHERE id = 'R0-' || x) OR EXISTS (SELECT 1 FROM public.expenses WHERE payroll_id = 'R0-' || x) THEN
      RAISE EXCEPTION 'FAIL old app: the refused run saved something';
    END IF;
    ok := ok || 'old app (no advance_aware) refused with APP_UPDATE_REQUIRED when a recovery is due; nothing saved'::text;

    -- ── 5. run R1: capped at net, oldest first ─────────────────────────────
    c0 := pg_temp.cash(t);
    r := public.process_payroll_run(t, 'R1-' || x, '2026-10', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 20000), pg_temp.line(e2, 'Ravi', 600)),
           NULL, '{"advance_aware": true}');
    IF (r ->> 'advance_recovered')::numeric <> 4600 OR (r ->> 'expenses')::int <> 3 THEN
      RAISE EXCEPTION 'FAIL R1: %', r;
    END IF;
    IF (pg_temp.item('R1-' || x, e1) ->> 'netPay')::numeric <> 16000
       OR (pg_temp.item('R1-' || x, e1) ->> 'earnedNet')::numeric <> 20000
       OR (pg_temp.item('R1-' || x, e1) ->> 'advanceRecovered')::numeric <> 4000
       OR (pg_temp.item('R1-' || x, e2) ->> 'netPay')::numeric <> 0
       OR (pg_temp.item('R1-' || x, e2) ->> 'advanceRecovered')::numeric <> 600 THEN
      RAISE EXCEPTION 'FAIL R1 lines: % / %', pg_temp.item('R1-' || x, e1), pg_temp.item('R1-' || x, e2);
    END IF;
    IF (SELECT total_net FROM public.payroll WHERE id = 'R1-' || x) <> 16000 THEN RAISE EXCEPTION 'FAIL R1: total_net'; END IF;
    IF (SELECT string_agg(id || '=' || trim_scale(amount) || '/' || payment_method, ',' ORDER BY id) FROM public.expenses WHERE payroll_id = 'R1-' || x)
       <> format('PAY-R1-%s-%s=16000/CASH,PAYADV-R1-%s-%s=4000/ADVANCE,PAYADV-R1-%s-%s=600/ADVANCE', x, e1, x, e1, x, e2) THEN
      RAISE EXCEPTION 'FAIL R1 expenses: %', (SELECT string_agg(id || '=' || trim_scale(amount) || '/' || payment_method, ',' ORDER BY id) FROM public.expenses WHERE payroll_id = 'R1-' || x);
    END IF;
    IF pg_temp.cash(t) <> c0 - 16000 THEN RAISE EXCEPTION 'FAIL R1: cash moved %, expected -16000 (net only)', pg_temp.cash(t) - c0; END IF;
    IF pg_temp.owed(t, e1) <> 5000 OR pg_temp.owed(t, e2) <> 400 OR pg_temp.gl(t, '1300') <> 5400 THEN
      RAISE EXCEPTION 'FAIL R1: owed % / %, 1300 %', pg_temp.owed(t, e1), pg_temp.owed(t, e2), pg_temp.gl(t, '1300');
    END IF;
    IF (SELECT expenses FROM public.get_pl_ranged(t, '2026-10-01', '2026-10-31')) <> 20600 THEN
      RAISE EXCEPTION 'FAIL R1: P&L salary is not gross: %', (SELECT expenses FROM public.get_pl_ranged(t, '2026-10-01', '2026-10-31'));
    END IF;
    IF (SELECT string_agg(advance_id || '=' || trim_scale(amount), ',' ORDER BY advance_id) FROM public.staff_advance_entries WHERE payroll_id = 'R1-' || x)
       <> format('%s=2000,%s=2000,%s=600', a1, a2, a3) THEN
      RAISE EXCEPTION 'FAIL R1 entries';
    END IF;
    ok := ok || 'R1: 2000+2000 from two advances, 600 capped at net (net pay 0, not below); cash -16000 net only; 1300 = owed = 5400; P&L salary gross 20600'::text;

    r := public.process_payroll_run(t, 'R1-' || x, '2026-10', 'CASH', jsonb_build_array(pg_temp.line(e1, 'Asha', 99999)), NULL, '{"advance_aware": true}');
    IF NOT (r ->> 'replayed')::boolean OR (SELECT count(*) FROM public.expenses WHERE payroll_id = 'R1-' || x) <> 3 THEN
      RAISE EXCEPTION 'FAIL R1 replay';
    END IF;
    ok := ok || 'R1 replayed: nothing new'::text;

    -- ── 6. skip one person ─────────────────────────────────────────────────
    c0 := pg_temp.cash(t); g0 := pg_temp.gl(t, '1300');
    r := public.process_payroll_run(t, 'R2-' || x, '2026-11-01/2026-11-15', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 10000), pg_temp.line(e2, 'Ravi', 1000)),
           NULL, jsonb_build_object('advance_aware', true, 'skip_advance', jsonb_build_array(e1)));
    IF (pg_temp.item('R2-' || x, e1) ->> 'advanceRecovered')::numeric <> 0 OR (pg_temp.item('R2-' || x, e1) ->> 'netPay')::numeric <> 10000
       OR (pg_temp.item('R2-' || x, e2) ->> 'advanceRecovered')::numeric <> 400 THEN
      RAISE EXCEPTION 'FAIL R2 skip';
    END IF;
    IF (SELECT status FROM public.staff_advances WHERE id = a3) <> 'CLEARED' THEN RAISE EXCEPTION 'FAIL R2: A3 not CLEARED'; END IF;
    ok := ok || 'R2: skip_advance leaves Asha''s pay whole; Ravi''s last 400 taken, advance CLEARED'::text;

    -- ── 7. delete R2 with the new function, twice ──────────────────────────
    r := public.delete_payroll_run(t, 'R2-' || x);
    IF pg_temp.cash(t) <> c0 OR pg_temp.gl(t, '1300') <> g0 OR pg_temp.owed(t, e2) <> 400
       OR (SELECT status FROM public.staff_advances WHERE id = a3) <> 'OPEN'
       OR EXISTS (SELECT 1 FROM public.expenses WHERE payroll_id = 'R2-' || x AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'FAIL delete_payroll_run: cash %, 1300 %, owed %', pg_temp.cash(t) - c0, pg_temp.gl(t, '1300') - g0, pg_temp.owed(t, e2);
    END IF;
    r := public.delete_payroll_run(t, 'R2-' || x);
    IF NOT (r ->> 'already_deleted')::boolean OR (r ->> 'expenses_reversed')::int <> 0 OR pg_temp.cash(t) <> c0 THEN
      RAISE EXCEPTION 'FAIL delete_payroll_run twice: %', r;
    END IF;
    ok := ok || 'delete_payroll_run: cash, 1300 and what Ravi owes all return; advance reopened; second call changes nothing'::text;

    -- ── 8. run again after the delete: recovers again ──────────────────────
    r := public.process_payroll_run(t, 'R2b-' || x, '2026-11-01/2026-11-15', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 10000), pg_temp.line(e2, 'Ravi', 1000)),
           NULL, '{"advance_aware": true}');
    -- A1 has 4000 left (takes 2000), A2 has 1000 left (takes 1000)
    IF (pg_temp.item('R2b-' || x, e1) ->> 'advanceRecovered')::numeric <> 3000 OR (pg_temp.item('R2b-' || x, e2) ->> 'advanceRecovered')::numeric <> 400 THEN
      RAISE EXCEPTION 'FAIL R2b: % / %', pg_temp.item('R2b-' || x, e1), pg_temp.item('R2b-' || x, e2);
    END IF;
    IF pg_temp.gl(t, '1300') <> pg_temp.owed_all(t) OR pg_temp.owed_all(t) <> 2000 THEN RAISE EXCEPTION 'FAIL R2b: 1300 vs owed'; END IF;
    ok := ok || 'run again after delete: recovers again (3000 + 400; per-advance amount capped by what is left)'::text;

    -- ── 9. delete R2b the OLD way: expenses, then the run ──────────────────
    UPDATE public.expenses SET deleted_at = now() WHERE tenant_id = t AND payroll_id = 'R2b-' || x AND deleted_at IS NULL;
    UPDATE public.payroll SET deleted_at = now() WHERE id = 'R2b-' || x;
    IF pg_temp.cash(t) <> c0 OR pg_temp.gl(t, '1300') <> g0 OR pg_temp.owed(t, e1) <> 5000 OR pg_temp.owed(t, e2) <> 400 THEN
      RAISE EXCEPTION 'FAIL old delete: cash %, 1300 %, owed % / %', pg_temp.cash(t) - c0, pg_temp.gl(t, '1300') - g0, pg_temp.owed(t, e1), pg_temp.owed(t, e2);
    END IF;
    IF (SELECT status FROM public.staff_advance_status WHERE advance_id = a2) <> 'OPEN' THEN RAISE EXCEPTION 'FAIL old delete: A2 not OPEN in the view'; END IF;
    ok := ok || 'old two-step delete (expenses, then run): cash, 1300 and both balances return; the view reopens the advance'::text;

    -- ── 10. oldest first, capped at net ────────────────────────────────────
    r := public.process_payroll_run(t, 'R3-' || x, '2026-11-16/2026-11-30', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 2500)), NULL, '{"advance_aware": true}');
    IF (SELECT string_agg(advance_id || '=' || trim_scale(amount), ',' ORDER BY advance_id) FROM public.staff_advance_entries WHERE payroll_id = 'R3-' || x)
       <> format('%s=2000,%s=500', a1, a2) OR (pg_temp.item('R3-' || x, e1) ->> 'netPay')::numeric <> 0 THEN
      RAISE EXCEPTION 'FAIL R3 oldest first';
    END IF;
    IF pg_temp.gl(t, '1300') <> pg_temp.owed_all(t) THEN RAISE EXCEPTION 'FAIL R3: 1300 vs owed'; END IF;
    ok := ok || 'R3 net 2500: oldest advance takes its 2000, the next only the 500 left of pay; net pay 0'::text;

    -- ── 11. a failure mid-run saves nothing ────────────────────────────────
    c0 := pg_temp.cash(t); g0 := pg_temp.gl(t, '1300');
    BEGIN
      PERFORM public.process_payroll_run(t, 'R4-' || x, '2026-12', 'CASH',
           jsonb_build_array(pg_temp.line(e1, 'Asha', 3000),
                             jsonb_build_object('employeeId', '', 'employeeName', 'Ghost', 'netPay', 100)),
           NULL, '{"advance_aware": true}');
      RAISE EXCEPTION 'FAIL mid-run: the bad line was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'A pay line has no employee.' THEN RAISE; END IF;
    END;
    IF EXISTS (SELECT 1 FROM public.payroll WHERE id = 'R4-' || x) OR EXISTS (SELECT 1 FROM public.expenses WHERE payroll_id = 'R4-' || x)
       OR EXISTS (SELECT 1 FROM public.staff_advance_entries WHERE payroll_id = 'R4-' || x)
       OR pg_temp.cash(t) <> c0 OR pg_temp.gl(t, '1300') <> g0 THEN
      RAISE EXCEPTION 'FAIL mid-run: something was saved';
    END IF;
    ok := ok || 'failure after the first person''s expenses were written: no run, expense, recovery, cash or GL left'::text;

    -- ── 12. recover_all ────────────────────────────────────────────────────
    r := public.process_payroll_run(t, 'R5-' || x, '2026-12-01/2026-12-15', 'CASH',
           jsonb_build_array(pg_temp.line(e2, 'Ravi', 1000)), NULL,
           jsonb_build_object('advance_aware', true, 'recover_all', jsonb_build_array(e2)));
    IF (pg_temp.item('R5-' || x, e2) ->> 'advanceRecovered')::numeric <> 400 OR pg_temp.owed(t, e2) <> 0 THEN RAISE EXCEPTION 'FAIL recover_all'; END IF;
    ok := ok || 'recover_all takes everything owed (up to net)'::text;

    -- ── 13. employee leaves owing 2500: collect half, write off the rest ───
    IF pg_temp.owed(t, e1) <> 2500 THEN RAISE EXCEPTION 'FAIL leave: setup owes %', pg_temp.owed(t, e1); END IF;
    c0 := pg_temp.cash(t);
    r := public.settle_staff_advance(t, 'O1-' || x, e1, 'COLLECT', 1250, cash, '2026-12-20');
    r := public.settle_staff_advance(t, 'O1-' || x, e1, 'COLLECT', 1250, cash, '2026-12-20');
    IF NOT (r ->> 'replayed')::boolean OR pg_temp.cash(t) <> c0 + 1250 OR pg_temp.owed(t, e1) <> 1250 THEN
      RAISE EXCEPTION 'FAIL collect: %, cash %', r, pg_temp.cash(t) - c0;
    END IF;
    BEGIN
      PERFORM public.settle_staff_advance(t, 'O2-' || x, e1, 'WRITE_OFF', 1300, NULL, '2026-12-20');
      RAISE EXCEPTION 'FAIL write-off: more than owed was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'That is more than is owed%' THEN RAISE; END IF;
    END;
    v := pg_temp.gl(t, '5200');
    -- same op id again: the refused attempt must not have kept its claim
    r := public.settle_staff_advance(t, 'O2-' || x, e1, 'WRITE_OFF', 1250, NULL, '2026-12-20');
    r := public.settle_staff_advance(t, 'O2-' || x, e1, 'WRITE_OFF', 1250, NULL, '2026-12-20');
    IF NOT (r ->> 'replayed')::boolean OR pg_temp.owed(t, e1) <> 0 OR pg_temp.cash(t) <> c0 + 1250
       OR pg_temp.gl(t, '5200') <> v + 1250 OR pg_temp.gl(t, '1300') <> pg_temp.owed_all(t)
       OR (SELECT count(*) FROM public.expenses WHERE id = 'ADVWO-O2-' || x AND payment_method = 'ADVANCE') <> 1
       OR EXISTS (SELECT 1 FROM public.account_transactions WHERE ref_id = 'ADVWO-O2-' || x) THEN
      RAISE EXCEPTION 'FAIL write-off';
    END IF;
    IF (SELECT string_agg(DISTINCT status, ',') FROM public.staff_advances WHERE id IN (a1, a2)) <> 'SETTLED' THEN
      RAISE EXCEPTION 'FAIL leave: statuses %', (SELECT string_agg(id || status, ',') FROM public.staff_advances WHERE id IN (a1, a2));
    END IF;
    ok := ok || 'leaver owes 2500: collect 1250 (+cash once, replay no-op), over-amount refused, write off 1250 (ADVWO expense Dr 5200 / Cr 1300, no cash), replay no-op; owes 0, SETTLED'::text;

    -- ── 14. update and cancel ──────────────────────────────────────────────
    PERFORM public.give_staff_advance(t, a4, e3, 500, cash, '2026-12-01', 100, NULL);
    PERFORM public.update_staff_advance(t, a4, 700, bank, '2026-12-02', 100, 'more');
    IF (SELECT count(*) || '/' || trim_scale(sum(amount)) || '/' || min(account_id) FROM public.account_transactions WHERE ref_id = a4) <> '1/700/' || bank
       OR (SELECT count(*) FROM public.gl_journals WHERE reference_id = a4) <> 1
       OR (SELECT amount FROM public.staff_advance_entries WHERE id = 'ADVGIV-' || a4) <> 700
       OR pg_temp.gl(t, '1300') <> pg_temp.owed_all(t) THEN
      RAISE EXCEPTION 'FAIL update: ledger not redone';
    END IF;
    BEGIN
      PERFORM public.update_staff_advance(t, a1, 7000, cash, '2026-10-05', 2000, NULL);
      RAISE EXCEPTION 'FAIL update: amount changed after recovery';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Part of this advance has already been taken back%' THEN RAISE; END IF;
    END;
    PERFORM public.update_staff_advance(t, a1, 6000, cash, '2026-10-05', 3000, 'per run changed');
    PERFORM public.cancel_staff_advance(t, a4);
    r := public.cancel_staff_advance(t, a4);
    IF NOT (r ->> 'replayed')::boolean OR EXISTS (SELECT 1 FROM public.account_transactions WHERE ref_id = a4)
       OR EXISTS (SELECT 1 FROM public.gl_journals WHERE reference_id = a4) OR pg_temp.owed(t, e3) <> 0 THEN
      RAISE EXCEPTION 'FAIL cancel';
    END IF;
    BEGIN
      PERFORM public.cancel_staff_advance(t, a1);
      RAISE EXCEPTION 'FAIL cancel: a recovered advance was cancelled';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Part of this advance has already been taken back%' THEN RAISE; END IF;
    END;
    ok := ok || 'update redoes the OUT row and journal (one each); money fields locked after recovery, per-run still editable; cancel removes both, twice is a no-op; recovered advance cannot be cancelled'::text;

    -- ── 15. who may ────────────────────────────────────────────────────────
    PERFORM set_config('request.jwt.claims', json_build_object('sub', us, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.give_staff_advance(t, a5, e3, 100, cash, '2026-12-01', 0, NULL);
      RAISE EXCEPTION 'FAIL perms: STAFF gave an advance';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'You do not have permission to change payroll.' THEN RAISE; END IF;
    END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
    PERFORM public.give_staff_advance(t, a5, e3, 100, cash, '2026-12-01', 0, NULL);
    BEGIN
      PERFORM public.give_staff_advance(t2, a6, e3, 100, cash, '2026-12-01', 0, NULL);
      RAISE EXCEPTION 'FAIL perms: another shop''s id was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'Access denied' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.process_payroll_run(t, 'R6-' || x, '2026-12', 'CASH', jsonb_build_array(pg_temp.line(e3, 'Meena', 1)), NULL, '{"advance_aware": true}');
      RAISE EXCEPTION 'FAIL perms: a non-owner ran payroll';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'Access denied' THEN RAISE; END IF;
    END;
    PERFORM set_config('request.jwt.claims', claims_owner, true);
    PERFORM public.cancel_staff_advance(t, a5);
    ok := ok || 'STAFF refused; custom role with payroll.edit may give; another shop refused; pay runs still owner-only (unchanged)'::text;

    -- ── 16. anon gets nothing; authenticated reads only ────────────────────
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN PERFORM public.give_staff_advance(t, a6, e3, 1, cash, '2026-12-01', 0, NULL); fail := 'give';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.update_staff_advance(t, a1, 1, cash, '2026-12-01', 0, NULL); fail := coalesce(fail, 'update');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.cancel_staff_advance(t, a1); fail := coalesce(fail, 'cancel');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.settle_staff_advance(t, 'O9-' || x, e1, 'COLLECT', 1, cash, NULL); fail := coalesce(fail, 'settle');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.delete_payroll_run(t, 'R1-' || x); fail := coalesce(fail, 'delete_payroll_run');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.process_payroll_run(t, 'R7-' || x, '2026-12', 'CASH', '[]'); fail := coalesce(fail, 'process_payroll_run');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.can_edit_payroll(); fail := coalesce(fail, 'can_edit_payroll');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM 1 FROM public.staff_advances; fail := coalesce(fail, 'staff_advances');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM 1 FROM public.staff_advance_entries; fail := coalesce(fail, 'staff_advance_entries');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM 1 FROM public.staff_advance_balances; fail := coalesce(fail, 'staff_advance_balances');
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXECUTE 'RESET ROLE';
    IF fail IS NOT NULL THEN RAISE EXCEPTION 'FAIL anon could use %', fail; END IF;

    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      INSERT INTO public.staff_advances (id, tenant_id, employee_id, given_on, amount, method) VALUES (a6, t, e3, '2026-12-01', 1, 'CASH');
      fail := 'insert';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT count(*) INTO n FROM public.staff_advance_balances;
    r := public.give_staff_advance(t, a6, e3, 50, cash, '2026-12-01', 0, NULL);
    EXECUTE 'RESET ROLE';
    IF fail IS NOT NULL THEN RAISE EXCEPTION 'FAIL authenticated could write the table directly'; END IF;
    IF n < 2 OR (r ->> 'replayed')::boolean THEN RAISE EXCEPTION 'FAIL authenticated could not read its balances (%) or call give', n; END IF;
    ok := ok || 'anon: every function and both tables/views refused; authenticated: no direct INSERT, reads own balances, can call give'::text;

    -- ── 17. books ──────────────────────────────────────────────────────────
    IF pg_temp.gl(t, '1300') <> pg_temp.owed_all(t) THEN
      RAISE EXCEPTION 'FAIL books: 1300 % vs owed %', pg_temp.gl(t, '1300'), pg_temp.owed_all(t);
    END IF;
    SELECT count(*) INTO n FROM (SELECT j.id FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id
                                  WHERE j.tenant_id = t GROUP BY j.id HAVING sum(l.debit) <> sum(l.credit)) b;
    IF n > 0 THEN RAISE EXCEPTION 'FAIL books: % unbalanced journals', n; END IF;
    IF EXISTS (SELECT 1 FROM public.account_transactions a JOIN public.expenses e ON e.id = a.ref_id
                WHERE a.tenant_id = t AND a.ref_type = 'EXPENSE' AND e.payment_method = 'ADVANCE') THEN
      RAISE EXCEPTION 'FAIL books: an ADVANCE expense moved cash';
    END IF;
    ok := ok || format('books: GL 1300 (%s) = sum of staff_advance_balances; every journal balanced; no ADVANCE expense moved cash', pg_temp.gl(t, '1300'));

  EXCEPTION WHEN OTHERS THEN
    fail := SQLERRM;
  END;

  IF current_setting('staff_test.mcp', true) = 'on' THEN
    RAISE EXCEPTION E'staff_advances_test: % passed%\n%', cardinality(ok),
      CASE WHEN fail IS NULL THEN ', 0 failed' ELSE E'\nFAILED: ' || fail END, array_to_string(ok, E'\n');
  END IF;
  IF fail IS NOT NULL THEN RAISE EXCEPTION 'staff_advances_test FAILED: % (after % passing checks)', fail, cardinality(ok); END IF;
  RAISE NOTICE E'staff_advances_test: % passed\n%', cardinality(ok), array_to_string(ok, E'\n');
END $test$;

ROLLBACK;
