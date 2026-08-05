-- suppliers.balance is meant to equal what we still owe:
--
--   balance = SUM(open bill due) - unapplied advances - open credit notes
--
-- Two writers broke that invariant.
--
-- 1. settle_supplier_payment clamped the decrement at zero:
--
--      set balance = greatest(0, coalesce(balance,0) - p_amount)
--
--    Paying more than is owed leaves an advance, which is a NEGATIVE balance.
--    The clamp threw that surplus away. HASSAN KOUSER SIVAKASI is the live case:
--    on 29 Jun Rs 11,830 was paid against Rs 9,440 of open bills, so the balance
--    should have gone to -2,390. It was pinned at 0 and every later bill stacked
--    on top, leaving the column Rs 2,390 high ever since. The payment rows and
--    the bills were always right; only this cached column was wrong.
--
-- 2. process_purchase_return never touched the balance. A return reduces what
--    is owed, so the column has to learn about it -- otherwise offsetting the
--    resulting credit note against a bill lowers the bill due while the balance
--    stays put, opening the same kind of gap.
--
-- Deliberately NOT changed: apply_supplier_advances and offset_supplier_credit_note.
-- Both move money from "unapplied advance / open credit note" to "bill paid".
-- The total owed is identical before and after, so they must leave the balance
-- alone. Making them decrement it would double-count every advance.
--
-- Patched from the live definitions rather than retyped, because both bodies
-- have been amended before and rewriting from memory would silently drop those
-- changes. Aborts if either anchor is missing.

CREATE SCHEMA IF NOT EXISTS snap;

-- Every supplier balance as it stands, so any of this can be put back verbatim.
DROP TABLE IF EXISTS snap.supplier_balance_20260805;
CREATE TABLE snap.supplier_balance_20260805 AS
SELECT id, tenant_id, name, balance, now() AS taken_at
FROM public.suppliers WHERE deleted_at IS NULL;

-- ── 1. let the balance go negative ──────────────────────────────────────────
DO $mig$
DECLARE v_def text; v_new text; v_old text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'settle_supplier_payment';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'settle_supplier_payment not found - aborting';
  END IF;

  v_old := 'set balance = greatest(0, coalesce(balance,0) - p_amount), updated_at = now()';

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'balance clamp not found - definition changed, aborting';
  END IF;

  -- A negative balance is an advance held by the supplier. That is a real
  -- state and the column must be able to express it.
  v_new := replace(v_def, v_old,
    'set balance = coalesce(balance,0) - p_amount, updated_at = now()');

  EXECUTE v_new;
END $mig$;

-- ── 2. a return reduces what is owed ────────────────────────────────────────
DO $mig$
DECLARE v_def text; v_new text; v_old text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'process_purchase_return';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'process_purchase_return not found - aborting';
  END IF;

  v_old := '  IF p_product_id IS NOT NULL AND p_quantity > 0 THEN';

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'stock block anchor not found - definition changed, aborting';
  END IF;

  v_new := replace(v_def, v_old,
    '  -- Goods went back, so we owe the supplier that much less. Without this'  || E'\n' ||
    '  -- the credit note reduces the bill due when it is offset while the'      || E'\n' ||
    '  -- balance stays put, and the two disagree from then on.'                 || E'\n' ||
    '  UPDATE public.suppliers'                                                  || E'\n' ||
    '     SET balance = COALESCE(balance,0) - COALESCE(p_total_amount,0),'       || E'\n' ||
    '         updated_at = now()'                                                || E'\n' ||
    '   WHERE id = p_supplier_id::text AND tenant_id = p_tenant_id;'             || E'\n' ||
    E'\n' || v_old);

  EXECUTE v_new;
END $mig$;

-- ── 3. bring every supplier back onto the invariant ─────────────────────────
-- Recomputed from the transactions, which were never wrong, rather than nudging
-- HASSAN by 2,390 -- that would fix the symptom and leave any other drift.
UPDATE public.suppliers s
   SET balance = t.true_outstanding, updated_at = now()
  FROM (
    SELECT sup.id,
           COALESCE(d.bill_due, 0) - COALESCE(a.on_account, 0) AS true_outstanding
    FROM public.suppliers sup
    LEFT JOIN (
      SELECT supplier_id::text AS sid, tenant_id,
             SUM(GREATEST(total_amount - COALESCE(paid_amount,0), 0)) AS bill_due
      FROM public.purchases WHERE deleted_at IS NULL GROUP BY 1,2
    ) d ON d.sid = sup.id::text AND d.tenant_id = sup.tenant_id
    LEFT JOIN (
      SELECT supplier_id::text AS sid, tenant_id, SUM(amount) AS on_account
      FROM public.supplier_payments
      WHERE deleted_at IS NULL AND purchase_id IS NULL GROUP BY 1,2
    ) a ON a.sid = sup.id::text AND a.tenant_id = sup.tenant_id
    WHERE sup.deleted_at IS NULL
  ) t
 WHERE s.id = t.id
   AND ABS(COALESCE(s.balance,0) - t.true_outstanding) > 0.005;

-- ── 4. prove it ─────────────────────────────────────────────────────────────
DO $chk$
DECLARE v_bad int; v_hassan numeric;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.suppliers sup
  LEFT JOIN (
    SELECT supplier_id::text AS sid, tenant_id,
           SUM(GREATEST(total_amount - COALESCE(paid_amount,0), 0)) AS bill_due
    FROM public.purchases WHERE deleted_at IS NULL GROUP BY 1,2
  ) d ON d.sid = sup.id::text AND d.tenant_id = sup.tenant_id
  LEFT JOIN (
    SELECT supplier_id::text AS sid, tenant_id, SUM(amount) AS on_account
    FROM public.supplier_payments
    WHERE deleted_at IS NULL AND purchase_id IS NULL GROUP BY 1,2
  ) a ON a.sid = sup.id::text AND a.tenant_id = sup.tenant_id
  WHERE sup.deleted_at IS NULL
    AND ABS(COALESCE(sup.balance,0)
            - (COALESCE(d.bill_due,0) - COALESCE(a.on_account,0))) > 0.005;

  IF v_bad > 0 THEN
    RAISE EXCEPTION '% suppliers still off the invariant', v_bad;
  END IF;

  SELECT balance INTO v_hassan FROM public.suppliers
   WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
     AND name ILIKE 'HASSAN KOUSER%';

  IF round(v_hassan) <> 34010 THEN
    RAISE EXCEPTION 'HASSAN reads %, expected 34,010 - aborting', round(v_hassan);
  END IF;
END $chk$;
