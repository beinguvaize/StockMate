-- ==============================================================================
-- NOT RUN: needs owner approval per shop.
-- ==============================================================================
-- Correction for stock write-offs posted before
-- 20261128_stock_write_off_moves_no_cash.sql. Run it ONLY after that migration
-- is on the database, ONE SHOP AT A TIME, after the owner has approved that
-- shop (it changes the shop's bank balance and its books).
--
-- What was wrong: each live expense with payment_method 'ADJUSTMENT' (written
-- by write_off_batch, category 'Inventory Write-off') has
--   * an OUT row in account_transactions (ref_type 'EXPENSE') on a BANK
--     account, although no money moved, and
--   * a journal Dr 5200 / Cr 1000 Cash, where it should credit 1200 Inventory.
-- What this does, for the one shop named below:
--   1. deletes those OUT rows (the bank balance goes back up by the total);
--   2. touches each expense so gl_post_expenses re-posts its journal under the
--      fixed rule (it drops the old journal and writes Dr 5200 / Cr 1200).
-- The expense rows themselves, and so the P&L, are unchanged.
--
-- Idempotent: a second run finds no OUT rows and re-posts the same journals.
-- Note: a closed Day Book day keeps the figures it was closed with; days after
-- it carry the corrected bank balance.
--
-- Usage: set the shop id in the first line, run the BEFORE query, run the
-- correction inside a transaction, run the AFTER query, COMMIT only if it
-- matches.

\set shop '''00000000-0000-0000-0000-000000000000'''

-- ── BEFORE: what will change ─────────────────────────────────────────────────
SELECT e.id, e.date, e.amount,
       (SELECT count(*) FROM public.account_transactions a
         WHERE a.tenant_id = e.tenant_id AND a.ref_type = 'EXPENSE' AND a.ref_id = e.id) AS cash_rows,
       (SELECT string_agg(g.code || ' ' || l.debit || '/' || l.credit, ', ' ORDER BY g.code)
          FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id
          JOIN public.gl_accounts g ON g.id = l.account_id
         WHERE j.tenant_id = e.tenant_id AND j.reference_type = 'EXPENSE' AND j.reference_id = e.id) AS journal
  FROM public.expenses e
 WHERE e.tenant_id = :shop AND e.deleted_at IS NULL AND upper(e.payment_method) = 'ADJUSTMENT'
 ORDER BY e.date;

BEGIN;

-- The fix must be in place, or step 2 would re-post the same wrong journal.
DO $$ BEGIN
  IF position('''ADJUSTMENT'' THEN ''1200''' in (SELECT prosrc FROM pg_proc WHERE proname = 'gl_post_expenses')) = 0 THEN
    RAISE EXCEPTION 'Apply 20261128_stock_write_off_moves_no_cash first.';
  END IF;
END $$;

-- 1. the BANK OUT rows that should never have been written
DELETE FROM public.account_transactions a
 USING public.expenses e
 WHERE a.tenant_id = :shop AND e.tenant_id = :shop
   AND a.ref_type = 'EXPENSE' AND a.ref_id = e.id
   AND e.deleted_at IS NULL AND upper(e.payment_method) = 'ADJUSTMENT';

-- 2. re-post each journal (gl_post_expenses fires on any UPDATE and re-posts)
UPDATE public.expenses SET updated_at = updated_at
 WHERE tenant_id = :shop AND deleted_at IS NULL AND upper(payment_method) = 'ADJUSTMENT';

-- ── AFTER: expect cash_rows = 0 and journal '1200 0/amount, 5200 amount/0' ──
SELECT e.id, e.date, e.amount,
       (SELECT count(*) FROM public.account_transactions a
         WHERE a.tenant_id = e.tenant_id AND a.ref_type = 'EXPENSE' AND a.ref_id = e.id) AS cash_rows,
       (SELECT string_agg(g.code || ' ' || l.debit || '/' || l.credit, ', ' ORDER BY g.code)
          FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id
          JOIN public.gl_accounts g ON g.id = l.account_id
         WHERE j.tenant_id = e.tenant_id AND j.reference_type = 'EXPENSE' AND j.reference_id = e.id) AS journal
  FROM public.expenses e
 WHERE e.tenant_id = :shop AND e.deleted_at IS NULL AND upper(e.payment_method) = 'ADJUSTMENT'
 ORDER BY e.date;

-- Every journal of the shop still balanced:
SELECT count(*) AS unbalanced_journals FROM (
  SELECT j.id FROM public.gl_journals j JOIN public.gl_lines l ON l.journal_id = j.id
   WHERE j.tenant_id = :shop GROUP BY j.id HAVING sum(l.debit) <> sum(l.credit)) b;

-- COMMIT;   -- only if AFTER matches; otherwise ROLLBACK;
ROLLBACK;
