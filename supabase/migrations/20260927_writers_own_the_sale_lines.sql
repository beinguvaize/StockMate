-- Phase 5b, step 2 of 3: process_sale and edit_sale write sale_items
-- themselves, and the derive-from-blob trigger is dropped.
--
-- WHY THE OBVIOUS VERSION OF THIS IS A MONEY BUG
--
-- The plan was "drop trg_a_sync_sale_items, call write_sale_lines after the
-- INSERT". That silently destroys GST.
--
-- trg_gl_sales is a NON-DEFERRABLE AFTER INSERT/UPDATE trigger on sales, and
-- since Phase 5a it reads sale_items. An AFTER ROW trigger fires at the end of
-- its statement -- so it runs BEFORE the next line of process_sale executes.
-- Write the lines after the INSERT and the ledger posts against an EMPTY
-- sale_items. Measured on dev, same sale both ways:
--
--     trigger in place        Revenue 847.46   Tax Payable 152.54
--     lines written after     Revenue 1000.00  Tax Payable ABSENT
--
-- Revenue overstated and the GST liability gone, with nothing raised. That is
-- the same class of defect as the Rs 1,93,376.98 phantom-GST restatement,
-- pointing the other way.
--
-- What this reveals: the blob's real job today is to SMUGGLE THE LINES INTO
-- THE STATEMENT so that AFTER triggers on sales can see them. Removing it is
-- therefore not a write-path change, it is an ordering change.
--
-- THE FIX: write the lines BEFORE the sale row.
--
-- edit_sale is easy -- the sale already exists, so the call simply moves above
-- the UPDATE whose triggers consume it.
--
-- process_sale cannot do that while sale_items.sale_id has an immediate
-- foreign key to a row that does not exist yet, so the constraint becomes
-- DEFERRABLE INITIALLY IMMEDIATE and process_sale defers it for its own
-- transaction. INITIALLY IMMEDIATE, not DEFERRED: every other writer keeps
-- today's instant enforcement, and only the function that genuinely needs the
-- window opens it.
--
-- WHY THE FUNCTIONS ARE PATCHED BY ANCHOR AND NOT PASTED
--
-- process_sale is 6,600 characters of money logic and dev is known to be
-- BEHIND prod on its COGS path. Pasting a full copy into a migration would
-- silently revert whichever environment the copy was not taken from -- that is
-- exactly how the costPrice COGS fallback could be lost. An anchored patch
-- edits whatever each database actually has, and RAISES if the anchor is not
-- found exactly once, so it can never apply half-understood.
--
-- REVERSIBLE. The blob is still written (step 3 removes that), so restoring
-- trg_a_sync_sale_items plus removing the two PERFORM lines returns the old
-- behaviour exactly. The pre-patch source of both functions is snapshotted
-- into _phase5b_fn_snapshot first.

CREATE TABLE IF NOT EXISTS public._phase5b_fn_snapshot (
  taken_at  timestamptz NOT NULL DEFAULT now(),
  proname   text NOT NULL,
  args      text NOT NULL,
  prosrc    text NOT NULL
);

INSERT INTO public._phase5b_fn_snapshot (proname, args, prosrc)
SELECT p.proname, pg_get_function_arguments(p.oid), p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('process_sale', 'edit_sale');

ALTER TABLE public.sale_items
  DROP CONSTRAINT sale_items_sale_id_fkey,
  ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id)
      REFERENCES public.sales(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

DO $patch$
DECLARE
  v_src text; v_args text; v_new text; v_anchor text; v_hits int;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_sale';
  v_anchor := '  INSERT INTO public.sales (';
  SELECT count(*) INTO v_hits FROM regexp_matches(v_src, 'INSERT INTO public\.sales \(', 'g');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'process_sale anchor found % times, expected exactly 1', v_hits;
  END IF;
  v_new := replace(v_src, v_anchor,
    '  SET CONSTRAINTS public.sale_items_sale_id_fkey DEFERRED;' || E'\n' ||
    '  PERFORM public.write_sale_lines(p_id, v_tenant_id, p_items);' || E'\n\n' || v_anchor);
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.process_sale(%s) RETURNS void '
    'LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L',
    v_args, v_new);

  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'edit_sale';
  v_anchor := '  UPDATE public.sales SET items = p_items,';
  SELECT count(*) INTO v_hits FROM regexp_matches(v_src, 'UPDATE public\.sales SET items = p_items,', 'g');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'edit_sale anchor found % times, expected exactly 1', v_hits;
  END IF;
  v_new := replace(v_src, v_anchor,
    '  PERFORM public.write_sale_lines(p_id, v_tenant_id, p_items);' || E'\n\n' || v_anchor);
  -- edit_sale has no search_path set on it today; this reproduces it as-is
  -- rather than silently changing name resolution inside a money function.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.edit_sale(%s) RETURNS void '
    'LANGUAGE plpgsql SECURITY DEFINER AS %L',
    v_args, v_new);
END $patch$;

-- The blob is no longer the source of the lines. It is still WRITTEN, so
-- audit_sale_items keeps comparing the two and remains a live, independent
-- check on the new direct writes -- which is what makes this step
-- self-verifying rather than merely tested.
DROP TRIGGER IF EXISTS trg_a_sync_sale_items ON public.sales;

-- sales_return_items still derives from its own blob via
-- trg_a_sync_sales_return_items. Returns are deliberately NOT changed here.
