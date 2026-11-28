-- Staff advances (owner-approved plan, 27 Nov 2026). SERVER SIDE ONLY.
--
-- An advance is money the shop hands an employee ahead of pay. It is not an
-- expense: it is an asset (GL 1300 "Staff Advances") until it is recovered
-- from pay, collected back in cash, or written off.
--
--   give      OUT on the chosen account (ref STAFF_ADVANCE), GL Dr 1300 / Cr 1000.
--             No expense row.
--   recover   process_payroll_run takes a fixed amount per advance per run,
--             oldest advance first, never more than is owed and never more than
--             that person's net pay (net pay never goes below 0; the shortfall
--             waits for the next run). The salary expense stays GROSS:
--               PAY-<run>-<emp>     net cash paid, as today
--               PAYADV-<run>-<emp>  the recovered part, method ADVANCE
--             An ADVANCE expense moves no cash (post_expense_to_ledger skips
--             it) and credits 1300 instead of 1000 (gl_post_expenses).
--   collect   IN on the chosen account, GL Dr 1000 / Cr 1300.
--   write off ADVWO-<op> expense, method ADVANCE: GL Dr 5200 / Cr 1300.
--
-- Rules: several open advances allowed (oldest first); a run may skip someone
-- (skip_advance) or take everything owed (recover_all); day-rate staff are
-- treated the same; no interest; an advance bigger than pay earned so far is
-- allowed (the warning belongs to the UI).
--
-- Writes happen ONLY through the functions below. The tables have a SELECT
-- policy and nothing else. No triggers are added, so the shop-restore trigger
-- guard (20261022) is untouched; both new tables carry tenant_id, so
-- shop_backup_tables() picks them up for backup and restore by itself.
--
-- process_payroll_run: the old signature is DROPPED and recreated with a
-- trailing p_options jsonb DEFAULT '{}'. Keeping both would make every caller
-- fail with "function is not unique". It becomes SECURITY DEFINER (it must
-- write staff_advance_entries, which no client may write) and therefore checks
-- in its body exactly what RLS checked before: payroll on the plan, and
-- (own shop AND owner/global admin) OR global admin. A shop with no advances
-- gets the same rows as before. A caller that does not send
-- p_options.advance_aware = true is REFUSED when anyone in the run has a
-- recovery due, so an old app can never pay a run without the recovery it
-- cannot show.

-- ── 0. preconditions: the bodies this edits are the ones we read ───────────
DO $pre$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_payroll_run'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_run_id text, p_period text, p_payment_method text, p_items jsonb, p_processed_at text';
  IF v_md5 IS DISTINCT FROM '6665511759c04c17261b0e847082634d' THEN
    RAISE EXCEPTION 'staff_advances: process_payroll_run is not the body this migration restates (md5 %). Re-read it and redo the restatement.', v_md5;
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'process_payroll_run') <> 1 THEN
    RAISE EXCEPTION 'staff_advances: expected exactly one process_payroll_run';
  END IF;
END $pre$;

-- ── 1. tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_advances (
  id               text PRIMARY KEY,                -- made on the device
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  employee_id      text NOT NULL REFERENCES public.employees(id),
  given_on         date NOT NULL,
  amount           numeric NOT NULL CHECK (amount > 0),
  -- No foreign key: accounts have no soft-delete trigger and the offline
  -- queue can send a real DELETE; an advance must not block it (its
  -- account_transactions cascade; this keeps the id for history).
  account_id       text,
  method           text NOT NULL,                   -- CASH / UPI / BANK, from the account
  recovery_per_run numeric NOT NULL DEFAULT 0 CHECK (recovery_per_run >= 0),
  note             text,
  status           text NOT NULL DEFAULT 'OPEN'
                   CHECK (status IN ('OPEN', 'CLEARED', 'SETTLED', 'CANCELLED')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_staff_advances_tenant_employee
  ON public.staff_advances (tenant_id, employee_id);

CREATE TABLE IF NOT EXISTS public.staff_advance_entries (
  id          text PRIMARY KEY,                     -- ADVGIV-<adv>, ADVREC-<run>-<adv>, ADVCOL-<op>-<adv>, ADVWO-<op>-<adv>
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),
  advance_id  text NOT NULL REFERENCES public.staff_advances(id),
  employee_id text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('GIVEN', 'RECOVERY', 'COLLECTION', 'WRITE_OFF')),
  amount      numeric NOT NULL CHECK (amount > 0),
  payroll_id  text,
  expense_id  text,
  account_id  text,
  op_id       text,
  on_date     date NOT NULL,
  note        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_staff_advance_entries_tenant_employee
  ON public.staff_advance_entries (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_advance_entries_advance
  ON public.staff_advance_entries (advance_id);
CREATE INDEX IF NOT EXISTS idx_staff_advance_entries_payroll
  ON public.staff_advance_entries (tenant_id, payroll_id) WHERE payroll_id IS NOT NULL;
-- One live recovery per advance per run.
CREATE UNIQUE INDEX IF NOT EXISTS staff_advance_entries_one_recovery_per_run
  ON public.staff_advance_entries (advance_id, payroll_id)
  WHERE kind = 'RECOVERY' AND deleted_at IS NULL;

ALTER TABLE public.staff_advances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_advance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_advances_select ON public.staff_advances;
CREATE POLICY staff_advances_select ON public.staff_advances
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.has_module_access('payroll')));

DROP POLICY IF EXISTS staff_advance_entries_select ON public.staff_advance_entries;
CREATE POLICY staff_advance_entries_select ON public.staff_advance_entries
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.has_module_access('payroll')));

-- Supabase grants new tables to anon and authenticated by default. Take that
-- back: authenticated may read (RLS decides what), nobody else anything.
REVOKE ALL ON public.staff_advances, public.staff_advance_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_advances, public.staff_advance_entries TO authenticated;

