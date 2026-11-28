-- ==============================================================
-- Staff advances: two pay runs at the same moment cannot take the same money
-- ==============================================================
-- DEV ONLY. Needs two sessions, so unlike the other tests it COMMITS rows to a
-- throwaway shop and deletes them at the end (step 4). Never point it at a
-- real shop.
--
-- Session A is a one-off pg_cron job (pg_cron is on dev): it saves pay run RA,
-- which locks the person's open advances, then holds its transaction open for
-- 12 seconds. Session B (you) waits until A is asleep inside that transaction,
-- checks the advance row is locked, then saves pay run RB for the same person.
-- RB must wait for A, then take only what A left.
--
-- Expected (advance 5000, 3000 per run, both runs earn 10000):
--   probe        advance row locked by session A
--   RA recovers  3000
--   RB recovers  2000      (not 3000: it read the balance after A committed)
--   owed         0, and GL 1300 = 0
--
-- Run each step as its own statement batch. Step 1 prints the ids to paste
-- into steps 2-4 (replace :T, :U, :E, :X).

-- ── 1. throwaway shop with one advance ───────────────────────────────────────
DO $setup$
DECLARE
  x text := 'cc' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  t uuid := gen_random_uuid();
  u text := gen_random_uuid()::text;
BEGIN
  INSERT INTO public.tenants (id, name, slug, plan, status) VALUES (t, 'Advances concurrency ' || x, 'adv-cc-' || x, 'PRO', 'ACTIVE');
  INSERT INTO public.users (id, name, email, roles, tenant_id) VALUES (u, 'Owner', 'o-' || x || '@example.test', ARRAY['OWNER'], t);
  INSERT INTO public.accounts (id, tenant_id, name, type, is_default) VALUES ('ACC-' || x, t, 'Cash', 'CASH', true);
  INSERT INTO public.employees (id, tenant_id, name, pay_type, salary, status) VALUES ('E-' || x, t, 'Asha', 'MONTHLY', 20000, 'ACTIVE');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  PERFORM public.give_staff_advance(t, 'A-' || x, 'E-' || x, 5000, 'ACC-' || x, '2026-10-05', 3000, NULL);
  RAISE NOTICE 'T=% U=% E=E-% X=%', t, u, x, x;
END $setup$;

-- ── 2. session A, in the background ──────────────────────────────────────────
SELECT cron.schedule('adv-cc-session-a', '5 seconds', $job$
SELECT set_config('request.jwt.claims', '{"sub":":U","role":"authenticated"}', true);
SELECT public.process_payroll_run(':T', 'RA-:X', '2026-10', 'CASH',
  '[{"employeeId":":E","employeeName":"Asha","basePay":10000,"netPay":10000}]', NULL, '{"advance_aware":true}');
SELECT pg_sleep(12);
$job$);

-- ── 3. session B, straight after ─────────────────────────────────────────────
CREATE TEMP TABLE IF NOT EXISTS _cc (n serial, k text, v text);
DO $w$
DECLARE i int := 0;
BEGIN
  WHILE NOT EXISTS (SELECT 1 FROM pg_stat_activity WHERE query LIKE '%RA-:X%' AND state = 'active'
                     AND pid <> pg_backend_pid() AND wait_event = 'PgSleep') AND i < 80 LOOP
    PERFORM pg_sleep(0.25); i := i + 1;
  END LOOP;
  INSERT INTO _cc (k, v) VALUES ('session A sleeping inside its transaction', (i < 80)::text);
END $w$;
SELECT set_config('request.jwt.claims', '{"sub":":U","role":"authenticated"}', true);
DO $p$ BEGIN
  PERFORM 1 FROM public.staff_advances WHERE id = 'A-:X' FOR UPDATE NOWAIT;
  INSERT INTO _cc (k, v) VALUES ('probe', 'NOT locked');
EXCEPTION WHEN lock_not_available THEN
  INSERT INTO _cc (k, v) VALUES ('probe', 'advance row locked by session A');
END $p$;
INSERT INTO _cc (k, v) VALUES ('b_start', clock_timestamp()::text);
INSERT INTO _cc (k, v) SELECT 'RB recovers', public.process_payroll_run(':T', 'RB-:X', '2026-11-01/2026-11-15', 'CASH',
  '[{"employeeId":":E","employeeName":"Asha","basePay":10000,"netPay":10000}]', NULL, '{"advance_aware":true}') ->> 'advance_recovered';
INSERT INTO _cc (k, v) VALUES ('b_done', clock_timestamp()::text);
SELECT cron.unschedule('adv-cc-session-a');
INSERT INTO _cc (k, v)
SELECT 'RA recovers', (SELECT sum(amount)::text FROM public.staff_advance_entries WHERE payroll_id = 'RA-:X' AND deleted_at IS NULL);
INSERT INTO _cc (k, v)
SELECT 'owed / GL 1300', (SELECT outstanding::text FROM public.staff_advance_balances WHERE employee_id = ':E') || ' / ' ||
       (SELECT coalesce(sum(l.debit - l.credit), 0)::text FROM public.gl_lines l JOIN public.gl_accounts a ON a.id = l.account_id
         WHERE l.tenant_id = ':T' AND a.code = '1300');
SELECT string_agg(k || ' = ' || v, ' | ' ORDER BY n) FROM _cc;

-- ── 4. clean up: the shop and the cron job's log ─────────────────────────────
DO $clean$
DECLARE
  t uuid := ':T';
  r record;
BEGIN
  IF (SELECT name FROM public.tenants WHERE id = t) NOT LIKE 'Advances concurrency %' THEN
    RAISE EXCEPTION 'refusing: not the test shop';
  END IF;
  -- The restore flag makes the soft-delete and posting triggers stand aside,
  -- so these rows really go instead of being marked deleted.
  PERFORM set_config('app.restoring', 'on', true);
  FOR r IN SELECT table_name FROM public.shop_backup_tables() ORDER BY ord DESC, table_name LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id::text = $1', r.table_name) USING t::text;
  END LOOP;
  DELETE FROM public.processed_ops WHERE tenant_id = t;
  DELETE FROM public.users WHERE tenant_id = t;
  DELETE FROM public.tenants WHERE id = t;
  DELETE FROM cron.job_run_details WHERE command LIKE '%RA-:X%';
END $clean$;
