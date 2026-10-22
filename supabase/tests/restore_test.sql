-- ==============================================================
-- Restore regression test -- a restored shop is the shop that was saved
-- ==============================================================
-- Exercises 20261022_restore_a_shop_exactly.sql end to end, through the same
-- functions the app calls, as the shop's owner:
--
--   1. INVARIANT  every trigger that fires on INSERT or DELETE of a shop table
--                 is guarded by is_restoring() or deliberately kept. A trigger
--                 added later without a guard fails here.
--   2. ROUND TRIP back up the shop, change it, restore: every shop table must
--                 be byte-identical to before the change.
--   3. UNDO       undo the restore: every table must be byte-identical to the
--                 changed state the restore replaced.
--   4. REFUSALS   a backup missing a table, and a non-owner, are refused.
--
-- "Byte-identical" is an md5 over each table's rows as JSON, in a stable
-- order, so a re-posted ledger row, a renumbered bill or a duplicate GL
-- journal all show up as a difference.
--
-- Leaves NOTHING behind: all of it runs in a sub-transaction that is always
-- rolled back. The GL balance check is deferred to commit, so it does not run
-- here; it was exercised separately on dev (an unbalanced journal is rejected).
--
-- Subject tenant: set it explicitly, or it uses "Demo Kirana Store" and
-- refuses to guess beyond that:
--   SELECT set_config('restore_test.tenant_id', '<uuid>', false);
--
-- Results land in the temp table _restore_test_results.

CREATE TEMP TABLE IF NOT EXISTS _restore_test_results (n serial, check_name text, outcome text);
TRUNCATE _restore_test_results;

DO $test$
DECLARE
  v_t      uuid;
  v_owner  text;
  v_job    uuid;
  v_bad    text;
  r        record;
  v_page   jsonb;
  v_off    int;
  v_chunk  int;
  v_diff   int;
  v_msg    text;
  -- Outcomes are kept in a variable, not a table: the block below is rolled
  -- back on purpose, and a row written inside it would be rolled back too,
  -- making a pass indistinguishable from a test that never ran.
  v_ok     text[] := ARRAY[]::text[];