COMMENT ON TABLE public.staff_advances IS
  'Money given to an employee ahead of pay. Written only by give_staff_advance / update_staff_advance / cancel_staff_advance; status is refreshed by every function that touches it. What is owed is staff_advance_status.outstanding, not status.';
COMMENT ON TABLE public.staff_advance_entries IS
  'Movements on an advance: GIVEN, RECOVERY (from a pay run), COLLECTION (cash back), WRITE_OFF. A RECOVERY counts only while its pay run and its PAYADV expense are live.';

-- ── 2. what is owed ────────────────────────────────────────────────────────
-- Per advance. A recovery whose pay run (or PAYADV expense) has been deleted
-- does not count, whichever way the run was deleted: delete_payroll_run, or
-- the older app's two steps (expenses, then the run).
CREATE OR REPLACE VIEW public.staff_advance_status
WITH (security_invoker = true) AS
SELECT
  a.id                AS advance_id,
  a.tenant_id,
  a.employee_id,
  a.given_on,
  a.created_at,
  a.amount,
  a.recovery_per_run,
  a.account_id,
  a.method,
  a.note,
  coalesce(x.recovered, 0)   AS recovered,
  coalesce(x.collected, 0)   AS collected,
  coalesce(x.written_off, 0) AS written_off,
  a.amount - coalesce(x.recovered, 0) - coalesce(x.collected, 0) - coalesce(x.written_off, 0) AS outstanding,
  CASE
    WHEN a.amount - coalesce(x.recovered, 0) - coalesce(x.collected, 0) - coalesce(x.written_off, 0) > 0 THEN 'OPEN'
    WHEN coalesce(x.collected, 0) + coalesce(x.written_off, 0) > 0 THEN 'SETTLED'
    ELSE 'CLEARED'
  END AS status
FROM public.staff_advances a
LEFT JOIN LATERAL (
  SELECT
    sum(e.amount) FILTER (WHERE e.kind = 'RECOVERY')   AS recovered,
    sum(e.amount) FILTER (WHERE e.kind = 'COLLECTION') AS collected,
    sum(e.amount) FILTER (WHERE e.kind = 'WRITE_OFF')  AS written_off
  FROM public.staff_advance_entries e
  WHERE e.advance_id = a.id
    AND e.tenant_id = a.tenant_id
    AND e.deleted_at IS NULL
    AND (e.kind <> 'RECOVERY' OR (
          EXISTS (SELECT 1 FROM public.payroll p
                   WHERE p.id = e.payroll_id AND p.tenant_id = e.tenant_id AND p.deleted_at IS NULL)
      AND (e.expense_id IS NULL OR EXISTS (SELECT 1 FROM public.expenses x
                   WHERE x.id = e.expense_id AND x.tenant_id = e.tenant_id AND x.deleted_at IS NULL))))
) x ON true
WHERE a.deleted_at IS NULL AND a.status <> 'CANCELLED';

-- Per employee: what each still owes, and what the next run would take.
CREATE OR REPLACE VIEW public.staff_advance_balances
WITH (security_invoker = true) AS
SELECT
  s.tenant_id,
  s.employee_id,
  count(*) FILTER (WHERE s.outstanding > 0)                              AS open_advances,
  sum(s.amount)                                                          AS given,
  sum(s.recovered)                                                       AS recovered,
  sum(s.collected)                                                       AS collected,
  sum(s.written_off)                                                     AS written_off,
  sum(s.outstanding)                                                     AS outstanding,
  coalesce(sum(least(s.recovery_per_run, s.outstanding)) FILTER (WHERE s.outstanding > 0), 0) AS due_per_run,
  min(s.given_on) FILTER (WHERE s.outstanding > 0)                       AS oldest_open_on
FROM public.staff_advance_status s
GROUP BY s.tenant_id, s.employee_id;

REVOKE ALL ON public.staff_advance_status, public.staff_advance_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_advance_status, public.staff_advance_balances TO authenticated;

-- ── 3. GL account 1300 ─────────────────────────────────────────────────────
INSERT INTO public.gl_accounts (tenant_id, code, name, type, category, normal_balance)
SELECT DISTINCT g.tenant_id, '1300', 'Staff Advances', 'ASSET'::public.account_type, 'Current Assets',
       'DEBIT'::public.normal_balance
  FROM public.gl_accounts g
ON CONFLICT (tenant_id, code) DO NOTHING;

-- New shops: the seed, by asserted replacement.
DO $seed$
DECLARE
  r       record;
  v_old   text := E'        (NEW.id, ''1200'', ''Inventory'', ''ASSET'', ''Current Assets'', ''DEBIT''),\n';
  v_add   text := E'        (NEW.id, ''1300'', ''Staff Advances'', ''ASSET'', ''Current Assets'', ''DEBIT''),\n';
  v_new   text;
