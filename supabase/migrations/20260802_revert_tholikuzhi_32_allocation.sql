-- Reverts 20260802_allocate_tholikuzhi_32_payment, which was wrong.
--
-- That migration credited a Rs 32 client payment against SAL-0C748200,
-- believing the bill had simply missed it. It had not. clients.outstanding_balance
-- is derived by _recalc_outstanding_for_client, which nets unallocated payments
-- off the bill dues:
--
--   v_owed    = unpaid remainder on UNPAID/PARTIAL/CREDIT sales   = 174
--   v_pool    = every client_payment      200 + 120 + 32          = 352
--   v_alloc   = paidAmount on CREDIT-method sales only            = 320
--   v_surplus = GREATEST(0, 352 - 320)                            =  32
--   outstanding_balance = 174 - 32                                = 142
--
-- Raising paidAmount re-fired that trigger, so the Rs 32 was deducted a second
-- time and the balance fell to 110 -- the same Rs 32 gap, moved down rather
-- than closed. The change was undone immediately.
--
-- There is no defect here. The Rs 200 and Rs 120 payments settled the Rs 320
-- credit sale exactly; the Rs 32 is a real advance with no credit bill to
-- consume it. SAL-0C748200 genuinely has Rs 174 outstanding, and the client
-- genuinely owes Rs 142 net of that advance. Both figures are correct and
-- describe different things -- the same gross-versus-net distinction already
-- noted between the supplier ledger's closing balance and Amount Due.
--
-- This migration only asserts the restored state; it changes nothing.

DO $$
DECLARE v_paid numeric; v_bal numeric;
BEGIN
  SELECT COALESCE("paidAmount",0) INTO v_paid FROM public.sales WHERE id = 'SAL-0C748200';
  SELECT outstanding_balance INTO v_bal FROM public.clients WHERE id = 'CLI-1782716633819-928';

  IF v_paid IS DISTINCT FROM 200 OR v_bal IS DISTINCT FROM 142 THEN
    RAISE EXCEPTION 'Expected SAL-0C748200 paid 200 and balance 142; found % and % - not reverted',
      v_paid, v_bal;
  END IF;

  RAISE NOTICE 'THOLIKUZHI restored: bill paid 200 of 374, balance 142 (Rs 32 advance unallocated by design)';
END $$;
