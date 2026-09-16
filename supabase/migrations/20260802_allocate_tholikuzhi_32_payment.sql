-- WRONG. Applied and immediately reverted by
-- 20260802_revert_tholikuzhi_32_allocation. Kept because it was applied to
-- production and the history should say so rather than quietly omit it.
--
-- The reasoning below looked sound and was not. See the revert for why:
-- outstanding_balance is derived, and raising paidAmount made the trigger
-- deduct the same Rs 32 a second time.
--
-- ── original intent ──────────────────────────────────────────────────────
-- THOLIKUZHI VEG SHOP's statement said Rs 174 owed while the client record
-- said Rs 142. A Rs 32 cash payment on 20 Jul 2026 (CP-1784531267519) appeared
-- to have reduced clients.outstanding_balance without being allocated to a
-- bill, so sales."paidAmount" never moved.

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.tholikuzhi_sale_20260802 AS
SELECT id, "shopId", date, "totalAmount", "paidAmount", "paymentStatus", status
FROM public.sales WHERE id = 'SAL-0C748200';

DO $$
DECLARE v_total numeric; v_paid numeric; v_bal numeric;
BEGIN
  SELECT "totalAmount", COALESCE("paidAmount",0) INTO v_total, v_paid
  FROM public.sales WHERE id = 'SAL-0C748200' AND deleted_at IS NULL;

  SELECT outstanding_balance INTO v_bal
  FROM public.clients WHERE id = 'CLI-1782716633819-928';

  IF v_total IS DISTINCT FROM 374 OR v_paid IS DISTINCT FROM 200 THEN
    RAISE EXCEPTION 'SAL-0C748200 is not 374 billed / 200 paid (got % / %) - aborting', v_total, v_paid;
  END IF;

  IF (v_total - (v_paid + 32)) IS DISTINCT FROM v_bal THEN
    RAISE EXCEPTION 'Crediting Rs 32 would leave % due against a stored balance of % - aborting',
      v_total - (v_paid + 32), v_bal;
  END IF;
END $$;

UPDATE public.sales
   SET "paidAmount" = COALESCE("paidAmount",0) + 32
 WHERE id = 'SAL-0C748200'
   AND COALESCE("paidAmount",0) = 200;