BEGIN
  SELECT p.prosrc, p.prosecdef, p.proconfig INTO r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'seed_tenant_chart_of_accounts';
  IF r IS NULL THEN RAISE EXCEPTION 'staff_advances: seed_tenant_chart_of_accounts not found'; END IF;
  IF position('''1300''' in r.prosrc) > 0 THEN
    RAISE NOTICE 'seed already carries 1300';
    RETURN;
  END IF;
  IF (length(r.prosrc) - length(replace(r.prosrc, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'staff_advances: the 1200 seed line is not in seed_tenant_chart_of_accounts exactly once';
  END IF;
  v_new := replace(r.prosrc, v_old, v_old || v_add);
  EXECUTE format('CREATE OR REPLACE FUNCTION public.seed_tenant_chart_of_accounts() RETURNS trigger LANGUAGE plpgsql %s %s AS %L',
    CASE WHEN r.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
    COALESCE((SELECT string_agg('SET ' || split_part(c, '=', 1) || ' TO ' || quote_literal(split_part(c, '=', 2)), ' ')
                FROM unnest(r.proconfig) AS c), ''),
    v_new);
END $seed$;

-- ── 4. the two edits to the posting triggers ───────────────────────────────
-- By asserted replacement against whatever each database has: each anchor
-- must be found exactly once, or the migration fails. Every attribute is read
-- back from the catalog; CREATE OR REPLACE keeps the ACL.
DO $patch$
DECLARE
  r        record;
  t        text[];
  v_new    text;
  v_hits   int;
  targets  text[][] := ARRAY[
    -- post_expense_to_ledger: an ADVANCE expense moves no cash.
    ARRAY['post_expense_to_ledger',
          E'  IF v_amount <= 0 THEN RETURN NEW; END IF;\n',
          E'  -- staff advance: a recovered or written-off advance moves no cash.\n'
          || E'  -- The money left the till when the advance was given.\n'
          || E'  IF v_method = ''ADVANCE'' THEN RETURN NEW; END IF;\n\n'
          || E'  IF v_amount <= 0 THEN RETURN NEW; END IF;\n'],
    -- gl_post_expenses: an ADVANCE expense credits Staff Advances, not cash.
    ARRAY['gl_post_expenses',
          E'public.gl_account_id(v_tenant_id,''1000''), v_amount);',
          E'public.gl_account_id(v_tenant_id,\n'
          || E'    -- staff advance: recovered / written-off advances credit 1300, not cash.\n'
          || E'    CASE WHEN upper(COALESCE(NEW.payment_method, '''')) = ''ADVANCE'' THEN ''1300'' ELSE ''1000'' END), v_amount);']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    SELECT p.prosrc, pg_get_function_result(p.oid) AS result, p.prosecdef, p.provolatile, p.proconfig INTO r
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = targets[i][1];
    IF r IS NULL THEN
      RAISE EXCEPTION 'staff_advances: % is not on this database', targets[i][1];
    END IF;
    IF position('staff advance:' in r.prosrc) > 0 THEN
      RAISE NOTICE '% already patched', targets[i][1];
      CONTINUE;
    END IF;
    v_hits := (length(r.prosrc) - length(replace(r.prosrc, targets[i][2], ''))) / length(targets[i][2]);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'staff_advances: anchor in % found % times, expected exactly 1', targets[i][1], v_hits;
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

-- ── 5. who may ─────────────────────────────────────────────────────────────
-- The payroll edit permission as the web applies it (AuthContext.hasPermission):
-- owner or global admin always; the STAFF / SALES / INVENTORY / DRIVER
-- templates never; any other role by its permissions.payroll.edit flag.
CREATE OR REPLACE FUNCTION public.can_edit_payroll()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = (auth.uid())::text
       AND u.deleted_at IS NULL
       AND (
         u.roles && ARRAY['OWNER', 'GLOBAL_ADMIN']::text[]
         OR (NOT (coalesce(u.roles, '{}') && ARRAY['STAFF', 'SALES', 'INVENTORY', 'DRIVER']::text[])
             AND coalesce(u.permissions -> 'payroll' ->> 'edit', '') = 'true')
       )
  );
$$;
REVOKE ALL ON FUNCTION public.can_edit_payroll() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_payroll() TO authenticated;

-- Every advance function opens with this.
CREATE OR REPLACE FUNCTION public._staff_advance_guard(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in again.' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_module_access('payroll') THEN
    RAISE EXCEPTION 'Payroll is not on this shop''s plan.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_edit_payroll() THEN
    RAISE EXCEPTION 'You do not have permission to change payroll.' USING ERRCODE = '42501';
  END IF;
END $$;

-- Pay runs keep the gate RLS gave them before this migration: payroll on the
-- plan, and the shop's owner (or a global admin).
CREATE OR REPLACE FUNCTION public._payroll_run_guard(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in again.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_module_access('payroll') THEN
    RAISE EXCEPTION 'Payroll is not on this shop''s plan.' USING ERRCODE = '42501';
  END IF;
  IF NOT ((p_tenant_id = public.current_tenant_id() AND public.is_tenant_admin()) OR public.is_global_admin()) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
END $$;

-- ── 6. internal helpers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._staff_advance_refresh_status(p_tenant_id uuid, p_ids text[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.staff_advances a
     SET status = s.status, updated_at = now()
    FROM public.staff_advance_status s
   WHERE s.advance_id = a.id AND a.tenant_id = p_tenant_id AND a.id = ANY (p_ids)
     AND a.status <> 'CANCELLED' AND a.status IS DISTINCT FROM s.status;
$$;

CREATE OR REPLACE FUNCTION public._staff_advance_json(p_id text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(a)
         || jsonb_build_object(
              'outstanding', coalesce(s.outstanding, 0),
              'recovered',   coalesce(s.recovered, 0),
              'collected',   coalesce(s.collected, 0),
              'written_off', coalesce(s.written_off, 0))
    FROM public.staff_advances a
    LEFT JOIN public.staff_advance_status s ON s.advance_id = a.id
   WHERE a.id = p_id;
$$;

-- The money side of giving an advance: one OUT row and one journal, both
-- keyed by the advance id, so redoing it replaces rather than adds.
CREATE OR REPLACE FUNCTION public._staff_advance_post_given(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adv  public.staff_advances%ROWTYPE;
  v_acc  public.accounts%ROWTYPE;
  v_name text;
  v_jid  uuid;
BEGIN
  SELECT * INTO v_adv FROM public.staff_advances WHERE id = p_id;
  DELETE FROM public.account_transactions
   WHERE tenant_id = v_adv.tenant_id AND ref_type = 'STAFF_ADVANCE' AND ref_id = p_id;
  PERFORM public.gl_drop_source_journal(v_adv.tenant_id, 'STAFF_ADVANCE', p_id);
  IF v_adv.deleted_at IS NOT NULL OR v_adv.status = 'CANCELLED' THEN
    RETURN;
  END IF;

  SELECT * INTO v_acc FROM public.accounts WHERE id = v_adv.account_id;
  SELECT name INTO v_name FROM public.employees WHERE id = v_adv.employee_id;

  INSERT INTO public.account_transactions
    (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note)
  VALUES ('ATX-ADVGIV-' || p_id, v_adv.tenant_id,
          COALESCE(v_acc.linked_bank_account_id, v_acc.id),
          v_adv.given_on, 'OUT', v_adv.amount, v_adv.method, 'STAFF_ADVANCE', p_id,
          'Staff advance — ' || coalesce(v_name, ''));

  INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
  VALUES (v_adv.tenant_id, v_adv.given_on, 'STAFF_ADVANCE', p_id, 'Staff advance — ' || coalesce(v_name, ''))
  RETURNING id INTO v_jid;
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
  VALUES (v_adv.tenant_id, v_jid, public.gl_account_id(v_adv.tenant_id, '1300'), v_adv.amount);
  INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
  VALUES (v_adv.tenant_id, v_jid, public.gl_account_id(v_adv.tenant_id, '1000'), v_adv.amount);
END $$;

REVOKE ALL ON FUNCTION public._staff_advance_guard(uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._payroll_run_guard(uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._staff_advance_refresh_status(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._staff_advance_json(text)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._staff_advance_post_given(text)             FROM PUBLIC, anon, authenticated;

-- ── 7. give / update / cancel ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.give_staff_advance(
  p_tenant_id        uuid,
  p_id               text,
  p_employee_id      text,
  p_amount           numeric,
  p_account_id       text,
  p_given_on         date,
  p_recovery_per_run numeric,
  p_note             text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adv public.staff_advances%ROWTYPE;
  v_acc public.accounts%ROWTYPE;
  v_rec numeric := round(coalesce(p_recovery_per_run, 0), 2);
  v_amt numeric := round(p_amount, 2);
BEGIN
  PERFORM public._staff_advance_guard(p_tenant_id);
  IF coalesce(trim(p_id), '') = '' THEN
    RAISE EXCEPTION 'An advance needs an id.' USING ERRCODE = '22023';
  END IF;

  -- Sent before? Hand back what is saved and write nothing.
  SELECT * INTO v_adv FROM public.staff_advances WHERE id = p_id;
  IF FOUND THEN
    IF v_adv.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'That advance id belongs to another shop.' USING ERRCODE = '42501';
    END IF;
    RETURN public._staff_advance_json(p_id) || jsonb_build_object('replayed', true);
  END IF;

  IF v_amt IS NULL OR v_amt <= 0 THEN
    RAISE EXCEPTION 'An advance must be more than ₹0.' USING ERRCODE = '22023';
  END IF;
  IF v_rec < 0 THEN
    RAISE EXCEPTION 'The amount taken back each pay run cannot be negative.' USING ERRCODE = '22023';
  END IF;
  IF p_given_on IS NULL THEN
    RAISE EXCEPTION 'An advance needs the date it was given.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees
                  WHERE id = p_employee_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That employee is not in this shop.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_acc FROM public.accounts
   WHERE id = p_account_id AND tenant_id = p_tenant_id AND deleted_at IS NULL AND type <> 'LOAN';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose the cash, UPI or bank account the advance was paid from.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_advances
    (id, tenant_id, employee_id, given_on, amount, account_id, method, recovery_per_run, note, status, created_by)
  VALUES (p_id, p_tenant_id, p_employee_id, p_given_on, v_amt, v_acc.id,
          CASE upper(v_acc.type) WHEN 'CASH' THEN 'CASH' WHEN 'UPI' THEN 'UPI' ELSE 'BANK' END,
          v_rec, nullif(trim(p_note), ''), 'OPEN', (auth.uid())::text)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    -- The same id arrived twice at once and the other one won.
    RETURN public._staff_advance_json(p_id) || jsonb_build_object('replayed', true);
  END IF;

  INSERT INTO public.staff_advance_entries
    (id, tenant_id, advance_id, employee_id, kind, amount, account_id, on_date, note, created_by)
  VALUES ('ADVGIV-' || p_id, p_tenant_id, p_id, p_employee_id, 'GIVEN', v_amt, v_acc.id, p_given_on,
          nullif(trim(p_note), ''), (auth.uid())::text);

  PERFORM public._staff_advance_post_given(p_id);
  RETURN public._staff_advance_json(p_id) || jsonb_build_object('replayed', false);
END $$;

-- Overwrites the advance. Amount, account and date can change only while
-- nothing has been recovered, collected or written off; the per-run amount
-- and the note can change at any time.
CREATE OR REPLACE FUNCTION public.update_staff_advance(
  p_tenant_id        uuid,
  p_id               text,
  p_amount           numeric,
  p_account_id       text,
  p_given_on         date,
  p_recovery_per_run numeric,
  p_note             text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adv   public.staff_advances%ROWTYPE;
  v_acc   public.accounts%ROWTYPE;
  v_done  numeric;
  v_amt   numeric := round(p_amount, 2);
  v_rec   numeric := round(coalesce(p_recovery_per_run, 0), 2);
  v_money boolean;
BEGIN
  PERFORM public._staff_advance_guard(p_tenant_id);
  SELECT * INTO v_adv FROM public.staff_advances
   WHERE id = p_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That advance is not in this shop.' USING ERRCODE = '22023';
  END IF;
  IF v_adv.deleted_at IS NOT NULL OR v_adv.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'That advance was cancelled.' USING ERRCODE = '22023';
  END IF;
  IF v_amt IS NULL OR v_amt <= 0 THEN
    RAISE EXCEPTION 'An advance must be more than ₹0.' USING ERRCODE = '22023';
  END IF;
  IF v_rec < 0 THEN
    RAISE EXCEPTION 'The amount taken back each pay run cannot be negative.' USING ERRCODE = '22023';
  END IF;
  IF p_given_on IS NULL THEN
    RAISE EXCEPTION 'An advance needs the date it was given.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_acc FROM public.accounts
   WHERE id = p_account_id AND tenant_id = p_tenant_id AND deleted_at IS NULL AND type <> 'LOAN';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose the cash, UPI or bank account the advance was paid from.' USING ERRCODE = '22023';
  END IF;

  v_money := v_amt <> v_adv.amount OR v_acc.id IS DISTINCT FROM v_adv.account_id OR p_given_on <> v_adv.given_on;
  IF v_money THEN
    SELECT recovered + collected + written_off INTO v_done
      FROM public.staff_advance_status WHERE advance_id = p_id;
    IF coalesce(v_done, 0) > 0 THEN
      RAISE EXCEPTION 'Part of this advance has already been taken back, so its amount, account and date can no longer change.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.staff_advances
     SET amount = v_amt, account_id = v_acc.id, given_on = p_given_on,
         method = CASE upper(v_acc.type) WHEN 'CASH' THEN 'CASH' WHEN 'UPI' THEN 'UPI' ELSE 'BANK' END,
         recovery_per_run = v_rec, note = nullif(trim(p_note), ''), updated_at = now()
   WHERE id = p_id;

  IF v_money THEN
    UPDATE public.staff_advance_entries
       SET amount = v_amt, account_id = v_acc.id, on_date = p_given_on
     WHERE id = 'ADVGIV-' || p_id;
    PERFORM public._staff_advance_post_given(p_id);
  END IF;
  PERFORM public._staff_advance_refresh_status(p_tenant_id, ARRAY[p_id]);
  RETURN public._staff_advance_json(p_id);
END $$;

-- Only while nothing has been taken back. Soft-deletes the advance and its
-- GIVEN entry and removes its OUT row and journal. Safe to send twice.
CREATE OR REPLACE FUNCTION public.cancel_staff_advance(p_tenant_id uuid, p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adv  public.staff_advances%ROWTYPE;
  v_done numeric;
BEGIN
  PERFORM public._staff_advance_guard(p_tenant_id);
  SELECT * INTO v_adv FROM public.staff_advances
   WHERE id = p_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That advance is not in this shop.' USING ERRCODE = '22023';
  END IF;
  IF v_adv.deleted_at IS NOT NULL OR v_adv.status = 'CANCELLED' THEN
    RETURN public._staff_advance_json(p_id) || jsonb_build_object('replayed', true);
  END IF;

  SELECT recovered + collected + written_off INTO v_done
    FROM public.staff_advance_status WHERE advance_id = p_id;
  IF coalesce(v_done, 0) > 0 THEN
    RAISE EXCEPTION 'Part of this advance has already been taken back, so it cannot be cancelled. Collect or write off what is left instead.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.staff_advances
     SET status = 'CANCELLED', deleted_at = now(), updated_at = now()
   WHERE id = p_id;
  UPDATE public.staff_advance_entries SET deleted_at = now()
   WHERE advance_id = p_id AND deleted_at IS NULL;
  PERFORM public._staff_advance_post_given(p_id);   -- removes the OUT row and journal
  RETURN public._staff_advance_json(p_id) || jsonb_build_object('replayed', false);
END $$;

-- ── 8. settle: employee leaves, or pays back ───────────────────────────────
CREATE OR REPLACE FUNCTION public.settle_staff_advance(
  p_tenant_id   uuid,
  p_op_id       text,
  p_employee_id text,
  p_mode        text,
  p_amount      numeric,
  p_account_id  text,
  p_on          date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode  text := upper(coalesce(trim(p_mode), ''));
  v_amt   numeric := round(p_amount, 2);
  v_on    date := coalesce(p_on, current_date);
  v_acc   public.accounts%ROWTYPE;
  v_owed  numeric;
  v_left  numeric;
  v_take  numeric;
  v_name  text;
  v_jid   uuid;
  v_ref   text;
  v_ids   text[] := '{}';
  r       record;
BEGIN
  PERFORM public._staff_advance_guard(p_tenant_id);
  IF coalesce(trim(p_op_id), '') = '' THEN
    RAISE EXCEPTION 'A settlement needs an id.' USING ERRCODE = '22023';
  END IF;

  -- Claim the op first: a replay finds it taken and writes nothing.
  INSERT INTO public.processed_ops (fn, op_id, tenant_id)
  VALUES ('settle_staff_advance', p_op_id, p_tenant_id)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'replayed', true,
      'entries', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.staff_advance_entries e
                            WHERE e.tenant_id = p_tenant_id AND e.op_id = p_op_id), '[]'::jsonb),
      'outstanding', coalesce((SELECT outstanding FROM public.staff_advance_balances
                                WHERE tenant_id = p_tenant_id AND employee_id = p_employee_id), 0));
  END IF;

  IF v_mode NOT IN ('COLLECT', 'WRITE_OFF') THEN
    RAISE EXCEPTION 'Settle by COLLECT or WRITE_OFF, not "%".', p_mode USING ERRCODE = '22023';
  END IF;
  IF v_amt IS NULL OR v_amt <= 0 THEN
    RAISE EXCEPTION 'The amount must be more than ₹0.' USING ERRCODE = '22023';
  END IF;
  IF v_mode = 'COLLECT' THEN
    SELECT * INTO v_acc FROM public.accounts
     WHERE id = p_account_id AND tenant_id = p_tenant_id AND deleted_at IS NULL AND type <> 'LOAN';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose the cash, UPI or bank account the money came into.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Lock this person's advances (same order as process_payroll_run: by id).
  PERFORM 1 FROM public.staff_advances
   WHERE tenant_id = p_tenant_id AND employee_id = p_employee_id
     AND deleted_at IS NULL AND status <> 'CANCELLED'
   ORDER BY id FOR UPDATE;

  SELECT coalesce(sum(outstanding), 0) INTO v_owed FROM public.staff_advance_status
   WHERE tenant_id = p_tenant_id AND employee_id = p_employee_id AND outstanding > 0;
  IF v_amt > v_owed THEN
    RAISE EXCEPTION 'That is more than is owed (₹%).', v_owed USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_name FROM public.employees WHERE id = p_employee_id AND tenant_id = p_tenant_id;
  v_ref := CASE v_mode WHEN 'COLLECT' THEN 'ADVCOL-' ELSE 'ADVWO-' END || p_op_id;

  IF v_mode = 'COLLECT' THEN
    INSERT INTO public.account_transactions
      (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note)
    VALUES ('ATX-' || v_ref, p_tenant_id, COALESCE(v_acc.linked_bank_account_id, v_acc.id), v_on, 'IN', v_amt,
            CASE upper(v_acc.type) WHEN 'CASH' THEN 'CASH' WHEN 'UPI' THEN 'UPI' ELSE 'BANK' END,
            'STAFF_ADVANCE', v_ref, 'Staff advance paid back — ' || coalesce(v_name, ''));
    INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
    VALUES (p_tenant_id, v_on, 'STAFF_ADVANCE', v_ref, 'Staff advance paid back — ' || coalesce(v_name, ''))
    RETURNING id INTO v_jid;
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
    VALUES (p_tenant_id, v_jid, public.gl_account_id(p_tenant_id, '1000'), v_amt);
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit)
    VALUES (p_tenant_id, v_jid, public.gl_account_id(p_tenant_id, '1300'), v_amt);
  ELSE
    -- A loss: an expense (Dr 5200) that credits Staff Advances, moving no cash.
    INSERT INTO public.expenses (id, tenant_id, category, amount, note, date, payment_method)
    VALUES (v_ref, p_tenant_id, 'Staff advance written off', v_amt,
            'Staff advance written off — ' || coalesce(v_name, ''), to_char(v_on, 'YYYY-MM-DD'), 'ADVANCE');
  END IF;

  -- Oldest advance first.
  v_left := v_amt;
  FOR r IN SELECT advance_id, outstanding FROM public.staff_advance_status
            WHERE tenant_id = p_tenant_id AND employee_id = p_employee_id AND outstanding > 0
            ORDER BY given_on, created_at, advance_id LOOP
    EXIT WHEN v_left <= 0;
    v_take := least(v_left, r.outstanding);
    INSERT INTO public.staff_advance_entries
      (id, tenant_id, advance_id, employee_id, kind, amount, expense_id, account_id, op_id, on_date, created_by)
    VALUES (v_ref || '-' || r.advance_id, p_tenant_id, r.advance_id, p_employee_id,
            CASE v_mode WHEN 'COLLECT' THEN 'COLLECTION' ELSE 'WRITE_OFF' END, v_take,
            CASE WHEN v_mode = 'WRITE_OFF' THEN v_ref END,
            CASE WHEN v_mode = 'COLLECT' THEN v_acc.id END,
            p_op_id, v_on, (auth.uid())::text);
    v_ids := v_ids || r.advance_id;
    v_left := v_left - v_take;
  END LOOP;

  PERFORM public._staff_advance_refresh_status(p_tenant_id, v_ids);
  RETURN jsonb_build_object(
    'replayed', false,
    'mode', v_mode,
    'amount', v_amt,
    'entries', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.staff_advance_entries e
                          WHERE e.tenant_id = p_tenant_id AND e.op_id = p_op_id), '[]'::jsonb),
    'outstanding', coalesce((SELECT outstanding FROM public.staff_advance_balances
                              WHERE tenant_id = p_tenant_id AND employee_id = p_employee_id), 0));
END $$;

-- ── 9. process_payroll_run, with recovery ──────────────────────────────────
-- Full restatement of the body recorded in 20261126 (md5 asserted above).
-- Every original line is kept; the additions are marked "advance".
DROP FUNCTION public.process_payroll_run(uuid, text, text, text, jsonb, text);

CREATE FUNCTION public.process_payroll_run(
  p_tenant_id      uuid,
  p_run_id         text,
  p_period         text,
  p_payment_method text,
  p_items          jsonb,
  p_processed_at   text DEFAULT NULL,
  p_options        jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing  public.payroll%ROWTYPE;
  v_method    text := upper(coalesce(nullif(trim(p_payment_method), ''), 'CASH'));
  v_pay_date  text;
  v_item      jsonb;
  v_net       numeric;
  v_expenses  integer := 0;
  -- advance
  v_opts      jsonb := CASE WHEN jsonb_typeof(p_options) = 'object' THEN p_options ELSE '{}'::jsonb END;
  v_aware     boolean;
  v_skip      text[];
  v_all       text[];
  v_items     jsonb := '[]'::jsonb;
  v_plan      jsonb := '[]'::jsonb;
  v_emp       text;
  v_rec       numeric;
  v_left      numeric;
  v_take      numeric;
  v_total_rec numeric := 0;
  v_ids       text[] := '{}';
  a           record;
BEGIN
  IF p_tenant_id IS NULL OR coalesce(trim(p_run_id), '') = '' THEN
    RAISE EXCEPTION 'A pay run needs a shop and a run id.' USING ERRCODE = '22023';
  END IF;
  -- advance: SECURITY DEFINER now, so the gate RLS used to apply is checked here.
  PERFORM public._payroll_run_guard(p_tenant_id);
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A pay run needs at least one person in it.' USING ERRCODE = '22023';
  END IF;
  IF v_method NOT IN ('CASH', 'UPI', 'BANK', 'CARD') THEN
    RAISE EXCEPTION 'Unknown way of paying: %', p_payment_method USING ERRCODE = '22023';
  END IF;

  -- The pay date is the last day the run covers. The period is 'YYYY-MM' for
  -- a month or 'YYYY-MM-DD/YYYY-MM-DD' for any other window.
  IF p_period ~ '^\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}$' THEN
    v_pay_date := greatest(split_part(p_period, '/', 1), split_part(p_period, '/', 2));
    PERFORM v_pay_date::date, split_part(p_period, '/', 1)::date;
  ELSIF p_period ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    v_pay_date := to_char((to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date, 'YYYY-MM-DD');
  ELSE
    RAISE EXCEPTION 'Cannot read the pay period "%".', p_period USING ERRCODE = '22023';
  END IF;

  -- Sent before? Hand back what is already saved and write nothing.
  SELECT * INTO v_existing FROM public.payroll WHERE id = p_run_id;
  IF FOUND THEN
    IF v_existing.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'That run id belongs to another shop.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('run', to_jsonb(v_existing), 'expenses', 0, 'replayed', true);
  END IF;

  -- advance: work out each person's recovery BEFORE anything is written. The
  -- client's own recovery figures, if any, are ignored: netPay as sent is what
  -- the person earned for this run.
  v_aware := coalesce(v_opts ->> 'advance_aware', '') = 'true';
  v_skip  := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_opts -> 'skip_advance') = 'array'
                                                         THEN v_opts -> 'skip_advance' ELSE '[]'::jsonb END));
  v_all   := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_opts -> 'recover_all') = 'array'
                                                         THEN v_opts -> 'recover_all' ELSE '[]'::jsonb END));

  -- advance: lock every open advance of everyone in the run, in one fixed
  -- order (by id), so two runs at once queue here instead of both taking the
  -- same money, and cannot deadlock each other.
  PERFORM 1 FROM public.staff_advances
   WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND status <> 'CANCELLED'
     AND employee_id IN (SELECT i ->> 'employeeId' FROM jsonb_array_elements(p_items) AS i)
   ORDER BY id FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_net := coalesce((v_item->>'netPay')::numeric, 0);
    IF v_net < 0 THEN
      RAISE EXCEPTION 'Net pay cannot be negative (%).', v_item->>'employeeName' USING ERRCODE = '22023';
    END IF;
    v_emp := v_item->>'employeeId';
    v_rec := 0;
    IF v_net > 0 AND coalesce(v_emp, '') <> '' AND NOT (v_emp = ANY (v_skip)) THEN
      v_left := v_net;
      FOR a IN SELECT advance_id, outstanding, recovery_per_run FROM public.staff_advance_status
                WHERE tenant_id = p_tenant_id AND employee_id = v_emp AND outstanding > 0
                ORDER BY given_on, created_at, advance_id LOOP
        EXIT WHEN v_left <= 0;
        v_take := least(v_left, a.outstanding,
                        CASE WHEN v_emp = ANY (v_all) THEN a.outstanding ELSE a.recovery_per_run END);
        CONTINUE WHEN v_take <= 0;
        v_plan := v_plan || jsonb_build_object('advance_id', a.advance_id, 'employee_id', v_emp, 'amount', v_take);
        v_ids := v_ids || a.advance_id;
        v_rec := v_rec + v_take;
        v_left := v_left - v_take;
      END LOOP;
    END IF;
    IF v_rec > 0 AND NOT v_aware THEN
      RAISE EXCEPTION 'APP_UPDATE_REQUIRED: % has a staff advance to take back from this pay. Update the app to run payroll.',
        coalesce(v_item->>'employeeName', 'Someone') USING ERRCODE = 'P0001';
    END IF;
    IF v_aware OR v_rec > 0 OR v_item ? 'advanceRecovered' OR v_item ? 'earnedNet' THEN
      v_item := v_item || jsonb_build_object('earnedNet', v_net, 'advanceRecovered', v_rec, 'netPay', v_net - v_rec);
    END IF;
    v_total_rec := v_total_rec + v_rec;
    v_items := v_items || jsonb_build_array(v_item);
  END LOOP;

  INSERT INTO public.payroll (
    id, tenant_id, period, items,
    total_base, total_net, total_overtime, total_commission, total_bonus, total_deductions,
    processed_at
  )
  SELECT
    p_run_id, p_tenant_id, p_period, v_items,
    coalesce(sum((i->>'basePay')::numeric), 0),
    coalesce(sum((i->>'netPay')::numeric), 0),
    coalesce(sum((i->>'overtime')::numeric), 0),
    coalesce(sum((i->>'commission')::numeric), 0),
    coalesce(sum((i->>'bonus')::numeric), 0),
    coalesce(sum((i->>'deductions')::numeric), 0),
    coalesce(p_processed_at, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  FROM jsonb_array_elements(v_items) AS i
  RETURNING * INTO v_existing;

  -- One salary expense per person paid. This is what puts the payout in
  -- DayBook and the P&L, and on the Cash / UPI / Bank account.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_net := coalesce((v_item->>'netPay')::numeric, 0);
    IF v_net < 0 THEN
      RAISE EXCEPTION 'Net pay cannot be negative (%).', v_item->>'employeeName' USING ERRCODE = '22023';
    END IF;
    -- advance: the recovered part, so the salary expense stays gross. Method
    -- ADVANCE: no cash moves, and the GL credits 1300.
    IF coalesce((v_item->>'advanceRecovered')::numeric, 0) > 0 THEN
      INSERT INTO public.expenses (id, tenant_id, category, amount, note, date, payment_method, payroll_id)
      VALUES (
        'PAYADV-' || p_run_id || '-' || (v_item->>'employeeId'),
        p_tenant_id, 'Salary', (v_item->>'advanceRecovered')::numeric,
        'Payroll ' || p_period || ' — ' || coalesce(v_item->>'employeeName', '') || ' (advance taken back)',
        v_pay_date, 'ADVANCE', p_run_id
      );
      v_expenses := v_expenses + 1;
    END IF;
    CONTINUE WHEN v_net = 0;
    IF coalesce(v_item->>'employeeId', '') = '' THEN
      RAISE EXCEPTION 'A pay line has no employee.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.expenses (id, tenant_id, category, amount, note, date, payment_method, payroll_id)
    VALUES (
      'PAY-' || p_run_id || '-' || (v_item->>'employeeId'),
      p_tenant_id, 'Salary', v_net,
      'Payroll ' || p_period || ' — ' || coalesce(v_item->>'employeeName', ''),
      v_pay_date, v_method, p_run_id
    );
    v_expenses := v_expenses + 1;
  END LOOP;

  -- advance: one RECOVERY entry per advance taken from.
  INSERT INTO public.staff_advance_entries
    (id, tenant_id, advance_id, employee_id, kind, amount, payroll_id, expense_id, on_date, created_by)
  SELECT 'ADVREC-' || p_run_id || '-' || (x ->> 'advance_id'), p_tenant_id, x ->> 'advance_id', x ->> 'employee_id',
         'RECOVERY', (x ->> 'amount')::numeric, p_run_id, 'PAYADV-' || p_run_id || '-' || (x ->> 'employee_id'),
         v_pay_date::date, (auth.uid())::text
    FROM jsonb_array_elements(v_plan) AS x;
  PERFORM public._staff_advance_refresh_status(p_tenant_id, v_ids);

  RETURN jsonb_build_object('run', to_jsonb(v_existing), 'expenses', v_expenses, 'replayed', false,
                            'advance_recovered', v_total_rec, 'recoveries', v_plan);
END;
$$;

-- Recreating a function grants EXECUTE to PUBLIC again. Put back exactly what
-- the old one had: authenticated (and service_role, which Supabase grants).
REVOKE ALL ON FUNCTION public.process_payroll_run(uuid, text, text, text, jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payroll_run(uuid, text, text, text, jsonb, text, jsonb) TO authenticated, service_role;

-- ── 10. delete a pay run in one step ───────────────────────────────────────
-- Soft-deletes the run's expenses (the existing triggers reverse the ledger
-- and the GL), its recovery entries and the run, and reopens the advances.
-- Safe to send twice; also finishes a delete the older app left half done.
CREATE OR REPLACE FUNCTION public.delete_payroll_run(p_tenant_id uuid, p_run_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run     public.payroll%ROWTYPE;
  v_ids     text[];
  v_exp     integer;
  v_entries integer;
BEGIN
  PERFORM public._payroll_run_guard(p_tenant_id);
  SELECT * INTO v_run FROM public.payroll WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'That pay run is not in this shop.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(DISTINCT advance_id), '{}') INTO v_ids
    FROM public.staff_advance_entries
   WHERE tenant_id = p_tenant_id AND payroll_id = p_run_id AND kind = 'RECOVERY';
  PERFORM 1 FROM public.staff_advances WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  UPDATE public.expenses SET deleted_at = now()
   WHERE tenant_id = p_tenant_id AND payroll_id = p_run_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_exp = ROW_COUNT;
  UPDATE public.staff_advance_entries SET deleted_at = now()
   WHERE tenant_id = p_tenant_id AND payroll_id = p_run_id AND kind = 'RECOVERY' AND deleted_at IS NULL;
  GET DIAGNOSTICS v_entries = ROW_COUNT;
  UPDATE public.payroll SET deleted_at = now()
   WHERE id = p_run_id AND deleted_at IS NULL;

  PERFORM public._staff_advance_refresh_status(p_tenant_id, v_ids);
  RETURN jsonb_build_object('run_id', p_run_id, 'already_deleted', v_run.deleted_at IS NOT NULL,
                            'expenses_reversed', v_exp, 'recoveries_reversed', v_entries);
END $$;

-- ── 11. grants on the callable functions ───────────────────────────────────
REVOKE ALL ON FUNCTION public.give_staff_advance(uuid, text, text, numeric, text, date, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_staff_advance(uuid, text, numeric, text, date, numeric, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_staff_advance(uuid, text)                                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_staff_advance(uuid, text, text, text, numeric, text, date)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_payroll_run(uuid, text)                                           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.give_staff_advance(uuid, text, text, numeric, text, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_advance(uuid, text, numeric, text, date, numeric, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_staff_advance(uuid, text)                                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_staff_advance(uuid, text, text, text, numeric, text, date)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_payroll_run(uuid, text)                                           TO authenticated;

-- ── 12. prove it ───────────────────────────────────────────────────────────
DO $check$
DECLARE
  v_bad text;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'process_payroll_run') <> 1 THEN
    RAISE EXCEPTION 'staff_advances: process_payroll_run has more than one signature';
  END IF;
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('give_staff_advance', 'update_staff_advance', 'cancel_staff_advance',
                       'settle_staff_advance', 'delete_payroll_run', 'process_payroll_run',
                       '_staff_advance_guard', '_payroll_run_guard', '_staff_advance_refresh_status',
                       '_staff_advance_json', '_staff_advance_post_given')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR NOT p.prosecdef);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'staff_advances: anon can run, or not SECURITY DEFINER: %', v_bad;
  END IF;
  IF has_table_privilege('anon', 'public.staff_advances', 'SELECT')
     OR has_table_privilege('anon', 'public.staff_advance_entries', 'SELECT')
     OR has_table_privilege('authenticated', 'public.staff_advances', 'INSERT')
     OR has_table_privilege('authenticated', 'public.staff_advance_entries', 'INSERT') THEN
    RAISE EXCEPTION 'staff_advances: table grants are wider than SELECT for authenticated';
  END IF;
  IF position('''ADVANCE''' in (SELECT prosrc FROM pg_proc WHERE proname = 'post_expense_to_ledger')) = 0
     OR position('''1300''' in (SELECT prosrc FROM pg_proc WHERE proname = 'gl_post_expenses')) = 0
     OR position('''1300''' in (SELECT prosrc FROM pg_proc WHERE proname = 'seed_tenant_chart_of_accounts')) = 0 THEN
    RAISE EXCEPTION 'staff_advances: a posting edit did not land';
  END IF;
END $check$;

NOTIFY pgrst, 'reload schema';
