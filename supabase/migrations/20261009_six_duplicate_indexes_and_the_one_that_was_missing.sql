-- Six duplicate indexes, and the one that was missing
-- ============================================================================
--
-- Six pairs of indexes on this database are byte-identical in definition and
-- differ only in name. Every write to those tables maintains both copies, and
-- both sit in memory competing for the same cache.
--
-- Which of each pair to drop was not a judgement call: pg_stat_user_indexes
-- had already decided.
--
--   kept                                      scans   dropped                                scans
--   idx_inventory_balances_tenant_product      7884   idx_inventory_balances_product             0
--   idx_purchases_tenant_created               4375   idx_purchases_tenant_date                  0
--   idx_client_payments_created                  66   idx_client_payments_date                   0
--   idx_sales_tenant_created                     29   idx_sales_tenant_date                      0
--   idx_audit_log_tenant_created                  4   audit_log_tenant_created_idx               0
--   idx_expenses_tenant_created                   0   idx_expenses_tenant_date                   0
--
-- THE MORE INTERESTING HALF
--
-- Look at the names being dropped. idx_sales_tenant_date is defined on
-- (tenant_id, created_at DESC). The name says date; the column is created_at.
-- So does idx_purchases_tenant_date, and idx_expenses_tenant_date.
--
-- They have zero scans not because they are redundant copies -- though they are
-- -- but because a query filtering on `date` cannot use an index on
-- `created_at`. Somebody meant to index the business date and indexed the row's
-- insertion timestamp instead, and the misnamed index has been standing in for
-- the real one ever since.
--
-- sales, purchases and expenses have NO index on (tenant_id, date). Every
-- date-ranged query runs a sequential scan: the day book, the client
-- statement's period filter, the GST return's range, every "this month" total
-- on the dashboard. invoices and client_payments have theirs, which is why only
-- these three are created here.
--
-- The column is text on all three, holding ISO YYYY-MM-DD, which sorts
-- lexicographically in the same order it sorts chronologically. A btree over
-- text is therefore usable for both the equality and the range queries the app
-- actually issues. Changing the column to a date type is a larger and separate
-- question; this index is correct either way.
--
-- Not CONCURRENTLY: that cannot run inside a transaction, and a migration that
-- is not one statement is a migration that can half-apply. These tables are
-- small -- 1,645 sales, 277 purchases -- so the brief lock costs less than the
-- risk.

-- ── The duplicates ─────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.audit_log_tenant_created_idx;
DROP INDEX IF EXISTS public.idx_client_payments_date;
DROP INDEX IF EXISTS public.idx_expenses_tenant_date;
DROP INDEX IF EXISTS public.idx_inventory_balances_product;
DROP INDEX IF EXISTS public.idx_purchases_tenant_date;
DROP INDEX IF EXISTS public.idx_sales_tenant_date;

-- ── The index those names were promising ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_tenant_business_date
  ON public.sales (tenant_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_tenant_business_date
  ON public.purchases (tenant_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_business_date
  ON public.expenses (tenant_id, date DESC);

-- Named _business_date rather than _date on purpose: _date is what the dropped
-- ones were called, and reusing the name would make the mistake easy to repeat.
