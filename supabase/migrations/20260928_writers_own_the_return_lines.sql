-- Phase 5b, step 2b: process_sales_return writes sales_return_items itself,
-- and the derive-from-blob trigger is dropped. The mirror of step 2, done in
-- one migration because returns never had the separate extraction step.
--
-- SAME ORDERING TRAP AS SALES
--
-- trg_gl_sales_returns is a NON-DEFERRABLE AFTER INSERT/UPDATE trigger on
-- sales_returns and reads sales_return_items. It fires at the END of the
-- INSERT statement -- before the next line of process_sales_return. Writing
-- the lines after the INSERT would post the return against an EMPTY line
-- table: the credit note would reverse no revenue, no GST and no COGS.
--
-- So the lines are written BEFORE the sale returns row, which needs
-- sales_return_items_return_id_fkey to become deferrable, exactly as
-- sale_items_sale_id_fkey did.
--
-- WHY WRITING ABOVE THE INSERT IS SAFE HERE
--
-- process_sales_return opens with a load-bearing comment: the INSERT is first
-- so that a duplicated offline replay hits the primary key and aborts BEFORE
-- any stock moves. That guard is untouched. The line write added above it
-- moves no stock, and on a duplicate replay the PK violation aborts the whole
-- transaction, rolling the line write back with everything else.
--
-- It also reads the same data. The cost of a returned unit comes from the
-- ORIGINAL sale's sale_batch_consumption, and process_sales_return only
-- restores those batches AFTER the INSERT -- so consumption is un-restored at
-- both the old write point and the new one, and cost_price is identical.
--
-- THE EXTRA PARAMETER
--
-- Unlike sale lines, a return line's cost is not in the blob: it is looked up
-- from the original sale. So this function takes p_sale_id as well, and the
-- COALESCE(batch unit_cost, products."costPrice", 0) chain is reproduced
-- VERBATIM -- it is the "return cost is recorded, not recomputed" fix, and
-- re-deriving it differently here is how the GL and P&L drifted apart before.

CREATE OR REPLACE FUNCTION public.write_sales_return_lines(
  p_return_id text,
  p_tenant_id uuid,
  p_sale_id   text,
  p_items     jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN; END IF;

  BEGIN
  DELETE FROM public.sales_return_items WHERE return_id = p_return_id;

  INSERT INTO public.sales_return_items
    (tenant_id, return_id, line_no, product_id, product_name, hsn_code,
     quantity, rate, tax_rate, cess_rate, cost_price)
  SELECT p_tenant_id, p_return_id, s.ord::int,
    prod.id,
    s.it->>'name',
    nullif(trim(coalesce(s.it->>'hsn', '')), ''),
    s.quantity, s.rate, s.tax_rate, s.cess_rate,
    COALESCE(
      (SELECT c.unit_cost FROM public.sale_batch_consumption c
        WHERE c.sale_id = p_sale_id AND c.product_id = prod.id AND c.deleted_at IS NULL
        ORDER BY c.created_at LIMIT 1),
      prod."costPrice",
      0)
  FROM (
    SELECT e.ord, e.it,
      CASE WHEN (e.it->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'quantity')::numeric END AS quantity,
      CASE WHEN (e.it->>'rate') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'rate')::numeric END AS rate,
      CASE WHEN coalesce(e.it->>'taxRate', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'taxRate', '0')::numeric ELSE 0 END AS tax_rate,
      CASE WHEN coalesce(e.it->>'cess', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'cess', '0')::numeric ELSE 0 END AS cess_rate
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(it, ord)
  ) s
  LEFT JOIN public.products prod
    ON prod.id = (s.it->>'id') AND prod.tenant_id = p_tenant_id
  WHERE (s.it->>'name') IS NOT NULL
    AND s.quantity IS NOT NULL AND s.rate IS NOT NULL AND s.quantity > 0;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'write_sales_return_lines failed for return % (tenant %): %',
      p_return_id, p_tenant_id, SQLERRM;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.write_sales_return_lines(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public._phase5b_fn_snapshot (
  taken_at  timestamptz NOT NULL DEFAULT now(),
  proname   text NOT NULL,
  args      text NOT NULL,
  prosrc    text NOT NULL
);

INSERT INTO public._phase5b_fn_snapshot (proname, args, prosrc)
SELECT p.proname, pg_get_function_arguments(p.oid), p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'process_sales_return';

ALTER TABLE public.sales_return_items
  DROP CONSTRAINT sales_return_items_return_id_fkey,
  ADD CONSTRAINT sales_return_items_return_id_fkey FOREIGN KEY (return_id)
      REFERENCES public.sales_returns(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

DO $patch$
DECLARE
  v_src text; v_args text; v_new text; v_anchor text; v_hits int;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid) INTO v_src, v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'process_sales_return';
  v_anchor := '  INSERT INTO public.sales_returns (';
  SELECT count(*) INTO v_hits FROM regexp_matches(v_src, 'INSERT INTO public\.sales_returns \(', 'g');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'process_sales_return anchor found % times, expected exactly 1', v_hits;
  END IF;
  v_new := replace(v_src, v_anchor,
    '  SET CONSTRAINTS public.sales_return_items_return_id_fkey DEFERRED;' || E'\n' ||
    '  PERFORM public.write_sales_return_lines(p_id, p_tenant_id, p_sale_id, p_items);' || E'\n\n' || v_anchor);
  -- process_sales_return has no search_path set on it today; reproduced as-is
  -- rather than silently changing name resolution inside a money function.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.process_sales_return(%s) RETURNS void '
    'LANGUAGE plpgsql SECURITY DEFINER AS %L',
    v_args, v_new);
END $patch$;

DROP TRIGGER IF EXISTS trg_a_sync_sales_return_items ON public.sales_returns;
