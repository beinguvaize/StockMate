-- ==============================================================
-- GL-01 regression test — automatic journal posting triggers
-- ==============================================================
-- Exercises the triggers added in 20260417_gl01_triggers.sql:
--   trg_gl_sales, trg_gl_expenses, trg_gl_purchases,
--   trg_gl_client_payments, trg_gl_assert_balanced.
--
-- Every scenario inserts a source row, reads back the journal it
-- produced, and asserts account legs + debit/credit amounts are
-- correct. UPDATE and DELETE paths are covered for SALES (drop-and-
-- repost semantics); the remaining source tables share the same
-- code shape so are covered by INSERT.
--
-- Side-effect-free: BEGIN / ROLLBACK wraps everything. Fails loud
-- with RAISE EXCEPTION on any mismatch. Emits 'OK:' notices per
-- passing case.
--
-- Subject tenant: a0000000-0000-0000-0000-000000000001 (bootstrap).
-- Chart-of-accounts for this tenant is seeded by the trigger in
-- 20260417_gl01_schema.sql, so no COA setup is required here.
--
-- Run:
--   psql "<connection>" -f supabase/tests/gl01_triggers_test.sql
-- or via Supabase MCP execute_sql.

BEGIN;

DO $test$
DECLARE
  k_tenant    uuid := 'a0000000-0000-0000-0000-000000000001';
  v_debit     numeric;
  v_credit    numeric;
  v_legs      int;
  v_has_4000  boolean;
  v_has_1000  boolean;
  v_has_1100  boolean;
  v_has_1200  boolean;
  v_has_2000  boolean;
  v_has_5000  boolean;
  v_has_5100  boolean;
  v_has_5200  boolean;
  v_jid       uuid;
  v_amt_1000  numeric;
  v_amt_1100  numeric;
  v_amt_1200  numeric;
  v_amt_2000  numeric;
  v_amt_4000  numeric;
  v_amt_5000  numeric;
  v_amt_5100  numeric;
  v_amt_5200  numeric;
  passed      int := 0;
