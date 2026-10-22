-- ==============================================================
-- GL posting regression test -- each event posts once, on its own date
-- ==============================================================
-- Exercises 20261023_gl_posts_each_event_once.sql through ordinary writes
-- that fire the real triggers:
--
--   1. A payment on a sale does NOT rewrite the sale's journal (a payment on
--      an old invoice must not rewrite an old -- or closed -- month).
--   2. A sale's journal debits Receivables, never Cash.
--   3. A change to the sale's amount DOES re-post it.
--   4. A cash-ledger SALE row posts a receipt dated the ledger's date, and
--      deleting the row removes it.
--   5. A real receipt replaces one inferred for the same sale.
--   6. A supplier payment posts Dr Payables / Cr Cash on its own date, and a
--      soft delete removes it.
--   7. A purchase paid by UPI credits Cash, not Payables.
--
-- Leaves NOTHING behind: everything runs in a block that is always rolled
-- back; outcomes are kept in a variable so the rollback cannot erase them.
--
-- Subject tenant: set it explicitly, or it uses "Demo Kirana Store":
--   SELECT set_config('gl_test.tenant_id', '<uuid>', false);

CREATE TEMP TABLE IF NOT EXISTS _gl_test_results (n serial, check_name text, outcome text);
TRUNCATE _gl_test_results;

DO $test$
DECLARE
  v_t    uuid;
  v_sale text;
  v_sup  text;
  j1     uuid;
  j2     uuid;
  n      int;
  v_code text;
  v_msg  text;
  v_ok   text[] := ARRAY[]::text[];
