-- Restore a shop's books exactly as they were saved
-- ============================================================================
--
-- #152 shipped a backup the owner controls and planned a restore around one
-- idea: write back the shop's "source" rows and let the database triggers
-- rebuild everything derived -- the ledger, the GL, stock. Checking that idea
-- against the live database before building on it showed it does not hold,
-- three separate ways.
--
-- 1. NOT EVERY LEDGER ROW CAME FROM A TRIGGER.
--    FUTURE DISPO's account_transactions hold 11 MANUAL, 10 TRANSFER,
--    5 PURCHASE_EDIT and 2 DAY_CLOSE_VARIANCE rows. No trigger regenerates
--    them. "Rebuild the ledger" would have lost real cash and bank entries.
--
-- 2. RE-FIRING TODAY'S TRIGGERS REWRITES HISTORY.
--    The posting triggers have been rewritten several times. A row posted by
--    last year's trigger and "rebuilt" by today's is what today's code WOULD
--    have posted, not what was posted. A restore must not do that.
--
-- 3. THE BACKUP COVERED 28 OF THE SHOP'S 91 TABLES (92 on dev).
--    For FUTURE DISPO a backup taken today silently omitted attendance (83),
--    payroll (35), vehicle stock movements (107), budgets, manufacturing
--    recipes, product aliases, the chart of accounts, invoice numbering and its
--    e-invoice IRNs. Worse, wiping the backed-up tables would have CASCADE-
--    deleted rows the backup does not hold (estimate lines, IMEI history, IRN
--    records) or been blocked outright by fifteen others.
--
-- So a restore here puts back EXACTLY what was saved, every shop table, the
-- ledger and GL included, with every trigger that would re-derive, re-post or
-- rewrite a row standing aside for the one transaction it runs in.
--
-- HOW TRIGGERS STAND ASIDE
--
-- session_replication_role would switch every trigger off at once, but on this
-- platform the function owner may not set it (tested: "permission denied to
-- set parameter"). ALTER TABLE ... DISABLE TRIGGER would take an exclusive lock
-- and stop every shop writing for the length of one shop's restore. So: a
-- transaction-local flag, `app.restoring`, which each harmful trigger checks
-- first. Clients cannot set it -- PostgREST exposes neither set_config nor any
-- way to share a transaction between calls -- and it ends with the transaction.
--
-- WHAT IS DELIBERATELY NOT ROLLED BACK
--
-- Two things the outside world already holds:
--
--   e_invoice_irn      An IRN is the GST portal's record of an invoice. Your
--                      books rolling back does not roll back the government's.
--                      Current IRNs are kept, and a restore that would erase
--                      an invoice the portal holds is REFUSED.
--   invoice_counters   An invoice number handed to a customer after the backup
--                      must never be issued again. Each series keeps the
--                      higher of its current and saved number.
--
-- And platform tables (users, roles, billing, audit log, error logs,
-- idempotency claims) are not shop data and are never touched: a restore must
-- not change who can log in or what plan the shop is on.
--
-- ALL OR NOTHING
--
-- restore_apply runs in one transaction: snapshot the current books (for
-- Undo), wipe, insert, verify. A failure anywhere -- a timeout, a bad row, a
-- foreign key that does not resolve, an unbalanced journal at commit -- rolls
-- the whole thing back and the shop is exactly as it was.

-- ── 1. the flag ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_restoring()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(current_setting('app.restoring', true), '') = 'on'
$$;

COMMENT ON FUNCTION public.is_restoring() IS
  'True only inside restore_apply''s transaction. Triggers that would re-post, '
  're-derive or rewrite a restored row check it first and stand aside.';

-- ── 2. the triggers that stand aside ────────────────────────────────────────
--
-- Every trigger function that fires on INSERT or DELETE of a shop table, with
-- what it would do to a restore:
--
--   post_*_to_ledger (5), gl_post_* (5)   post the ledger/GL a second time
--   _trg_*_recalc_outstanding (2)         rewrite restored balances mid-restore
--   tg_sales_snapshot_customer_info       overwrite a sale's historic customer
--   purchases_assign_bill_id              renumber a restored bill
--   assign_employee_code                  renumber a restored employee
--   tg_product_batches_classify           reclassify a restored batch
--   tg_product_batches_log_movement       log a stock movement that never happened
--   auto_create_vehicle_inventory_location  a duplicate location per vehicle
--   tg_auto_enqueue_irn                   SUBMIT EVERY INVOICE TO THE GST PORTAL
--   soft_delete_row                       turn the wipe into an UPDATE, so
--                                         restored ids collide with the old rows
--   sync_product_stock_from_batches       recompute stock mid-restore (dev has
--                                         it, prod does not; the check below
--                                         is what found it)
--
--   sync_product_stock_sum,               per-row lookups a restored row already
--   skip_stock_rows_for_services          passed when first written; products.stock
--                                         is restored as saved instead
--
-- Left running on purpose: gl_assert_journal_balanced, deferred to commit, so
-- it re-verifies every restored journal. It is what rejects a file whose
-- ledger does not balance (tested: "debit=457.00 credit=456.00").
--
-- The guard is inserted after the body's first BEGIN, in either case. Anything
-- that makes that placement wrong (the word inside a DECLARE comment) fails to
-- compile, which aborts this migration rather than half-patching.

DO $guard$
DECLARE
  fn       text;
  r        record;
  v_new    text;
  v_lang   text;
  v_guard  text :=
    E'\n  -- A restore puts back exactly what was saved. This trigger would' ||
    E'\n  -- re-post, re-derive or rewrite it, so it stands aside while one runs.' ||
    E'\n  IF public.is_restoring() THEN' ||
    E'\n    IF TG_OP = ''DELETE'' THEN RETURN OLD; END IF;' ||
    E'\n    RETURN NEW;' ||
    E'\n  END IF;' || E'\n';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'post_sale_to_ledger', 'post_purchase_to_ledger', 'post_expense_to_ledger',
    'post_client_payment_to_ledger', 'post_supplier_payment_to_ledger',
    'gl_post_sales', 'gl_post_purchases', 'gl_post_expenses',
    'gl_post_client_payments', 'gl_post_sales_returns',
    '_trg_sales_recalc_outstanding', '_trg_payments_recalc_outstanding',
    'tg_sales_snapshot_customer_info', 'purchases_assign_bill_id', 'assign_employee_code',
    'tg_product_batches_classify', 'tg_product_batches_log_movement',
    'auto_create_vehicle_inventory_location', 'tg_auto_enqueue_irn', 'soft_delete_row',
    -- dev only, at the time of writing: recomputes stock from batches
    'sync_product_stock_from_batches',
    -- per-row lookups that a restored row already passed when it was first
    -- written; at 35,000 rows they are seconds the 8-second budget cannot spare
    'sync_product_stock_sum', 'skip_stock_rows_for_services'
  ] LOOP
    SELECT p.prosrc, p.prosecdef, p.provolatile, p.proconfig, p.prolang,
           pg_get_function_result(p.oid) AS result
      INTO r
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn AND p.pronargs = 0;
    IF NOT FOUND THEN
      -- Absent here means no trigger uses it here (dev trails prod), so there
      -- is nothing to guard. A misspelt name cannot hide behind this: the
      -- check after this loop fails on any unguarded trigger, named or not.
      RAISE NOTICE 'restore guard: % is not present here; skipped', fn;
      CONTINUE;
    END IF;
    IF r.result <> 'trigger' THEN
      RAISE EXCEPTION 'restore guard: % is not a trigger function', fn;
    END IF;
    SELECT lanname INTO v_lang FROM pg_language WHERE oid = r.prolang;
    IF v_lang <> 'plpgsql' THEN
      RAISE EXCEPTION 'restore guard: % is %, not plpgsql', fn, v_lang;
    END IF;
    IF position('is_restoring()' in r.prosrc) > 0 THEN
      CONTINUE;  -- already guarded
    END IF;

    -- First BEGIN only (no 'g' flag): the one that opens the body. Matched in
    -- either case and kept as written -- soft_delete_row is all lower case.
    v_new := regexp_replace(r.prosrc, '\m([Bb][Ee][Gg][Ii][Nn])\M', '\1' || v_guard);
    IF v_new = r.prosrc THEN
      RAISE EXCEPTION 'restore guard: no BEGIN found in %', fn;
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql %s %s %s AS %L',
      fn,
      CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN r.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
      COALESCE((SELECT string_agg('SET ' || split_part(c, '=', 1) || ' TO ' || quote_literal(split_part(c, '=', 2)), ' ')
                  FROM unnest(r.proconfig) AS c), ''),
      v_new);
  END LOOP;