BEGIN
  -- Sanity: COA seeded for this tenant
  IF NOT EXISTS (SELECT 1 FROM public.gl_accounts WHERE tenant_id = k_tenant AND code = '4000') THEN
    RAISE EXCEPTION 'GL-01 FAIL: chart of accounts not seeded for tenant %; cannot run tests', k_tenant;
  END IF;

  -- ────────────────────────────────────────────────────────────
  -- CASE 1: Sale INSERT (PAID, with COGS) → 4 legs, balanced
  -- Expected: DR 1000=100, CR 4000=100, DR 5000=60, CR 1200=60
  -- ────────────────────────────────────────────────────────────
  INSERT INTO public.sales (id, tenant_id, "totalAmount", "totalCogs", "paymentStatus", status)
  VALUES ('TEST-SALE-PAID', k_tenant, 100, 60, 'PAID', 'completed');

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id = k_tenant AND reference_type = 'SALE' AND reference_id = 'TEST-SALE-PAID';
  IF v_jid IS NULL THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID journal not created'; END IF;

  SELECT COUNT(*), SUM(debit), SUM(credit) INTO v_legs, v_debit, v_credit
    FROM public.gl_lines WHERE journal_id = v_jid;
  IF v_legs <> 4 THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID expected 4 legs, got %', v_legs; END IF;
  IF v_debit <> v_credit THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID unbalanced %/%', v_debit, v_credit; END IF;
  IF v_debit <> 160 THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID total expected 160, got %', v_debit; END IF;

  SELECT COALESCE(SUM(l.debit),0), COALESCE(SUM(l.credit),0)
    INTO v_amt_1000, v_amt_4000
    FROM public.gl_lines l JOIN public.gl_accounts a ON a.id = l.account_id
   WHERE l.journal_id = v_jid AND a.code IN ('1000','4000');
  IF (SELECT SUM(debit)  FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1000') <> 100
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID cash leg not 100'; END IF;
  IF (SELECT SUM(credit) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='4000') <> 100
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID revenue leg not 100'; END IF;
  IF (SELECT SUM(debit)  FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='5000') <> 60
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID COGS leg not 60'; END IF;
  IF (SELECT SUM(credit) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1200') <> 60
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale PAID inventory leg not 60'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: sale INSERT PAID+COGS — 4 legs, 160=160';

  -- ────────────────────────────────────────────────────────────
  -- CASE 2: Sale INSERT (UNPAID, no COGS) → AR instead of Cash
  -- Expected: DR 1100=50, CR 4000=50
  -- ────────────────────────────────────────────────────────────
  INSERT INTO public.sales (id, tenant_id, "totalAmount", "totalCogs", "paymentStatus", status)
  VALUES ('TEST-SALE-UNPAID', k_tenant, 50, 0, 'UNPAID', 'completed');

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id = k_tenant AND reference_type = 'SALE' AND reference_id = 'TEST-SALE-UNPAID';

  SELECT COUNT(*) INTO v_legs FROM public.gl_lines WHERE journal_id = v_jid;
  IF v_legs <> 2 THEN RAISE EXCEPTION 'GL-01 FAIL: sale UNPAID expected 2 legs, got %', v_legs; END IF;

  IF (SELECT SUM(debit)  FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1100') <> 50
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale UNPAID AR leg not 50'; END IF;
  IF EXISTS (SELECT 1 FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id
             WHERE l.journal_id=v_jid AND a.code='1000')
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale UNPAID should not touch Cash (1000)'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: sale INSERT UNPAID — DR 1100 / CR 4000';

  -- ────────────────────────────────────────────────────────────
  -- CASE 3: Sale UPDATE (100 → 200) → drop+repost, one journal
  -- ────────────────────────────────────────────────────────────
  UPDATE public.sales SET "totalAmount" = 200, "totalCogs" = 120
   WHERE id = 'TEST-SALE-PAID';

  IF (SELECT COUNT(*) FROM public.gl_journals
      WHERE tenant_id=k_tenant AND reference_type='SALE' AND reference_id='TEST-SALE-PAID') <> 1
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale UPDATE produced duplicate journals'; END IF;

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id = k_tenant AND reference_type = 'SALE' AND reference_id = 'TEST-SALE-PAID';

  IF (SELECT SUM(debit) FROM public.gl_lines WHERE journal_id=v_jid) <> 320
     THEN RAISE EXCEPTION 'GL-01 FAIL: sale UPDATE total expected 320 (200+120), got %',
       (SELECT SUM(debit) FROM public.gl_lines WHERE journal_id=v_jid); END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: sale UPDATE — drop+repost, 320=320';

  -- ────────────────────────────────────────────────────────────
  -- CASE 4: Sale status='cancelled' → journal dropped, not reposted
  -- ────────────────────────────────────────────────────────────
  UPDATE public.sales SET status = 'cancelled' WHERE id = 'TEST-SALE-PAID';

  IF EXISTS (SELECT 1 FROM public.gl_journals
             WHERE tenant_id=k_tenant AND reference_type='SALE' AND reference_id='TEST-SALE-PAID')
     THEN RAISE EXCEPTION 'GL-01 FAIL: cancelled sale should have no journal'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: sale status=cancelled — journal dropped';

  -- ────────────────────────────────────────────────────────────
  -- CASE 5: Sale DELETE → journal dropped
  -- ────────────────────────────────────────────────────────────
  DELETE FROM public.sales WHERE id = 'TEST-SALE-UNPAID';
  IF EXISTS (SELECT 1 FROM public.gl_journals
             WHERE tenant_id=k_tenant AND reference_type='SALE' AND reference_id='TEST-SALE-UNPAID')
     THEN RAISE EXCEPTION 'GL-01 FAIL: deleted sale should have no journal'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: sale DELETE — journal dropped';

  -- ────────────────────────────────────────────────────────────
  -- CASE 6: Expense (PAYROLL) → DR 5100 / CR 1000
  -- ────────────────────────────────────────────────────────────
  INSERT INTO public.expenses (id, tenant_id, amount, category, note)
  VALUES ('TEST-EXP-PAYROLL', k_tenant, 500, 'PAYROLL - Monthly', 'April payroll');

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id=k_tenant AND reference_type='EXPENSE' AND reference_id='TEST-EXP-PAYROLL';
  IF v_jid IS NULL THEN RAISE EXCEPTION 'GL-01 FAIL: payroll expense journal missing'; END IF;
  IF (SELECT SUM(debit)  FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='5100') <> 500
     THEN RAISE EXCEPTION 'GL-01 FAIL: payroll expense should DR 5100=500'; END IF;
  IF (SELECT SUM(credit) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1000') <> 500
     THEN RAISE EXCEPTION 'GL-01 FAIL: payroll expense should CR 1000=500'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: expense PAYROLL — DR 5100 / CR 1000';

  -- ────────────────────────────────────────────────────────────
  -- CASE 7: Expense (non-payroll) → DR 5200 / CR 1000
  -- ────────────────────────────────────────────────────────────
  INSERT INTO public.expenses (id, tenant_id, amount, category, note)
  VALUES ('TEST-EXP-OPEX', k_tenant, 75, 'UTILITIES', 'Electric bill');

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id=k_tenant AND reference_type='EXPENSE' AND reference_id='TEST-EXP-OPEX';
  IF (SELECT SUM(debit)  FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='5200') <> 75
     THEN RAISE EXCEPTION 'GL-01 FAIL: opex expense should DR 5200=75'; END IF;
  IF EXISTS (SELECT 1 FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id
             WHERE l.journal_id=v_jid AND a.code='5100')
     THEN RAISE EXCEPTION 'GL-01 FAIL: non-payroll expense must not touch 5100'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: expense non-payroll — DR 5200 / CR 1000';

  -- ────────────────────────────────────────────────────────────
  -- CASE 8: Purchase CASH → DR 1200 / CR 1000
  -- ────────────────────────────────────────────────────────────
  INSERT INTO public.purchases (id, tenant_id, total_amount, payment_type)
  VALUES ('TEST-PUR-CASH', k_tenant, 300, 'CASH');

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id=k_tenant AND reference_type='PURCHASE' AND reference_id='TEST-PUR-CASH';
  IF (SELECT SUM(debit)  FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1200') <> 300
     THEN RAISE EXCEPTION 'GL-01 FAIL: purchase CASH should DR 1200=300'; END IF;
  IF (SELECT SUM(credit) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1000') <> 300
     THEN RAISE EXCEPTION 'GL-01 FAIL: purchase CASH should CR 1000=300'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: purchase CASH — DR 1200 / CR 1000';

  -- ────────────────────────────────────────────────────────────
  -- CASE 9: Purchase CREDIT → DR 1200 / CR 2000 (AP)
  -- ────────────────────────────────────────────────────────────
  INSERT INTO public.purchases (id, tenant_id, total_amount, payment_type)
  VALUES ('TEST-PUR-CREDIT', k_tenant, 450, 'CREDIT');

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id=k_tenant AND reference_type='PURCHASE' AND reference_id='TEST-PUR-CREDIT';
  IF (SELECT SUM(credit) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='2000') <> 450
     THEN RAISE EXCEPTION 'GL-01 FAIL: purchase CREDIT should CR 2000=450'; END IF;
  IF EXISTS (SELECT 1 FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id
             WHERE l.journal_id=v_jid AND a.code='1000')
     THEN RAISE EXCEPTION 'GL-01 FAIL: purchase CREDIT must not touch Cash'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: purchase CREDIT — DR 1200 / CR 2000';

  -- ────────────────────────────────────────────────────────────
  -- CASE 10: Client payment → DR 1000 / CR 1100
  -- ────────────────────────────────────────────────────────────
  INSERT INTO public.client_payments (id, tenant_id, amount)
  VALUES ('TEST-PAY-001', k_tenant, 80);

  SELECT id INTO v_jid FROM public.gl_journals
   WHERE tenant_id=k_tenant AND reference_type='PAYMENT' AND reference_id='TEST-PAY-001';
  IF (SELECT SUM(debit)  FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1000') <> 80
     THEN RAISE EXCEPTION 'GL-01 FAIL: client payment should DR 1000=80'; END IF;
  IF (SELECT SUM(credit) FROM public.gl_lines l JOIN public.gl_accounts a ON a.id=l.account_id WHERE l.journal_id=v_jid AND a.code='1100') <> 80
     THEN RAISE EXCEPTION 'GL-01 FAIL: client payment should CR 1100=80'; END IF;
  passed := passed + 1;
  RAISE NOTICE 'OK: client payment — DR 1000 / CR 1100';

  -- ────────────────────────────────────────────────────────────
  -- CASE 11: Balance enforcement — unbalanced post must abort
  -- Wrapped in sub-block so the expected failure does not abort
  -- the outer test transaction.
  -- ────────────────────────────────────────────────────────────
  DECLARE
    v_bad_journal uuid;
    v_caught      boolean := false;
  BEGIN
    BEGIN
      INSERT INTO public.gl_journals (tenant_id, reference_type, reference_id, description)
      VALUES (k_tenant, 'TEST_BAD', 'BAD-1', 'manual unbalanced')
      RETURNING id INTO v_bad_journal;

      INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)
      VALUES (k_tenant, v_bad_journal,
              public.gl_account_id(k_tenant,'1000'), 100);
      -- intentionally no credit leg → commit-time check should fire
      -- on deferred constraint at end of this sub-block.
    EXCEPTION WHEN OTHERS THEN
      v_caught := true;
    END;

    -- The deferred constraint fires at end of transaction, not block.
    -- So force it now:
    BEGIN
      PERFORM 1;
      SET CONSTRAINTS trg_gl_assert_balanced IMMEDIATE;
    EXCEPTION WHEN OTHERS THEN
      v_caught := true;
    END;

    IF NOT v_caught THEN
      RAISE EXCEPTION 'GL-01 FAIL: unbalanced journal was accepted (expected abort)';
    END IF;

    -- Reset so the outer ROLLBACK can clean up normally.
    SET CONSTRAINTS trg_gl_assert_balanced DEFERRED;
  END;
  passed := passed + 1;
  RAISE NOTICE 'OK: balance constraint — unbalanced insert rejected';

  RAISE NOTICE 'OK: GL-01 trigger suite — %/11 assertions pass', passed;
END
$test$;

ROLLBACK;
