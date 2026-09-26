-- ─────────────────────────────────────────────────────────────────────────────
-- Record the schema that is already live.
--
-- Production has drifted AHEAD of this repo. A clean `supabase db reset` builds
-- a database the application cannot run against: sixteen columns, two tables
-- and a widened CHECK constraint exist in production and in no migration here.
-- They were applied by hand.
--
-- Nothing in this file changes production. Every statement is a no-op there and
-- a repair on a fresh database. The point is that the two stop disagreeing, so
-- that the next person to run a reset gets the schema the code expects, and so
-- that the sector work about to land on `products` builds on something
-- reproducible.
--
-- Verified against production before writing: types, defaults and nullability
-- below are what `information_schema` reports, not what seemed reasonable.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── products ────────────────────────────────────────────────────────────────
-- Read and written by src/pages/inventory/components/AddItemModal.jsx:24 and
-- its save payload at :194-216. Every one of these has been live for months.
ALTER TABLE public.products
  -- Price tiers. resolve_price() and src/lib/priceResolver.js:41-48 both read
  -- these; clients.price_tier selects between them.
  ADD COLUMN IF NOT EXISTS wholesale_price    numeric,
  ADD COLUMN IF NOT EXISTS distributor_price  numeric,
  -- Whether sellingPrice already contains the tax.
  ADD COLUMN IF NOT EXISTS price_inclusive    boolean NOT NULL DEFAULT false,
  -- TAXABLE | EXEMPT | NIL | ZERO. AddItemModal zeroes taxRate and cess_rate
  -- when this is not TAXABLE.
  ADD COLUMN IF NOT EXISTS tax_status         text    NOT NULL DEFAULT 'TAXABLE',
  ADD COLUMN IF NOT EXISTS cess_rate          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_margin         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS barcode            text,
  ADD COLUMN IF NOT EXISTS barcode_type       text    DEFAULT 'EAN13',
  -- Serialized stock (IMEI, chassis, battery). See the note below.
  ADD COLUMN IF NOT EXISTS track_serial       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS batch_tracking     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_stock          numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock          numeric(14,3),
  ADD COLUMN IF NOT EXISTS reorder_qty        numeric(14,3),
  ADD COLUMN IF NOT EXISTS tax_rate_id        text;

-- `mrp` and `discount` are deliberately NOT created.
--
-- src/hooks/useInventory.js:12 lists them in NUMERIC_PRODUCT_COLS and coerces
-- them on every read, but they have never existed as columns in production and
-- nothing writes them. Creating them to match the coercion list would be
-- inventing structure to justify dead code; the coercion is what is wrong.

-- ── product_batches ─────────────────────────────────────────────────────────
-- Both are read by RPCs that DO have migrations -- write_off_batch (:32),
-- resync_purchase_batch (:78), complete_production_order (:163) -- so a fresh
-- database fails inside functions this repo does define.
--
-- warehouse_id is `text`, not uuid, even though inventory_locations.id is uuid.
-- Recorded as it is rather than as it should be: correcting the type is a data
-- migration, not a drift capture, and mixing the two hides both.
ALTER TABLE public.product_batches
  ADD COLUMN IF NOT EXISTS warehouse_id       text,
  ADD COLUMN IF NOT EXISTS manufacturing_date date;

-- ── business_profile.tax_mode ───────────────────────────────────────────────
-- Production allows three values. 20260512_add_tax_mode_to_business_profile.sql
-- allows two. The third, 'NONE', is offered by src/pages/Settings.jsx:494, is
-- handled by the ledger (20260920_gl_honours_tax_mode_none_and_voids.sql) and
-- by sale_gst_amount (20260930_one_definition_of_gst.sql:49-60), and is in use
-- by real tenants today. The repo's constraint is the stale one.
ALTER TABLE public.business_profile
  DROP CONSTRAINT IF EXISTS business_profile_tax_mode_check;
ALTER TABLE public.business_profile
  ADD  CONSTRAINT business_profile_tax_mode_check
  CHECK (tax_mode IN ('INCLUSIVE', 'EXCLUSIVE', 'NONE'));

-- ── serial_numbers ──────────────────────────────────────────────────────────
-- Written by src/pages/sales/components/InvoiceBuilder.jsx:808-826 and read by
-- src/components/reports/IMEISerialReport.jsx:14. No CREATE TABLE anywhere in
-- this repo.
--
-- Production also carries a FK from warehouse_id to warehouses(id). It is
-- deliberately NOT recreated here: `warehouses` is itself prod-only with no
-- migration, so on the fresh database this file exists to repair there is
-- nothing to point at. An earlier draft added it inside a DO block guarded on
-- the table existing -- which made this migration MUTATE an existing database
-- (it added the FK to dev, which lacked it) instead of merely recording one.
-- A drift capture that changes a live schema is not a drift capture.
CREATE TABLE IF NOT EXISTS public.serial_numbers (
  id             text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  product_id     text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  serial_number  text NOT NULL,
  status         text DEFAULT 'in_stock',
  purchased_in_id text,
  sold_in_id     text REFERENCES public.sales(id),
  warehouse_id   text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (tenant_id, product_id, serial_number)
);

-- PROD AND DEV HAVE DRIFTED FROM EACH OTHER HERE, not just from this repo.
--   production: FKs to tenants/products/sales, UNIQUE(tenant, product, serial),
--               and no constraint on `status`.
--   dev:        a CHECK on status IN ('in_stock','sold','returned','damaged'),
--               and none of those FKs or the UNIQUE.
-- The shape above is PRODUCTION's, because that is the one the application has
-- to work against. Neither existing database is altered by this file; a
-- reconciliation is a separate, deliberate change with its own migration.

COMMENT ON TABLE public.serial_numbers IS
  'Per-unit serials (IMEI, chassis, battery). THE POS INSERT IS BROKEN: '
  'InvoiceBuilder.jsx:808-826 writes serial and sale_id where the columns are '
  'serial_number and sold_in_id, and writes status=SOLD where dev constrains '
  'status to lowercase. It is wrapped in a non-fatal catch, so it has always '
  'failed silently -- both this table and sale_item_serials hold zero rows. '
  'Latent rather than live only because no product has track_serial enabled. '
  'Fix the caller before shipping serialized stock to automotive or mobile.';
