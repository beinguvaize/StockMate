-- 68 sales are marked PAID while carrying paidAmount = 0.
--
-- All of them fall between 8 and 30 May 2026 and nothing since, because
-- process_sale now closes the gap itself: when no p_paid_amount is supplied it
-- sets v_paid := v_total_rounded for a PAID status. So this is historic residue
-- from before that logic, not a live fault, and no source fix is needed.
--
-- It matters because sales."paidAmount" is what a client statement credits.
-- ClientStatementReport debits the bill and credits paidAmount, so these sales
-- appear as unpaid there for ever:
--
--   KUZHIVILA STORE    statement says Rs 27,970 owed, actually owed Rs 0
--   Mr Bake            statement says Rs  1,850 owed, actually owed Rs 0
--   Kalamachal shop    statement says Rs  3,163 owed, actually owed Rs 2,838
--
-- Printing a statement today demands money the customer has already paid.
--
-- Safe on the figures that matter, checked before writing:
--   * DayBook is unaffected - its recv() returns the full total as soon as the
--     status is PAID and never reads paidAmount for these (DayBook.jsx:132)
--   * clients.outstanding_balance is a separate stored column and already
--     reads 0 for these clients; this makes the statement agree with it
--   * no money moves, no account_transactions, no COGS

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.paid_sales_zero_paidamount_20260802 AS
SELECT id, "shopId", date, "totalAmount", "paidAmount", "paymentMethod", "paymentStatus", status
FROM public.sales
WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3'
  AND deleted_at IS NULL
  AND COALESCE("paymentStatus", status) = 'PAID'
  AND COALESCE("totalAmount",0) - COALESCE("paidAmount",0) > 0.01;

DO $$
DECLARE v_n int; v_amt numeric;
BEGIN
  SELECT count(*), COALESCE(sum("totalAmount" - COALESCE("paidAmount",0)),0)
    INTO v_n, v_amt
  FROM snap.paid_sales_zero_paidamount_20260802;

  IF v_n <> 68 OR round(v_amt) <> 77745 THEN
    RAISE EXCEPTION 'Expected 68 sales worth Rs 77,745; found % worth % - aborting', v_n, round(v_amt);
  END IF;
END $$;

-- Set paid to the bill total. These are PAID: by definition nothing is due.
UPDATE public.sales s
   SET "paidAmount" = s."totalAmount"
  FROM snap.paid_sales_zero_paidamount_20260802 b
 WHERE s.id = b.id
   AND COALESCE(s."paymentStatus", s.status) = 'PAID'
   AND COALESCE(s."totalAmount",0) - COALESCE(s."paidAmount",0) > 0.01;

-- Nothing may end up paid beyond its bill.
DO $$
DECLARE v_over int;
BEGIN
  SELECT count(*) INTO v_over FROM public.sales
  WHERE tenant_id = 'fd4927bf-c084-4bed-ba13-d30e650da6f3' AND deleted_at IS NULL
    AND COALESCE("paidAmount",0) > COALESCE("totalAmount",0) + 0.01;
  IF v_over > 0 THEN
    RAISE EXCEPTION '% sale(s) now show paid above the bill total - aborting', v_over;
  END IF;
END $$;