END $guard$;

-- The guarantee that matters, checked directly rather than trusted to a list
-- of names: every trigger that fires on INSERT or DELETE of a shop table is
-- either guarded or deliberately kept. A trigger added later without a guard
-- fails this check the next time it runs (supabase/tests/restore_test.sql).
DO $every_trigger$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(DISTINCT cl.relname || '.' || t.tgname || ' -> ' || p.proname, ', ')
    INTO v_bad
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
     AND (t.tgtype & 4 = 4 OR t.tgtype & 8 = 8)             -- INSERT or DELETE
     AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = cl.relname AND c.column_name = 'tenant_id')
     AND left(cl.relname, 1) <> '_'
     AND NOT (cl.relname = ANY (ARRAY[
       'users','profiles','user_roles','role_permissions','tenant_invitations','subscriptions',
       'billing_subscriptions','audit_log','platform_error_logs','bug_reports','bug_report_notes',
       'processed_ops','restore_jobs','restore_staging','restore_snapshots']))
     AND position('is_restoring()' in p.prosrc) = 0
     AND p.proname NOT IN (
       'gl_assert_journal_balanced'    -- deferred to commit: re-verifies every restored journal
     );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'restore guard: these triggers would act during a restore and are not guarded: %', v_bad;
  END IF;
END $every_trigger$;