BEGIN
  v_t := NULLIF(current_setting('gl_test.tenant_id', true), '')::uuid;
  IF v_t IS NULL THEN
    SELECT id INTO v_t FROM public.tenants WHERE name = 'Demo Kirana Store' LIMIT 1;
  END IF;
  IF v_t IS NULL THEN
    RAISE EXCEPTION 'gl_test: no subject tenant. Set gl_test.tenant_id; this test will not guess.';
  END IF;

  BEGIN
    SELECT s.id INTO v_sale FROM public.sales s
     WHERE s.tenant_id = v_t AND s.deleted_at IS NULL AND s.voided_at IS NULL AND s."totalAmount" > 0
       AND EXISTS (SELECT 1 FROM public.gl_journals g WHERE g.reference_type = 'SALE' AND g.reference_id = s.id)
     LIMIT 1;
    IF v_sale IS NULL THEN
      RAISE EXCEPTION 'gl_test: tenant % has no posted sale to work on', v_t;
    END IF;

    -- 1. a payment leaves the journal alone
    SELECT id INTO j1 FROM public.gl_journals WHERE reference_type = 'SALE' AND reference_id = v_sale;
    UPDATE public.sales SET "paidAmount" = COALESCE("paidAmount", 0) + 1, "paymentStatus" = 'PAID' WHERE id = v_sale;
    SELECT id INTO j2 FROM public.gl_journals WHERE reference_type = 'SALE' AND reference_id = v_sale;
    IF j1 IS DISTINCT FROM j2 THEN
      RAISE EXCEPTION 'gl_test: a payment re-posted the sale journal';
    END IF;
    v_ok := v_ok || 'payment keeps sale journal|OK'::text;

    -- 2. receivables, never cash
    SELECT string_agg(ga.code, ',') INTO v_code FROM public.gl_lines l JOIN public.gl_accounts ga ON ga.id = l.account_id
     WHERE l.journal_id = j2 AND l.debit > 0 AND ga.code IN ('1000', '1100');
    IF v_code IS DISTINCT FROM '1100' THEN
      RAISE EXCEPTION 'gl_test: sale debits % (expected 1100 only)', v_code;
    END IF;
    v_ok := v_ok || 'sale debits receivables|OK'::text;

    -- 3. an amount change re-posts
    UPDATE public.sales SET "totalAmount" = "totalAmount" + 1 WHERE id = v_sale;
    SELECT id INTO j2 FROM public.gl_journals WHERE reference_type = 'SALE' AND reference_id = v_sale;
    IF j1 IS NOT DISTINCT FROM j2 THEN
      RAISE EXCEPTION 'gl_test: changing the amount did not re-post the sale';
    END IF;
    v_ok := v_ok || 'amount change reposts|OK'::text;

    -- 4 + 5. receipts from the cash ledger, replacing an inferred one
    INSERT INTO public.accounts (id, tenant_id, name, type) VALUES ('ACC-GLTEST', v_t, 'gl_test till', 'CASH');
    INSERT INTO public.gl_journals (tenant_id, date, reference_type, reference_id, description)
    VALUES (v_t, now(), 'SALE_RECEIPT', 'SALE:' || v_sale, 'gl_test inferred') RETURNING id INTO j1;
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, debit)  VALUES (v_t, j1, public.gl_account_id(v_t, '1000'), 7);
    INSERT INTO public.gl_lines (tenant_id, journal_id, account_id, credit) VALUES (v_t, j1, public.gl_account_id(v_t, '1100'), 7);

    INSERT INTO public.account_transactions (id, tenant_id, account_id, date, direction, amount, ref_type, ref_id)
    VALUES ('AT-GLTEST', v_t, 'ACC-GLTEST', DATE '2025-04-03', 'IN', 50, 'SALE', v_sale);
    SELECT count(*) INTO n FROM public.gl_journals
     WHERE reference_type = 'SALE_RECEIPT' AND reference_id = 'AT-GLTEST' AND date::date = DATE '2025-04-03';
    IF n <> 1 THEN RAISE EXCEPTION 'gl_test: ledger receipt posted % journals dated 2025-04-03 (expected 1)', n; END IF;
    SELECT count(*) INTO n FROM public.gl_journals WHERE reference_type = 'SALE_RECEIPT' AND reference_id = 'SALE:' || v_sale;
    IF n <> 0 THEN RAISE EXCEPTION 'gl_test: inferred receipt survived a real one -- the money is counted twice'; END IF;
    v_ok := v_ok || 'real receipt replaces inferred|OK'::text;

    DELETE FROM public.account_transactions WHERE id = 'AT-GLTEST';
    SELECT count(*) INTO n FROM public.gl_journals WHERE reference_type = 'SALE_RECEIPT' AND reference_id = 'AT-GLTEST';
    IF n <> 0 THEN RAISE EXCEPTION 'gl_test: receipt journal survived its ledger row'; END IF;
    v_ok := v_ok || 'ledger receipt dated, removed with row|OK'::text;

    -- 6. supplier payments
    INSERT INTO public.suppliers (id, tenant_id, name) VALUES ('SUP-GLTEST', v_t, 'gl_test supplier');
    v_sup := 'SUP-GLTEST';
    INSERT INTO public.supplier_payments (id, tenant_id, supplier_id, amount, date)
    VALUES ('SP-GLTEST', v_t, v_sup, 25, DATE '2025-05-06');
    SELECT string_agg(ga.code || CASE WHEN l.debit > 0 THEN 'D' ELSE 'C' END, ',' ORDER BY ga.code) INTO v_code
      FROM public.gl_journals g JOIN public.gl_lines l ON l.journal_id = g.id JOIN public.gl_accounts ga ON ga.id = l.account_id
     WHERE g.reference_type = 'SUPPLIER_PAYMENT' AND g.reference_id = 'SP-GLTEST' AND g.date::date = DATE '2025-05-06';
    IF v_code IS DISTINCT FROM '1000C,2000D' THEN
      RAISE EXCEPTION 'gl_test: supplier payment posted % (expected 1000C,2000D on 2025-05-06)', v_code;
    END IF;
    UPDATE public.supplier_payments SET deleted_at = now() WHERE id = 'SP-GLTEST';
    SELECT count(*) INTO n FROM public.gl_journals WHERE reference_type = 'SUPPLIER_PAYMENT' AND reference_id = 'SP-GLTEST';
    IF n <> 0 THEN RAISE EXCEPTION 'gl_test: a deleted supplier payment kept its journal'; END IF;
    v_ok := v_ok || 'supplier payment posted, dropped on delete|OK'::text;

    -- 7. a UPI purchase is paid, not owed
    INSERT INTO public.purchases (id, tenant_id, supplier_id, total_amount, payment_type, date)
    VALUES ('PUR-GLTEST', v_t, v_sup, 40, 'UPI', '2025-06-07');
    SELECT string_agg(ga.code, ',') INTO v_code
      FROM public.gl_journals g JOIN public.gl_lines l ON l.journal_id = g.id JOIN public.gl_accounts ga ON ga.id = l.account_id
     WHERE g.reference_type = 'PURCHASE' AND g.reference_id = 'PUR-GLTEST' AND l.credit > 0;
    IF v_code IS DISTINCT FROM '1000' THEN
      RAISE EXCEPTION 'gl_test: UPI purchase credited % (expected 1000)', v_code;
    END IF;
    v_ok := v_ok || 'UPI purchase credits cash|OK'::text;

    RAISE EXCEPTION 'gl_test:rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'gl_test:rollback' THEN v_msg := SQLERRM; END IF;
  END;

  INSERT INTO _gl_test_results (check_name, outcome)
  SELECT split_part(x, '|', 1), split_part(x, '|', 2) FROM unnest(v_ok) AS x;
  IF v_msg IS NOT NULL THEN
    INSERT INTO _gl_test_results (check_name, outcome) VALUES ('FAILED', v_msg);
  ELSIF cardinality(v_ok) <> 7 THEN
    INSERT INTO _gl_test_results (check_name, outcome)
    VALUES ('FAILED', format('only %s of 7 checks reported', cardinality(v_ok)));
  END IF;
END $test$;

SELECT check_name, outcome FROM _gl_test_results ORDER BY n;
