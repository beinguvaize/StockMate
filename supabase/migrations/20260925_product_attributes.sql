-- ─────────────────────────────────────────────────────────────────────────────
-- A home for sector fields that is not another column.
--
-- products is already 43 columns wide, five of which belong to exactly one
-- vertical and are NULL for every other tenant: food_type, station,
-- modifier_groups and is_available are restaurant, duration_min is services.
-- Continuing that way puts the table past fifty columns to serve jewellery and
-- automotive, almost all of them empty, and docs/PLATFORM.md:219 already says
-- not to -- "vertical data in own tables + jsonb, not wide columns".
--
-- The existing flat columns are deliberately left alone. They work, they are
-- indexed, and rewriting them buys risk and nothing else. The split is the
-- point to remember: anything older than this migration is a column, anything
-- newer is a key in here. src/lib/sectorFields.js is the registry that decides
-- which keys are legal.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.attributes IS
  'Sector-specific fields, keyed by src/lib/sectorFields.js. Blank inputs are '
  'stored as ABSENT keys, never as empty strings: this column is searched with '
  '? and ->>, and a key present with '''' answers yes to the first and '''' to '
  'the second, which is how a blank field comes to look like a filled one.';

-- jsonb_path_ops rather than the default operator class: it is smaller and
-- faster for the containment queries this will actually get -- "every product
-- whose part_no is X" -- at the cost of key-existence operators, which the
-- catalog search does not use.
CREATE INDEX IF NOT EXISTS idx_products_attributes
  ON public.products USING gin (attributes jsonb_path_ops);
