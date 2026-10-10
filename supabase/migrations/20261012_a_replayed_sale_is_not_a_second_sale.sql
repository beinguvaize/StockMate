-- A replayed sale is not a second sale
-- ============================================================================
--
-- The offline outbox replays an RPC when the network comes back. docs/PRD.md
-- said that replay was "idempotent on p_id". It was not, for any of the three
-- functions below, and the consequences differ in kind:
--
--   process_sale          A bare INSERT INTO public.sales with no ON CONFLICT.
--                         A replay raises a unique violation, which the sync
--                         engines treat as an ordinary failure: six attempts on
--                         the backoff ladder and then FAILED, with the primary
--                         key error in lastError. The sale is already recorded,
--                         so nothing is lost -- but the queue reports a failure
--                         for a sale that is sitting in the books, and the
--                         owner has no way to tell that apart from one that
--                         genuinely did not land.
--
--   process_sales_return  Same shape, and accidentally safer: its INSERT is the
--                         first write in the body, so a replay fails before the
--                         stock restore rather than after it. Still a FAILED op
--                         for work that is done.
--
--   settle_client_payment THE ONE THAT MOVES MONEY TWICE. Its client_payments
--                         INSERT already carries ON CONFLICT (id) DO NOTHING,
--                         so it looks protected. It is not: the allocation loop
--                         runs BEFORE that insert and walks the customer's
--                         unpaid sales marking them paid. A replay allocates
--                         the same payment a second time, so bills the customer
--                         has not paid are marked PAID and the outstanding
--                         balance drops by twice the receipt. The ON CONFLICT
--                         protects the ledger row and nothing else.
--
--                         AND IT NEEDS A DIFFERENT GUARD FROM THE OTHER TWO.
--                         The first version of this migration guarded it the
--                         same way -- "has a client_payments row with this id
--                         already?" -- and measured on dev it did not fire:
--                         Rs 300 against a Rs 500 cash bill went to Rs 500 paid
--                         after two calls, the double allocation intact. The
--                         reason is in the body: when the receipt is fully
--                         absorbed by non-credit sales, v_payment_amount is 0
--                         and NO client_payments row is written at all, so
--                         there is no natural key to find on the replay. The
--                         marker has to be written unconditionally, which is
--                         what processed_ops below is for.
--
-- WHAT IS NOT HERE, AND WHY
--
--   edit_sale   Needs no guard. It reverses stock from the STORED sale and then
--               applies p_items, so on a replay the stored items are already
--               the new ones: it reverses and re-applies the same quantities
--               and the net movement is zero. Totals, status and COGS are
--               absolute writes, not deltas. Verified by reading the live body
--               rather than assumed. A guard here would be ceremony.
--
--   adjust_inventory_atomic   Genuinely a delta with no natural key -- "add 5"
--               replayed is "add 10" and there is nothing in the row to say it
--               already happened. It takes no p_id, so it cannot claim a
--               processed_ops row either without a new parameter, which means a
--               second signature and PGRST203 for every caller unless the old
--               one is dropped in the same breath. That belongs with the
--               ordering work, not bundled into a security-shaped fix. It is
--               called from the stock-adjust screen, not the till.
--
-- WHY THIS PATCHES BY ANCHOR INSTEAD OF PASTING THE BODIES
--
-- Prod and dev have drifted from each other, measured before writing this:
--
--     function                prod len   dev len   tenant guard
--     process_sale               7889      7109    prod only
--     edit_sale                  7520      6508    prod only
--     process_sales_return       4862      4025    prod only
--     settle_client_payment      2219      2219    both
--
-- A migration carrying a full copy would silently revert whichever database the
-- copy was not taken from -- that is how the costPrice COGS fallback would be
-- lost, and it is the reason 20260927_writers_own_the_sale_lines.sql invented
-- this pattern. This edits whatever each database actually has, and RAISES if
-- its anchor is not found exactly once, so it can never apply half-understood.
--
-- Every attribute of each function -- argument list, return type, volatility,
-- SECURITY DEFINER, search_path -- is read back from the catalog and reproduced,
-- rather than hardcoded. settle_client_payment returns jsonb and the other two
-- return void; edit_sale carries no search_path while process_sale does. Hard-
-- coding any of that is how a money function quietly changes name resolution.
--
-- CONCURRENCY, STATED PLAINLY
--
-- Two replays of the same op running at the same instant can both pass the
-- EXISTS check before either commits. The primary key then rejects one of them,
-- which is the correct outcome -- one sale, not two -- just a noisy failure
-- rather than a silent no-op. The guard removes the ordinary repeated-replay
-- case, which is the one that actually happens; it is not a substitute for the
-- primary key and does not pretend to be.
--
-- REVERSIBLE. The pre-patch source of all three is snapshotted below, so
-- restoring one is a CREATE OR REPLACE from _replay_guard_snapshot.