-- ── 3. the bookkeeping for a restore ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.restore_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'STAGING'
              CHECK (status IN ('STAGING', 'APPLIED', 'UNDONE')),
  source      text NOT NULL DEFAULT 'FILE' CHECK (source IN ('FILE', 'UNDO')),
  undoes      uuid REFERENCES public.restore_jobs(id),
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at  timestamptz,
  result      jsonb
);

CREATE TABLE IF NOT EXISTS public.restore_staging (
  job_id      uuid NOT NULL REFERENCES public.restore_jobs(id) ON DELETE CASCADE,
  table_name  text NOT NULL,
  chunk_no    int  NOT NULL,
  rows        jsonb NOT NULL,
  PRIMARY KEY (job_id, table_name, chunk_no)
);

-- The shop as it stood the moment before a restore. This is what Undo puts
-- back, and it does not depend on anyone having kept a file.
-- In 1,000-row chunks, like staging. Measured: one jsonb_agg over a whole
-- 35,000-row table took 12.6 s (it is quadratic in the size of one value);
-- the same rows in 1,000-row chunks took 88 ms. Nothing here ever builds a
-- whole-table JSON value.
CREATE TABLE IF NOT EXISTS public.restore_snapshots (
  job_id      uuid NOT NULL REFERENCES public.restore_jobs(id) ON DELETE CASCADE,
  table_name  text NOT NULL,
  chunk_no    int  NOT NULL,
  rows        jsonb NOT NULL,
  PRIMARY KEY (job_id, table_name, chunk_no)
);

-- No client may read or write these directly; every path goes through the
-- owner-checked functions below, which run as the table owner.
ALTER TABLE public.restore_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restore_staging   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restore_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restore_jobs, public.restore_staging, public.restore_snapshots FROM anon, authenticated;

-- ── 4. which tables are the shop ────────────────────────────────────────────
--
-- Discovered from the schema, never kept as a hand list: a list in code is how
-- the backup came to cover 28 of 91 tables. Every table with a tenant_id is
-- the shop's, except the platform tables named here and the `_`-prefixed
-- scratch snapshots older migrations left behind.

