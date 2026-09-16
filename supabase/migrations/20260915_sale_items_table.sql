-- Phase 1 of moving sale lines out of a JSON column into rows.
--
-- ADDITIVE ONLY. Nothing reads this table yet and nothing writes it except the
-- backfill below. sales.items remains the source of truth until the
-- reconciliation in phase 2 has been clean against live traffic. If the rest of
-- the plan never ships, this table is inert and costs nothing.
--
-- Why at all: a JSONB blob cannot be constrained, cannot be pointed at by a
-- foreign key, and cannot be joined. 5% of existing lines carry no tax rate and
-- 38% no cess field, because nothing was able to reject them. And 137 of 168
-- invoices hold a byte-identical copy of their sale's lines, with nothing
-- keeping the two equal.
--
-- Pre-flight against production, 4,311 lines: no missing product id, no missing
-- name, no null or non-positive quantity, no negative rate, and every product
-- id resolves to a live product. The constraints below therefore reject nothing
-- that exists. Three sales have no lines at all; all three are soft-deleted
-- test rows.

CREATE TABLE IF NOT EXISTS public.sale_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id),
  sale_id      text NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  line_no      int  NOT NULL,

  -- The product this line sold, where the catalogue still holds it.
  --
  -- NULLABLE, and null is meaningful: a product that was hard-deleted before
  -- soft-delete was enforced leaves lines pointing at nothing. Dev has such a
  -- row (product 3YANUH7Q8N); production has none today. Recording those as
  -- NULL is honest -- "this was sold, the catalogue entry is gone" -- and the
  -- snapshot below still says exactly what the customer was billed for, which
  -- is the part that matters legally.
  --
  -- The foreign key stays so that everything written from here on is
  -- guaranteed to resolve. No ON DELETE action: products are soft-deleted, so
  -- a hard delete is already intercepted, and one that got through should fail
  -- loudly rather than quietly orphan a bill line.
  product_id   text REFERENCES public.products(id),

  -- SNAPSHOTS, not lookups. A GST invoice is a legal record of what was sold on
  -- a date. Renaming a product in the catalogue must never rewrite a bill
  -- issued last year, so the name and code are frozen at sale time. product_id
  -- is for analysis; these two are for the document.
  product_name text NOT NULL,
  hsn_code     text,

  quantity     numeric NOT NULL CHECK (quantity > 0),
  rate         numeric NOT NULL CHECK (rate >= 0),
  tax_rate     numeric NOT NULL DEFAULT 0 CHECK (tax_rate  >= 0),
  cess_rate    numeric NOT NULL DEFAULT 0 CHECK (cess_rate >= 0),

  -- Generated, not stored-and-hoped: a redundant total that can be written
  -- independently is a total that will eventually disagree with its own line.
  -- This is the taxable value before tax and before the sale-level discount.
  line_total   numeric GENERATED ALWAYS AS (quantity * rate) STORED,

  -- House convention. The phase-0 migration that adds these by looping over
  -- pg_tables has already run, so a table created now would never get them --
  -- which is exactly how appointments ended up unable to sync offline.
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,

  UNIQUE (sale_id, line_no)
);

-- There is deliberately NO per-line discount column. The stored JSON has no
-- such key -- discount is recorded once on sales.discount for the whole bill.
-- A column that would be zero on every one of 4,311 rows is invented
-- structure, and inventing structure in a ledger is how the next person comes
-- to believe a per-line discount was captured when it never was.

CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant  ON public.sale_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items (tenant_id, product_id);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.sale_items;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select ON public.sale_items;
CREATE POLICY tenant_select ON public.sale_items FOR SELECT
  USING ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()));

DROP POLICY IF EXISTS tenant_insert ON public.sale_items;
CREATE POLICY tenant_insert ON public.sale_items FOR INSERT
  WITH CHECK ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()));

-- USING and WITH CHECK both, so a row cannot be updated INTO another tenant --
-- the gap found on appointments.
DROP POLICY IF EXISTS tenant_update ON public.sale_items;
CREATE POLICY tenant_update ON public.sale_items FOR UPDATE
  USING      ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()))
  WITH CHECK ((tenant_id = (SELECT public.current_tenant_id())) OR (SELECT public.is_global_admin()));

DROP POLICY IF EXISTS tenant_delete ON public.sale_items;
CREATE POLICY tenant_delete ON public.sale_items FOR DELETE
  USING (((tenant_id = (SELECT public.current_tenant_id())) AND (SELECT public.is_tenant_admin()))
         OR (SELECT public.is_global_admin()));

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Idempotent: ON CONFLICT on (sale_id, line_no) means re-running changes
-- nothing. Missing taxRate becomes 0 rather than a guess -- those bills were
-- charged whatever their recorded total says, and inventing a rate now would
-- restate history rather than record it.

INSERT INTO public.sale_items
  (tenant_id, sale_id, line_no, product_id, product_name, hsn_code,
   quantity, rate, tax_rate, cess_rate, created_at)
SELECT
  s.tenant_id,
  s.id,
  e.ord::int,
  -- Only link a product that still exists; otherwise NULL. The snapshot below
  -- carries what was actually billed either way.
  (SELECT p.id FROM public.products p
    WHERE p.id = (e.it->>'id') AND p.tenant_id = s.tenant_id),
  e.it->>'name',
  nullif(trim(coalesce(e.it->>'hsn', '')), ''),
  (e.it->>'quantity')::numeric,
  (e.it->>'rate')::numeric,
  coalesce((e.it->>'taxRate')::numeric, 0),
  coalesce((e.it->>'cess')::numeric, 0),
  coalesce(s.created_at, now())
FROM public.sales s,
     LATERAL jsonb_array_elements(s.items) WITH ORDINALITY AS e(it, ord)
WHERE jsonb_typeof(s.items) = 'array'
ON CONFLICT (sale_id, line_no) DO NOTHING;