-- The claim ledger, for the function whose own rows cannot answer "did this
-- already run?". One row per (function, op id); the primary key is the guard.
-- Claiming is an INSERT, so two concurrent replays cannot both win it.
CREATE TABLE IF NOT EXISTS public.processed_ops (
  fn         text        NOT NULL,
  op_id      text        NOT NULL,
  tenant_id  uuid,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fn, op_id)
);

-- Written only from SECURITY DEFINER bodies, which run as the owner, so no
-- policy is needed and none is given: RLS on with no policy denies every
-- client, which is the intent.
ALTER TABLE public.processed_ops ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.processed_ops IS
  'Replay claims for RPCs whose own rows cannot prove they already ran. '
  'settle_client_payment writes no client_payments row when the receipt is '
  'fully absorbed by non-credit sales, so it claims here instead. A row means '
  'that op id has been applied; the primary key is what makes a replay a no-op.';

CREATE TABLE IF NOT EXISTS public._replay_guard_snapshot (
  taken_at  timestamptz NOT NULL DEFAULT now(),
  proname   text NOT NULL,
  args      text NOT NULL,
  prosrc    text NOT NULL
);

INSERT INTO public._replay_guard_snapshot (proname, args, prosrc)
SELECT p.proname, pg_get_function_arguments(p.oid), p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('process_sale', 'process_sales_return', 'settle_client_payment');

