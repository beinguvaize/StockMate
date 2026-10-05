-- Index the foreign keys that are actually followed
-- ============================================================================
--
-- 102 foreign keys have no index on their own columns. Indexing all 102 would
-- be the wrong fix: an index costs write time and storage on every insert
-- whether or not anything reads it, and the previous migration in this series
-- exists because 82 indexes on this database have never been scanned once.
-- Adding a hundred more would be solving an advisor warning rather than a
-- problem.
--
-- An unindexed foreign key costs something in exactly two situations:
--
--   1. A query joins or filters on it. Without an index that is a sequential
--      scan of the child table.
--   2. The parent row is deleted. Postgres must find the children, and with
--      CASCADE, SET NULL or RESTRICT it does that on every parent delete --
--      again by sequential scan.
--
-- So the seven below are the ones where the child table holds real rows AND the
-- column is genuinely followed, by the app or by a function. Each is named with
-- what follows it. The other 95 are left deliberately: most are on tables that
-- are still empty, where a sequential scan of nothing costs nothing, and they
-- can be added when those features carry data.

-- gl_lines.account_id — 8,542 rows. get_gl_balances groups the whole ledger by
-- account; the GL and P&L screens are the heaviest read in the app.
CREATE INDEX IF NOT EXISTS idx_gl_lines_account
  ON public.gl_lines (account_id);

-- sale_items.product_id — 4,786 rows. Every product history, every COGS
-- figure, and the thirteen places the app filters sale lines by product.
CREATE INDEX IF NOT EXISTS idx_sale_items_product
  ON public.sale_items (product_id);

-- account_transactions.account_id — 1,994 rows, ON DELETE CASCADE. The ledger
-- is read per account, and deleting an account scans this table today.
CREATE INDEX IF NOT EXISTS idx_account_transactions_account
  ON public.account_transactions (account_id);

-- movement_log.warehouse_id — 4,260 rows. Stock movement is read per location.
CREATE INDEX IF NOT EXISTS idx_movement_log_warehouse
  ON public.movement_log (warehouse_id);

-- product_batches.product_id — 316 rows, ON DELETE CASCADE. Small today, but
-- consume_fifo and restore_fifo walk batches BY PRODUCT on every sale and every
-- reversal, which is the hottest path in the app.
CREATE INDEX IF NOT EXISTS idx_product_batches_product
  ON public.product_batches (product_id);

-- product_batches.warehouse_id — van and warehouse stock are read per location.
CREATE INDEX IF NOT EXISTS idx_product_batches_warehouse
  ON public.product_batches (warehouse_id);

-- invoices.client_id — 192 rows. The client statement reads every invoice for
-- one client, which is the screen that produced the ₹27,970 bug.
CREATE INDEX IF NOT EXISTS idx_invoices_client
  ON public.invoices (client_id);

-- DELIBERATELY NOT INDEXED, with the reason, so the next person does not have
-- to re-derive it:
--
--   sales.terms_id, purchases.terms_id   payment_terms is a handful of rows and
--                                        nothing filters by it
--   sales.cashier_id                     never filtered; auth.users deletes are
--                                        not a normal operation
--   products.tax_rate_id                 422 rows, never filtered
--   clients.group_id                     59 rows
--   ~90 others                           on tables with no rows yet
