-- Returns get the same treatment sales got, so their GL posting can stop
-- reading a JSON blob.
--
-- gl_post_sales_returns could NOT simply be pointed at sale_items: a return's
-- lines are its OWN data, not the sale's. Only 1 of 5 live returns is even
-- linked to a sale -- a customer can bring goods back without the original
-- bill. So returns need their own table, and this is Phases 1-3 for returns
-- compressed into one migration, which is affordable at 5 returns / 6 lines.
--
-- Mirrors sale_items deliberately: snapshot name, generated line_total, a
-- nullable product FK so an orphaned product does not block the row, and the
-- same four RLS policies with WITH CHECK on update.

CREATE TABLE IF NOT EXISTS public.sales_return_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  return_id      text NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  line_no        int  NOT NULL,
  product_id     text REFERENCES public.products(id),
  product_name   text NOT NULL,
  hsn_code       text,
  quantity       numeric NOT NULL CHECK (quantity > 0),
  rate           numeric NOT NULL CHECK (rate >= 0),
  tax_rate       numeric NOT NULL DEFAULT 0,
  cess_rate      numeric NOT NULL DEFAULT 0,
  line_total     numeric GENERATED ALWAYS AS (quantity * rate) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (return_id, line_no)
);

CREATE INDEX IF NOT EXISTS sales_return_items_tenant_idx ON public.sales_return_items (tenant_id);
CREATE INDEX IF NOT EXISTS sales_return_items_return_idx ON public.sales_return_items (return_id);

ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_return_items_tenant_select ON public.sales_return_items;
CREATE POLICY sales_return_items_tenant_select ON public.sales_return_items
  FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.is_global_admin());
DROP POLICY IF EXISTS sales_return_items_tenant_insert ON public.sales_return_items;
CREATE POLICY sales_return_items_tenant_insert ON public.sales_return_items
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_global_admin());
DROP POLICY IF EXISTS sales_return_items_tenant_update ON public.sales_return_items;
CREATE POLICY sales_return_items_tenant_update ON public.sales_return_items
  FOR UPDATE USING (tenant_id = public.current_tenant_id() OR public.is_global_admin())
         WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_global_admin());
DROP POLICY IF EXISTS sales_return_items_tenant_delete ON public.sales_return_items;
CREATE POLICY sales_return_items_tenant_delete ON public.sales_return_items
  FOR DELETE USING (tenant_id = public.current_tenant_id() OR public.is_global_admin());

-- Same derive-from-the-blob trigger as sales, same guards: a line that cannot
-- be represented is SKIPPED, never raised, because a refund at the counter
-- must complete even if a ledger row cannot.
CREATE OR REPLACE FUNCTION public.sync_sales_return_items_from_blob()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.items IS NOT DISTINCT FROM OLD.items THEN RETURN NEW; END IF;

  BEGIN
  DELETE FROM public.sales_return_items WHERE return_id = NEW.id;

  INSERT INTO public.sales_return_items
    (tenant_id, return_id, line_no, product_id, product_name, hsn_code,
     quantity, rate, tax_rate, cess_rate)
  SELECT NEW.tenant_id, NEW.id, s.ord::int,
    (SELECT p.id FROM public.products p
      WHERE p.id = (s.it->>'id') AND p.tenant_id = NEW.tenant_id),
    s.it->>'name',
    nullif(trim(coalesce(s.it->>'hsn', '')), ''),
    s.quantity, s.rate, s.tax_rate, s.cess_rate
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
    FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS e(it, ord)
  ) s
  WHERE (s.it->>'name') IS NOT NULL
    AND s.quantity IS NOT NULL AND s.rate IS NOT NULL AND s.quantity > 0;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_sales_return_items_from_blob failed for return % (tenant %): %',
      NEW.id, NEW.tenant_id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- The 'a_' prefix exists for the same reason it does on sales: the rows must
-- be in place before trg_gl_sales_returns reads them. Do not tidy it away.
DROP TRIGGER IF EXISTS trg_a_sync_sales_return_items ON public.sales_returns;
CREATE TRIGGER trg_a_sync_sales_return_items
  AFTER INSERT OR UPDATE OF items ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.sync_sales_return_items_from_blob();

-- Backfill the existing returns using the same rules the trigger applies.
INSERT INTO public.sales_return_items
  (tenant_id, return_id, line_no, product_id, product_name, hsn_code,
   quantity, rate, tax_rate, cess_rate)
SELECT r.tenant_id, r.id, s.ord::int,
  (SELECT p.id FROM public.products p
    WHERE p.id = (s.it->>'id') AND p.tenant_id = r.tenant_id),
  s.it->>'name',
  nullif(trim(coalesce(s.it->>'hsn', '')), ''),
  s.quantity, s.rate, s.tax_rate, s.cess_rate
FROM public.sales_returns r
CROSS JOIN LATERAL (
  SELECT e.ord, e.it,
    CASE WHEN (e.it->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (e.it->>'quantity')::numeric END AS quantity,
    CASE WHEN (e.it->>'rate') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN (e.it->>'rate')::numeric END AS rate,
    CASE WHEN coalesce(e.it->>'taxRate', '0') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN coalesce(e.it->>'taxRate', '0')::numeric ELSE 0 END AS tax_rate,
    CASE WHEN coalesce(e.it->>'cess', '0') ~ '^[0-9]+(\.[0-9]+)?$'
         THEN coalesce(e.it->>'cess', '0')::numeric ELSE 0 END AS cess_rate
  FROM jsonb_array_elements(r.items) WITH ORDINALITY AS e(it, ord)
) s
WHERE jsonb_typeof(r.items) = 'array'
  AND (s.it->>'name') IS NOT NULL
  AND s.quantity IS NOT NULL AND s.rate IS NOT NULL AND s.quantity > 0
ON CONFLICT (return_id, line_no) DO NOTHING;