BEGIN
  -- ── subject ──────────────────────────────────────────────────────────────
  v_t := NULLIF(current_setting('restore_test.tenant_id', true), '')::uuid;
  IF v_t IS NULL THEN
    SELECT id INTO v_t FROM public.tenants WHERE name = 'Demo Kirana Store' LIMIT 1;
  END IF;
  IF v_t IS NULL THEN
    RAISE EXCEPTION 'restore_test: no subject tenant. Set restore_test.tenant_id; this test will not guess.';
  END IF;
  SELECT id INTO v_owner FROM public.users
   WHERE tenant_id = v_t AND roles @> ARRAY['OWNER']::text[] AND deleted_at IS NULL LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'restore_test: tenant % has no owner to act as', v_t;
  END IF;

  -- ── 1. invariant ─────────────────────────────────────────────────────────
  SELECT string_agg(DISTINCT cl.relname || '.' || t.tgname || ' -> ' || p.proname, ', ')
    INTO v_bad
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE cl.relname IN (SELECT table_name FROM public.shop_backup_tables())
     AND NOT t.tgisinternal
     AND (t.tgtype & 4 = 4 OR t.tgtype & 8 = 8)
     AND position('is_restoring()' in p.prosrc) = 0
     AND p.proname <> 'gl_assert_journal_balanced';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'restore_test: unguarded triggers would act during a restore: %', v_bad;
  END IF;
  INSERT INTO _restore_test_results (check_name, outcome) VALUES ('invariant', 'OK: every insert/delete trigger guarded or kept');

  -- Everything below is rolled back.
  BEGIN
    CREATE TEMP TABLE _fp (tag text, tbl text, md5 text) ON COMMIT DROP;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    -- fingerprint A: the shop as found
    FOR r IN SELECT * FROM public.shop_backup_tables() LOOP
      EXECUTE format('INSERT INTO _fp SELECT ''A'', %L, md5(COALESCE(string_agg(to_jsonb(t)::text, ''|'' ORDER BY to_jsonb(t)::text), ''''))
                        FROM public.%I t WHERE tenant_id::text = $1', r.table_name, r.table_name) USING v_t::text;
    END LOOP;

    -- the backup, through the public API
    v_job := public.restore_begin(v_t, '{"source":"restore_test"}');
    FOR r IN SELECT * FROM public.shop_backup_tables() LOOP
      v_off := 0; v_chunk := 0;
      LOOP
        v_page := public.export_shop_table(v_t, r.table_name, v_off, 1000);
        PERFORM public.restore_stage(v_job, r.table_name, v_chunk, v_page);
        EXIT WHEN jsonb_array_length(v_page) < 1000;
        v_off := v_off + 1000; v_chunk := v_chunk + 1;
      END LOOP;
    END LOOP;

    -- change the shop after the backup, through ordinary writes that fire the
    -- real triggers (the rename touches no ledger; the expense posts to it)
    UPDATE public.clients SET name = name || ' [changed after backup]'
     WHERE id = (SELECT id FROM public.clients WHERE tenant_id = v_t ORDER BY id LIMIT 1);
    INSERT INTO public.expenses (id, tenant_id, category, amount, note, date, payment_method)
    VALUES ('EXP-RESTORE-TEST', v_t, 'Misc', 1.00, 'restore_test', to_char(current_date, 'YYYY-MM-DD'), 'CASH');

    FOR r IN SELECT * FROM public.shop_backup_tables() LOOP
      EXECUTE format('INSERT INTO _fp SELECT ''B'', %L, md5(COALESCE(string_agg(to_jsonb(t)::text, ''|'' ORDER BY to_jsonb(t)::text), ''''))
                        FROM public.%I t WHERE tenant_id::text = $1', r.table_name, r.table_name) USING v_t::text;
    END LOOP;
    SELECT count(*) INTO v_diff FROM _fp a JOIN _fp b ON a.tbl = b.tbl WHERE a.tag = 'A' AND b.tag = 'B' AND a.md5 <> b.md5;
    IF v_diff = 0 THEN
      RAISE EXCEPTION 'restore_test: the change after the backup changed nothing, so the round trip would prove nothing';
    END IF;

    -- ── 2. round trip ──────────────────────────────────────────────────────
    PERFORM public.restore_apply(v_job);
    FOR r IN SELECT * FROM public.shop_backup_tables() LOOP
      EXECUTE format('INSERT INTO _fp SELECT ''C'', %L, md5(COALESCE(string_agg(to_jsonb(t)::text, ''|'' ORDER BY to_jsonb(t)::text), ''''))
                        FROM public.%I t WHERE tenant_id::text = $1', r.table_name, r.table_name) USING v_t::text;
    END LOOP;
    SELECT string_agg(c.tbl, ', ') INTO v_bad FROM _fp a JOIN _fp c ON a.tbl = c.tbl
     WHERE a.tag = 'A' AND c.tag = 'C' AND a.md5 <> c.md5;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'restore_test: after restore these tables differ from the backup: %', v_bad;
    END IF;
    v_ok := v_ok || ('round trip|' || format('OK: %s of %s tables byte-identical to the backup (%s changed tables put back)',
             (SELECT count(*) FROM _fp a JOIN _fp c ON a.tbl = c.tbl WHERE a.tag='A' AND c.tag='C' AND a.md5 = c.md5),
             (SELECT count(*) FROM _fp WHERE tag='A'), v_diff));

    -- ── 3. undo ────────────────────────────────────────────────────────────
    PERFORM public.restore_undo(v_job);
    FOR r IN SELECT * FROM public.shop_backup_tables() LOOP
      EXECUTE format('INSERT INTO _fp SELECT ''D'', %L, md5(COALESCE(string_agg(to_jsonb(t)::text, ''|'' ORDER BY to_jsonb(t)::text), ''''))
                        FROM public.%I t WHERE tenant_id::text = $1', r.table_name, r.table_name) USING v_t::text;
    END LOOP;
    SELECT string_agg(d.tbl, ', ') INTO v_bad FROM _fp b JOIN _fp d ON b.tbl = d.tbl
     WHERE b.tag = 'B' AND d.tag = 'D' AND b.md5 <> d.md5;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'restore_test: after undo these tables differ from the pre-restore shop: %', v_bad;
    END IF;
    v_ok := v_ok || 'undo|OK: every table back to the state the restore replaced'::text;

    -- ── 4. refusals ────────────────────────────────────────────────────────
    BEGIN
      v_job := public.restore_begin(v_t, '{"source":"restore_test:missing"}');
      PERFORM public.restore_stage(v_job, 'products', 0, '[]'::jsonb);   -- one table only
      PERFORM public.restore_apply(v_job);
      RAISE EXCEPTION 'restore_test: a backup missing tables was NOT refused';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'RESTORE_REFUSED: this backup does not contain%' THEN RAISE; END IF;
    END;
    v_ok := v_ok || 'refuse incomplete backup|OK: RESTORE_REFUSED'::text;

    BEGIN
      PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000dead","role":"authenticated"}', true);
      PERFORM public.restore_begin(v_t, '{}');
      RAISE EXCEPTION 'restore_test: a non-owner was NOT refused';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'RESTORE_FORBIDDEN%' THEN RAISE; END IF;
    END;
    v_ok := v_ok || 'refuse non-owner|OK: RESTORE_FORBIDDEN'::text;

    -- Undo all of the above. The results table is outside this block.
    RAISE EXCEPTION 'restore_test:rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'restore_test:rollback' THEN
      v_msg := SQLERRM;
    END IF;
  END;

  INSERT INTO _restore_test_results (check_name, outcome)
  SELECT split_part(x, '|', 1), split_part(x, '|', 2) FROM unnest(v_ok) AS x;
  IF v_msg IS NOT NULL THEN
    INSERT INTO _restore_test_results (check_name, outcome) VALUES ('FAILED', v_msg);
  ELSIF cardinality(v_ok) <> 4 THEN
    -- Every check records itself. Fewer than four means one never ran.
    INSERT INTO _restore_test_results (check_name, outcome)
    VALUES ('FAILED', format('only %s of 4 checks reported', cardinality(v_ok)));
  END IF;
END $test$;

SELECT check_name, outcome FROM _restore_test_results ORDER BY n;