DO $patch$
DECLARE
  r          record;
  v_src      text;
  v_new      text;
  v_anchor   text;
  v_hits     int;
  v_guard    text;
  v_done     text[] := '{}';
  -- proname, how it proves it already ran ('row' = its own table, 'claim' =
  -- processed_ops), the table for the 'row' kind, and the early return.
  targets    text[][] := ARRAY[
    ARRAY['process_sale',          'row',   'sales',           'RETURN;'],
    ARRAY['process_sales_return',  'row',   'sales_returns',   'RETURN;'],
    ARRAY['settle_client_payment', 'claim', '',
          'RETURN jsonb_build_object(''duplicate'', true, ''allocated'', 0, ''unallocated'', 0, ''cash_sale_portion'', 0, ''payment_row_amount'', 0);']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    SELECT p.oid,
           p.prosrc,
           pg_get_function_arguments(p.oid) AS args,
           pg_get_function_result(p.oid)    AS result,
           p.prosecdef,
           p.provolatile,
           p.proconfig
      INTO r
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = targets[i][1];

    IF r IS NULL THEN
      -- Absent on this database rather than changed. Dev does not have every
      -- function prod has; skipping loudly beats failing a tidy-up migration.
      RAISE NOTICE 'skipped %: not present on this database', targets[i][1];
      CONTINUE;
    END IF;

    v_src := r.prosrc;

    -- Already guarded: this migration is safe to run twice.
    IF position('-- replay guard' in v_src) > 0 THEN
      RAISE NOTICE 'skipped %: already carries the replay guard', targets[i][1];
      CONTINUE;
    END IF;

    IF targets[i][2] = 'claim' THEN
      -- Claim the op id. ON CONFLICT DO NOTHING leaves FOUND false when the
      -- row was already there, which IS the replay signal.
      v_guard :=
        '  -- replay guard: the outbox replays this op when the network returns.' || E'\n' ||
        '  -- This one claims an id rather than looking for its own row: a receipt' || E'\n' ||
        '  -- fully absorbed by non-credit sales writes no client_payments row.' || E'\n' ||
        '  INSERT INTO public.processed_ops (fn, op_id, tenant_id)' || E'\n' ||
        '  VALUES (''' || targets[i][1] || ''', p_id, p_tenant_id)' || E'\n' ||
        '  ON CONFLICT DO NOTHING;' || E'\n' ||
        '  IF NOT FOUND THEN' || E'\n' ||
        '    ' || targets[i][4] || E'\n' ||
        '  END IF;' || E'\n\n';
    ELSE
      v_guard :=
        '  -- replay guard: the outbox replays this op when the network returns.' || E'\n' ||
        '  IF EXISTS (SELECT 1 FROM public.' || targets[i][3] || E'\n' ||
        '              WHERE id = p_id' || E'\n' ||
        '                AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)) THEN' || E'\n' ||
        '    ' || targets[i][4] || E'\n' ||
        '  END IF;' || E'\n\n';
    END IF;

    -- Anchor AFTER the tenant guard where one exists, so a caller from another
    -- tenant still gets 'Access denied' rather than a silent return that tells
    -- them the id exists. Where there is none -- dev, for three of these -- fall
    -- back to the line that opens the body.
    v_anchor := '  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN'
             || E'\n' || '    RAISE EXCEPTION ''Access denied'';' || E'\n' || '  END IF;' || E'\n';

    IF position(v_anchor in v_src) > 0 THEN
      SELECT count(*) INTO v_hits
        FROM regexp_matches(v_src, 'RAISE EXCEPTION ''Access denied''', 'g');
      IF v_hits <> 1 THEN
        RAISE EXCEPTION '%: tenant guard found % times, expected exactly 1', targets[i][1], v_hits;
      END IF;
      v_new := replace(v_src, v_anchor, v_anchor || E'\n' || v_guard);
    ELSE
      SELECT count(*) INTO v_hits
        FROM regexp_matches(v_src, '(?n)^[ \t]*BEGIN[ \t]*$', 'g');
      IF v_hits <> 1 THEN
        RAISE EXCEPTION '%: body-opening BEGIN found % times, expected exactly 1 -- guard it by hand',
          targets[i][1], v_hits;
      END IF;
      v_new := regexp_replace(v_src, '(?n)^([ \t]*BEGIN[ \t]*)$',
                              '\1' || E'\n' || replace(v_guard, '\', '\\'));
    END IF;

    IF v_new = v_src THEN
      RAISE EXCEPTION '%: anchor matched but nothing changed', targets[i][1];
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s %s %s AS %L',
      targets[i][1],
      r.args,
      r.result,
      CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN r.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
      COALESCE((SELECT string_agg('SET ' || split_part(c, '=', 1) || ' TO ' || quote_literal(split_part(c, '=', 2)), ' ')
                  FROM unnest(r.proconfig) AS c), ''),
      v_new);

    v_done := v_done || targets[i][1];
  END LOOP;

  RAISE NOTICE 'replay guard added to: %', COALESCE(array_to_string(v_done, ', '), 'nothing');
END $patch$;

-- Prove it, rather than report a success the patch did not achieve.
DO $check$
DECLARE
  v_open text[];
BEGIN
  SELECT array_agg(p.proname ORDER BY p.proname) INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('process_sale', 'process_sales_return', 'settle_client_payment')
     AND position('-- replay guard' in p.prosrc) = 0;

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'still replayable: %', array_to_string(v_open, ', ');
  END IF;
END $check$;

COMMENT ON TABLE public._replay_guard_snapshot IS
  'Pre-patch source of process_sale, process_sales_return and settle_client_payment, '
  'taken by 20261012 before the replay guards were injected. Restoring one is a '
  'CREATE OR REPLACE from the row.';