CREATE OR REPLACE FUNCTION public.shop_backup_excluded()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    -- who can log in, and with what rights: a restore must never change this
    'users', 'profiles', 'user_roles', 'role_permissions', 'tenant_invitations',
    -- what the shop pays us
    'subscriptions', 'billing_subscriptions',
    -- the platform's own records
    'audit_log', 'platform_error_logs', 'bug_reports', 'bug_report_notes',
    -- replay claims: keep current, so an op replayed after a restore stays claimed
    'processed_ops',
    -- this machinery itself
    'restore_jobs', 'restore_staging', 'restore_snapshots'
  ]::text[]
$$;

-- The shop's tables in an order where every row's parents come before it.
-- `mode` is RESTORE for ordinary tables and PRESERVE for the IRN records,
-- which keep their current rows (see the header).
CREATE OR REPLACE FUNCTION public.shop_backup_tables()
RETURNS TABLE (table_name text, ord int, mode text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_level   jsonb := '{}'::jsonb;
  v_changed boolean := true;
  v_pass    int := 0;
  r         record;
  v_tables  text[];
BEGIN
  SELECT array_agg(DISTINCT c.table_name::text ORDER BY c.table_name::text)
    INTO v_tables
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
     AND left(c.table_name::text, 1) <> '_'
     AND NOT (c.table_name::text = ANY (public.shop_backup_excluded()));

  -- Longest-path levels over the foreign keys among these tables, ignoring
  -- self-references (a multi-row INSERT checks those at end of statement).
  WHILE v_changed LOOP
    v_changed := false;
    v_pass := v_pass + 1;
    IF v_pass > 64 THEN
      RAISE EXCEPTION 'shop_backup_tables: foreign keys form a cycle among %', v_tables;
    END IF;
    FOR r IN
      SELECT t AS tbl,
             COALESCE((
               SELECT max(COALESCE((v_level ->> p.relname)::int, 0)) + 1
                 FROM pg_constraint con
                 JOIN pg_class ch ON ch.oid = con.conrelid
                 JOIN pg_class p  ON p.oid  = con.confrelid
                 JOIN pg_namespace n ON n.oid = ch.relnamespace
                WHERE con.contype = 'f' AND n.nspname = 'public'
                  AND ch.relname = t AND p.relname <> t
                  AND p.relname = ANY (v_tables)
             ), 0) AS lvl
        FROM unnest(v_tables) AS t
    LOOP
      IF COALESCE((v_level ->> r.tbl)::int, -1) <> r.lvl THEN
        v_level := v_level || jsonb_build_object(r.tbl, r.lvl);
        v_changed := true;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT k::text, (v_level ->> k)::int,
           CASE WHEN k = 'e_invoice_irn' THEN 'PRESERVE' ELSE 'RESTORE' END
      FROM jsonb_object_keys(v_level) AS k
     ORDER BY (v_level ->> k)::int, k;
END
$fn$;

-- ── 5. who may do this ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._assert_shop_owner(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_global_admin() THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
     WHERE id = (auth.uid())::text
       AND tenant_id = p_tenant_id
       AND roles @> ARRAY['OWNER']::text[]
       AND deleted_at IS NULL
  ) THEN
    -- A backup holds every customer, price and payment; a restore replaces
    -- them. Neither is a staff task.
    RAISE EXCEPTION 'RESTORE_FORBIDDEN: only the owner of this shop can do that'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

-- ── 6. taking a backup ──────────────────────────────────────────────────────
--
-- Both the backup and the restore read the same list from
-- shop_backup_tables(), so a table can never be restorable but not backed up,
-- or the reverse. Paged so no single call approaches the 8-second limit.

CREATE OR REPLACE FUNCTION public.shop_backup_manifest(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r   record;
  n   bigint;
  out jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._assert_shop_owner(p_tenant_id);
  FOR r IN SELECT * FROM public.shop_backup_tables() LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id::text = $1', r.table_name)
      INTO n USING p_tenant_id::text;
    out := out || jsonb_build_object('table', r.table_name, 'ord', r.ord, 'mode', r.mode, 'count', n);
  END LOOP;
  RETURN out;
END
$$;

CREATE OR REPLACE FUNCTION public.export_shop_table(
  p_tenant_id uuid,
  p_table     text,
  p_offset    int DEFAULT 0,
  p_limit     int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order text;
  v_rows  jsonb;
BEGIN
  PERFORM public._assert_shop_owner(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM public.shop_backup_tables() t WHERE t.table_name = p_table) THEN
    RAISE EXCEPTION 'BACKUP_INVALID: % is not one of this shop''s tables', p_table;
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'BACKUP_INVALID: page size must be between 1 and 5000';
  END IF;

  -- Page in primary-key order, so pages neither overlap nor skip.
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY array_position(i.indkey, a.attnum))
    INTO v_order
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = ('public.' || quote_ident(p_table))::regclass AND i.indisprimary;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (
       SELECT * FROM public.%I WHERE tenant_id::text = $1 ORDER BY %s LIMIT $2 OFFSET $3
     ) x',
    p_table, COALESCE(v_order, '1'))
    INTO v_rows USING p_tenant_id::text, p_limit, GREATEST(p_offset, 0);
  RETURN v_rows;
END
$$;

-- ── 7. restoring ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_begin(p_tenant_id uuid, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._assert_shop_owner(p_tenant_id);
  -- One restore at a time per shop. A second, half-staged one is abandoned.
  DELETE FROM public.restore_jobs WHERE tenant_id = p_tenant_id AND status = 'STAGING';
  INSERT INTO public.restore_jobs (tenant_id, created_by, meta)
  VALUES (p_tenant_id, (auth.uid())::text, COALESCE(p_meta, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.restore_stage(
  p_job_id   uuid,
  p_table    text,
  p_chunk_no int,
  p_rows     jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.restore_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.restore_jobs WHERE id = p_job_id;
  IF NOT FOUND OR v_job.status <> 'STAGING' THEN
    RAISE EXCEPTION 'RESTORE_INVALID: that restore is not waiting for data';
  END IF;
  PERFORM public._assert_shop_owner(v_job.tenant_id);
  IF NOT EXISTS (SELECT 1 FROM public.shop_backup_tables() t
                  WHERE t.table_name = p_table AND t.mode = 'RESTORE') THEN
    -- Not an error: a newer or older file may carry a table this database
    -- does not restore. It is skipped and the count says so.
    RETURN 0;
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'RESTORE_INVALID: rows for % must be a list', p_table;
  END IF;
  INSERT INTO public.restore_staging (job_id, table_name, chunk_no, rows)
  VALUES (p_job_id, p_table, p_chunk_no, p_rows)
  ON CONFLICT (job_id, table_name, chunk_no) DO UPDATE SET rows = EXCLUDED.rows;
  RETURN jsonb_array_length(p_rows);
END
$$;

-- The transaction. Internal; called by restore_apply and restore_undo, which
-- check the owner and the job first.
CREATE OR REPLACE FUNCTION public._restore_from(p_job_id uuid, p_tenant_id uuid, p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r          record;
  v_cols     text;
  v_sel      text;
  v_staged   bigint;
  v_now      bigint;
  v_n        bigint;
  v_counts   jsonb := '{}'::jsonb;
  v_orphan   bigint;
  v_irn_lost bigint;
  v_missing  text;
BEGIN
  -- Every harmful trigger now stands aside, until this transaction ends.
  PERFORM set_config('app.restoring', 'on', true);

  -- Working tables for this call. Dropped first, so a second call in the same
  -- transaction (a restore then an undo, or a test doing both) starts clean
  -- rather than failing on "relation already exists" -- which is what
  -- supabase/tests/restore_test.sql caught the first time it ran.
  DROP TABLE IF EXISTS pg_temp._tables, pg_temp._chunks, pg_temp._keep_irn, pg_temp._keep_counters;

  -- The table list and its order, derived once: it walks the foreign keys,
  -- and this function needs it several times inside an 8-second budget.
  CREATE TEMP TABLE _tables ON COMMIT DROP AS SELECT * FROM public.shop_backup_tables();

  -- The rows to put back, as the chunks they arrived in. They are never merged
  -- into one value per table: that single step cost 12.6 s at 35,000 rows.
  CREATE TEMP TABLE _chunks (table_name text, chunk_no int, rows jsonb) ON COMMIT DROP;
  IF p_source = 'FILE' THEN
    INSERT INTO _chunks
    SELECT table_name, chunk_no, rows FROM public.restore_staging WHERE job_id = p_job_id;
  ELSE
    INSERT INTO _chunks
    SELECT sn.table_name, sn.chunk_no, sn.rows
      FROM public.restore_snapshots sn
      JOIN public.restore_jobs j ON j.id = p_job_id
     WHERE sn.job_id = j.undoes;
  END IF;

  -- Refuse before touching anything if the file does not carry every table
  -- this shop has. The wipe below clears every table; one the file lacks would
  -- be left EMPTY. That is what an older backup (taken before a table existed,
  -- or by the first version of this feature, which covered 28 of them) would
  -- do, and it would be silent. A table the file carries with no rows arrives
  -- as an empty chunk, so "present and empty" is not mistaken for "absent".
  SELECT string_agg(t.table_name, ', ' ORDER BY t.table_name) INTO v_missing
    FROM _tables t
   WHERE t.mode = 'RESTORE'
     AND NOT EXISTS (SELECT 1 FROM _chunks c WHERE c.table_name = t.table_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RESTORE_REFUSED: this backup does not contain %, so restoring it would erase them. Take a new backup with this version and restore that.', v_missing;
  END IF;

  -- Refuse before touching anything if the GST portal holds an invoice this
  -- restore would erase. That invoice exists at the government whatever the
  -- books say, and quietly deleting it here would leave the shop unable to
  -- account for it.
  SELECT count(*) INTO v_irn_lost
    FROM public.e_invoice_irn k
   WHERE k.tenant_id = p_tenant_id AND k.deleted_at IS NULL
     AND k.status = 'SUCCESS'
     AND NOT EXISTS (
       SELECT 1 FROM _chunks c, jsonb_array_elements(c.rows) inv
        WHERE c.table_name = 'invoices' AND inv ->> 'id' = k.invoice_id::text);
  IF v_irn_lost > 0 THEN
    RAISE EXCEPTION 'RESTORE_REFUSED: % e-invoice(s) registered with the GST portal after this backup would be erased. Restore a later backup.', v_irn_lost;
  END IF;

  -- The shop as it stands now, for Undo, in 1,000-row chunks. An empty table
  -- is recorded as one empty chunk, so Undo knows it was empty rather than
  -- refusing it as missing.
  FOR r IN SELECT * FROM _tables WHERE mode = 'RESTORE' LOOP
    EXECUTE format(
      'INSERT INTO public.restore_snapshots (job_id, table_name, chunk_no, rows)
       SELECT $1, %L, b, jsonb_agg(j)
         FROM (SELECT to_jsonb(x) AS j, ((row_number() OVER ()) - 1) / 1000 AS b
                 FROM public.%I x WHERE tenant_id::text = $2) s
        GROUP BY b',
      r.table_name, r.table_name)
      USING p_job_id, p_tenant_id::text;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      INSERT INTO public.restore_snapshots (job_id, table_name, chunk_no, rows)
      VALUES (p_job_id, r.table_name, 0, '[]'::jsonb);
    END IF;
  END LOOP;

  -- What the outside world already holds, kept across the wipe.
  CREATE TEMP TABLE _keep_irn ON COMMIT DROP AS
    SELECT * FROM public.e_invoice_irn WHERE tenant_id = p_tenant_id;
  CREATE TEMP TABLE _keep_counters ON COMMIT DROP AS
    SELECT * FROM public.invoice_counters WHERE tenant_id = p_tenant_id;

  -- Wipe, children before parents. soft_delete_row stands aside, so these are
  -- real deletes; the IRN rows go with their invoices and come back below.
  FOR r IN SELECT * FROM _tables ORDER BY ord DESC, table_name DESC LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id::text = $1', r.table_name)
      USING p_tenant_id::text;
  END LOOP;

  -- Insert, parents before children, straight from the chunks. Every column
  -- the row carries except the generated ones (sale_items.line_total and
  -- friends), which the database computes and refuses to be given. tenant_id
  -- is never taken from the file: it is set to THIS shop in the SELECT list,
  -- so a row claiming another shop is written here or not at all.
  FOR r IN SELECT * FROM _tables WHERE mode = 'RESTORE' ORDER BY ord, table_name LOOP
    SELECT COALESCE(sum(jsonb_array_length(c.rows)), 0) INTO v_staged
      FROM _chunks c WHERE c.table_name = r.table_name;

    IF v_staged > 0 THEN
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
             string_agg(CASE WHEN a.attname = 'tenant_id'
                             THEN format('$2::%s', format_type(a.atttypid, a.atttypmod))
                             ELSE 'x.' || quote_ident(a.attname) END, ', ' ORDER BY a.attnum)
        INTO v_cols, v_sel
        FROM pg_attribute a
       WHERE a.attrelid = ('public.' || quote_ident(r.table_name))::regclass
         AND a.attnum > 0 AND NOT a.attisdropped
         AND a.attgenerated::text = '' AND a.attidentity::text <> 'a';
      EXECUTE format(
        'INSERT INTO public.%I (%s)
         SELECT %s FROM _chunks c, jsonb_populate_recordset(NULL::public.%I, c.rows) x
          WHERE c.table_name = $1',
        r.table_name, v_cols, v_sel, r.table_name)
        USING r.table_name, p_tenant_id::text;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id::text = $1', r.table_name)
      INTO v_now USING p_tenant_id::text;
    IF v_now <> v_staged THEN
      RAISE EXCEPTION 'RESTORE_FAILED: % should hold % rows after the restore and holds %',
        r.table_name, v_staged, v_now;
    END IF;
    IF v_staged > 0 THEN
      v_counts := v_counts || jsonb_build_object(r.table_name, v_staged);
    END IF;
  END LOOP;

  -- IRNs back, unchanged. Every one's invoice is present: checked above.
  INSERT INTO public.e_invoice_irn SELECT * FROM _keep_irn;

  -- No invoice number a customer already holds may be issued again.
  INSERT INTO public.invoice_counters AS ic
  SELECT * FROM _keep_counters
  ON CONFLICT ON CONSTRAINT invoice_counters_pkey
  DO UPDATE SET last_number = GREATEST(ic.last_number, EXCLUDED.last_number);

  -- Every reference from a restored row must land inside this shop. A
  -- foreign key alone only proves the parent exists somewhere; a crafted file
  -- could point a sale at another shop's customer.
  FOR r IN
    SELECT ch.relname AS child, p.relname AS parent, con.conname,
           (SELECT string_agg(format('c.%I = p.%I', ca.attname, pa.attname), ' AND ')
              FROM unnest(con.conkey, con.confkey) AS k(ck, pk)
              JOIN pg_attribute ca ON ca.attrelid = con.conrelid  AND ca.attnum = k.ck
              JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = k.pk) AS join_on
      FROM pg_constraint con
      JOIN pg_class ch ON ch.oid = con.conrelid
      JOIN pg_class p  ON p.oid  = con.confrelid
      JOIN pg_namespace n ON n.oid = ch.relnamespace
     WHERE con.contype = 'f' AND n.nspname = 'public'
       AND ch.relname IN (SELECT table_name FROM _tables)
       AND p.relname  IN (SELECT table_name FROM _tables)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I c JOIN public.%I p ON %s
        WHERE c.tenant_id::text = $1 AND p.tenant_id::text <> $1',
      r.child, r.parent, r.join_on)
      INTO v_orphan USING p_tenant_id::text;
    IF v_orphan > 0 THEN
      RAISE EXCEPTION 'RESTORE_FAILED: % row(s) in % point at another shop''s % (%)',
        v_orphan, r.child, r.parent, r.conname;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('restored', v_counts, 'irn_kept', (SELECT count(*) FROM _keep_irn));
END
$fn$;

CREATE OR REPLACE FUNCTION public.restore_apply(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job    public.restore_jobs%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_job FROM public.restore_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'STAGING' OR v_job.source <> 'FILE' THEN
    RAISE EXCEPTION 'RESTORE_INVALID: that restore is not ready to apply';
  END IF;
  PERFORM public._assert_shop_owner(v_job.tenant_id);
  IF NOT EXISTS (SELECT 1 FROM public.restore_staging WHERE job_id = p_job_id) THEN
    RAISE EXCEPTION 'RESTORE_INVALID: no data was uploaded for this restore';
  END IF;

  v_result := public._restore_from(p_job_id, v_job.tenant_id, 'FILE');

  UPDATE public.restore_jobs
     SET status = 'APPLIED', applied_at = now(), result = v_result
   WHERE id = p_job_id;
  DELETE FROM public.restore_staging WHERE job_id = p_job_id;
  -- Only the newest restore can be undone, so only its snapshot is worth
  -- keeping. Each is a full copy of the shop; older ones would only pile up.
  DELETE FROM public.restore_snapshots
   WHERE job_id IN (SELECT id FROM public.restore_jobs
                     WHERE tenant_id = v_job.tenant_id AND id <> p_job_id);
  RETURN v_result || jsonb_build_object('job_id', p_job_id);
END
$$;

-- Put the shop back the way it was immediately before a restore.
CREATE OR REPLACE FUNCTION public.restore_undo(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job    public.restore_jobs%ROWTYPE;
  v_undo   uuid;
  v_result jsonb;
BEGIN
  SELECT * INTO v_job FROM public.restore_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'APPLIED' THEN
    RAISE EXCEPTION 'RESTORE_INVALID: only an applied restore can be undone';
  END IF;
  PERFORM public._assert_shop_owner(v_job.tenant_id);
  -- Only the most recent restore of a shop can be undone: undoing an older one
  -- would throw away everything entered since the newer one.
  IF EXISTS (SELECT 1 FROM public.restore_jobs
              WHERE tenant_id = v_job.tenant_id AND status = 'APPLIED'
                AND applied_at > v_job.applied_at) THEN
    RAISE EXCEPTION 'RESTORE_INVALID: a later restore exists; undo that one first';
  END IF;

  INSERT INTO public.restore_jobs (tenant_id, created_by, source, undoes, meta)
  VALUES (v_job.tenant_id, (auth.uid())::text, 'UNDO', p_job_id, jsonb_build_object('undoes', p_job_id))
  RETURNING id INTO v_undo;

  v_result := public._restore_from(v_undo, v_job.tenant_id, 'UNDO');

  UPDATE public.restore_jobs SET status = 'APPLIED', applied_at = now(), result = v_result WHERE id = v_undo;
  UPDATE public.restore_jobs SET status = 'UNDONE' WHERE id = p_job_id;
  -- The undone restore's snapshot has now been used; the undo keeps its own
  -- (the shop as the restore left it), so the undo can itself be undone.
  DELETE FROM public.restore_snapshots
   WHERE job_id IN (SELECT id FROM public.restore_jobs
                     WHERE tenant_id = v_job.tenant_id AND id <> v_undo);
  RETURN v_result || jsonb_build_object('job_id', v_undo);
END
$$;

-- The most recent restore of a shop, so the page can offer Undo after a reload.
CREATE OR REPLACE FUNCTION public.restore_last(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_shop_owner(p_tenant_id);
  RETURN (
    SELECT to_jsonb(j) - 'result' || jsonb_build_object('rows', (
             SELECT COALESCE(sum(value::bigint), 0) FROM jsonb_each_text(j.result -> 'restored')))
      FROM public.restore_jobs j
     WHERE j.tenant_id = p_tenant_id AND j.status = 'APPLIED'
     ORDER BY j.applied_at DESC LIMIT 1);
END
$$;

-- ── 8. permissions ──────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._restore_from(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_shop_owner(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shop_backup_tables()            FROM PUBLIC, anon;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.shop_backup_manifest(uuid)',
    'public.export_shop_table(uuid, text, int, int)',
    'public.restore_begin(uuid, jsonb)',
    'public.restore_stage(uuid, text, int, jsonb)',
    'public.restore_apply(uuid)',
    'public.restore_undo(uuid)',
    'public.restore_last(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $grants$;

GRANT EXECUTE ON FUNCTION public.shop_backup_tables() TO authenticated, service_role;
