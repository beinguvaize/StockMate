-- Phase 4 prerequisite: let sale_items represent every line the app can write.
--
-- Phase 4 moves readers off sales.items. A reader can only move once the table
-- holds everything that reader needs, and an audit of the web writer found
-- three things it can put on a line that the table cannot hold:
--
--   * discount      -- read by gstReporting.js when computing the TAXABLE
--                      VALUE on GSTR-1. Dropping it would understate tax on a
--                      statutory return.
--   * unit / uqc    -- the unit of measure on the GSTR-1 HSN summary.
--   * imeis[]       -- serial numbers captured at the counter, printed on the
--                      bill. A serialised sale that loses its serials cannot
--                      be matched to the goods that left the shop.
--   * sellUnitName / sellQty / sellUnitPrice
--                   -- the alt-unit snapshot, so a receipt can print
--                      "4 Packet @ Rs 40" without re-deriving the conversion
--                      from a product whose conversion may since have changed.
--
-- NONE of these appears in production today: across all 4,292 live lines the
-- keys are absent entirely, so this is forward-looking and backfills nothing.
-- They are live code paths though, not dead ones -- this tenant just does not
-- use serial tracking or secondary units. A tenant that does would have lost
-- them silently at Phase 5, which is the kind of loss nobody notices until a
-- warranty claim or a GST notice.
--
-- Serials are their OWN TABLE rather than an array column. A serial is a thing
-- in its own right -- it identifies a physical unit, it is looked up, and it
-- will eventually need to join to warranty and returns. That is the same
-- reasoning that made sale_items a table instead of a blob.

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0
    CHECK (discount >= 0),
  -- Unit of measure as written on the bill. Text, not a FK: it is a SNAPSHOT,
  -- like product_name and hsn_code. Renaming a unit must not rewrite history.
  ADD COLUMN IF NOT EXISTS unit text,
  -- The alt-unit view of this line, snapshotted at sale time.
  ADD COLUMN IF NOT EXISTS sell_unit_name text,
  ADD COLUMN IF NOT EXISTS sell_qty numeric CHECK (sell_qty IS NULL OR sell_qty > 0),
  ADD COLUMN IF NOT EXISTS sell_unit_price numeric CHECK (sell_unit_price IS NULL OR sell_unit_price >= 0);

COMMENT ON COLUMN public.sale_items.discount IS
  'Per-line discount amount. Feeds the GSTR-1 taxable value; never a percentage.';
COMMENT ON COLUMN public.sale_items.unit IS
  'Unit of measure, snapshotted at sale time. Feeds the GSTR-1 HSN summary UQC.';

-- ── Serials ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sale_item_serials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  serial       text NOT NULL CHECK (length(trim(serial)) > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  -- The same serial cannot be sold twice on one line. Across lines is a real
  -- business question (a returned-then-resold unit is legitimate), so it is
  -- deliberately NOT constrained here.
  UNIQUE (sale_item_id, serial)
);

CREATE INDEX IF NOT EXISTS sale_item_serials_tenant_idx
  ON public.sale_item_serials (tenant_id);
CREATE INDEX IF NOT EXISTS sale_item_serials_serial_idx
  ON public.sale_item_serials (tenant_id, serial);

ALTER TABLE public.sale_item_serials ENABLE ROW LEVEL SECURITY;

-- Mirrors the sale_items policies exactly. tenant_update carries both USING
-- and WITH CHECK, so a row cannot be moved to another tenant by updating it.
DROP POLICY IF EXISTS sale_item_serials_tenant_select ON public.sale_item_serials;
CREATE POLICY sale_item_serials_tenant_select ON public.sale_item_serials
  FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.is_global_admin());

DROP POLICY IF EXISTS sale_item_serials_tenant_insert ON public.sale_item_serials;
CREATE POLICY sale_item_serials_tenant_insert ON public.sale_item_serials
  FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_global_admin());

DROP POLICY IF EXISTS sale_item_serials_tenant_update ON public.sale_item_serials;
CREATE POLICY sale_item_serials_tenant_update ON public.sale_item_serials
  FOR UPDATE USING (tenant_id = public.current_tenant_id() OR public.is_global_admin())
         WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_global_admin());

DROP POLICY IF EXISTS sale_item_serials_tenant_delete ON public.sale_item_serials;
CREATE POLICY sale_item_serials_tenant_delete ON public.sale_item_serials
  FOR DELETE USING (tenant_id = public.current_tenant_id() OR public.is_global_admin());
