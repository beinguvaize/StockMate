-- Phase 3: new sales write lines as well as the blob.
--
-- Three functions write sales.items -- process_sale, edit_sale and
-- process_sales_return -- and between them they are ~20,000 characters of
-- money-path SQL. Editing each means reproducing it in full, and a
-- transcription slip there is a silent accounting error rather than a build
-- failure. The same reasoning that kept the four money functions untouched
-- when services stopped writing stock rows applies here.
--
-- So the lines are DERIVED from the blob by a trigger. During dual-write the
-- blob is still the source of truth, which makes deriving from it exactly
-- right: the two cannot disagree, because one is computed from the other.
-- Agreement stops being something the nightly check hopes for and becomes
-- something the schema guarantees.
--
-- It also covers writers that do not exist yet. Anything that ever writes
-- sales.items gets lines for free.
--
-- WHAT HAPPENS IN PHASE 5. When the blob stops being written, this trigger is
-- dropped and the writers insert lines directly. That is the point at which
-- sale_items stops being derived and becomes the record itself. Sequencing it
-- this way front-loads none of the risk: today's change cannot alter a single
-- figure on a bill, because it only ever reads what the bill already says.

CREATE OR REPLACE FUNCTION public.sync_sale_items_from_blob()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  -- An UPDATE that did not actually change the lines rebuilds nothing.
  IF TG_OP = 'UPDATE' AND NEW.items IS NOT DISTINCT FROM OLD.items THEN
    RETURN NEW;
  END IF;

  -- Nothing below may abort the sale. The CASE guards cover the malformed
  -- values that can be anticipated; this block covers the ones that cannot.
  -- Both of the bugs found while testing this trigger -- a cast evaluated
  -- before its WHERE, and a coalesce applied to the test but not the value --
  -- would have rolled a real bill back at the counter, and neither was the
  -- kind of input the guards were written for. A derived ledger row is not
  -- worth refusing a customer's money over.
  --
  -- This is not swallowing the error: it is logged, and the sale then fails
  -- the nightly reconciliation as 'missing', which is how it gets noticed.
  BEGIN
  -- Rebuild rather than reconcile row by row: an edit can add, remove or
  -- reorder lines, and replacing the set is the only version of this that
  -- cannot leave a stale line behind.
  DELETE FROM public.sale_items WHERE sale_id = NEW.id;

  INSERT INTO public.sale_items
    (tenant_id, sale_id, line_no, product_id, product_name, hsn_code,
     quantity, rate, tax_rate, cess_rate)
  SELECT
    NEW.tenant_id,
    NEW.id,
    s.ord::int,
    (SELECT p.id FROM public.products p
      WHERE p.id = (s.it->>'id') AND p.tenant_id = NEW.tenant_id),
    s.it->>'name',
    nullif(trim(coalesce(s.it->>'hsn', '')), ''),
    s.quantity,
    s.rate,
    s.tax_rate,
    s.cess_rate
  FROM (
    SELECT
      e.ord,
      e.it,
      -- CASE, not a WHERE clause, is what makes this safe.
      --
      -- A WHERE that tests the text does NOT stop the SELECT list casting it:
      -- Postgres gives no evaluation-order guarantee between the two, and it
      -- does in fact cast first. A malformed quantity then raised inside the
      -- sale's own transaction and rolled the whole bill back -- the exact
      -- failure this trigger exists to avoid, reintroduced by the guard meant
      -- to prevent it. CASE is defined to evaluate only the arm it selects,
      -- so the cast can never run on a value that failed its test.
      CASE WHEN (e.it->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'quantity')::numeric END AS quantity,
      CASE WHEN (e.it->>'rate') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (e.it->>'rate')::numeric END AS rate,
      -- Tax is a rate, not an amount: an unreadable one defaults to zero
      -- rather than discarding an otherwise good line. The line total, which
      -- is what reconciliation compares, does not depend on it.
      CASE WHEN coalesce(e.it->>'taxRate', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'taxRate', '0')::numeric ELSE 0 END AS tax_rate,
      CASE WHEN coalesce(e.it->>'cess', '0') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN coalesce(e.it->>'cess', '0')::numeric ELSE 0 END AS cess_rate
    FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS e(it, ord)
  ) s
  -- A line this cannot represent is SKIPPED, not raised.
  --
  -- This trigger runs inside the transaction that records the sale. Raising
  -- here would roll the sale back -- a cashier with a customer at the counter
  -- would be unable to take the money because a ledger row failed a CHECK.
  -- The bill must always complete; a line that could not be copied shows up as
  -- a mismatch in the nightly reconciliation, which is the right place for it
  -- to be noticed. No production line in the last 60 days would be skipped.
  WHERE (s.it->>'name') IS NOT NULL
    AND s.quantity IS NOT NULL
    AND s.rate     IS NOT NULL
    AND s.quantity > 0;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_sale_items_from_blob failed for sale % (tenant %): %',
      NEW.id, NEW.tenant_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- UPDATE OF items, so the many updates that touch totals, status or payment
-- never rebuild the lines. process_sale's own "SET totalCogs" does not fire it.
DROP TRIGGER IF EXISTS trg_sync_sale_items ON public.sales;
CREATE TRIGGER trg_sync_sale_items
  AFTER INSERT OR UPDATE OF items ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_items_from_blob();
