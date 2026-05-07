-- Add GST taxRate column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS "taxRate" numeric(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN products."taxRate" IS 'GST tax slab percentage (0, 5, 12, 18, 28)';
