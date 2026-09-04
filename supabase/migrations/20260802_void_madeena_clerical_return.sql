-- PRN-F4C66U (MADEENA AGENCY KOLLAM, Straw Small, 420 @ Rs 5 = Rs 2,100,
-- 12 May 2026) records a return that never happened. Confirmed by the owner as
-- a clerical mistake.
--
-- The history around it is messy: movement_log holds SEVEN "Purchase Return"
-- entries of 420 units each on this product between 9 and 12 May, and six of
-- those returns were hard-deleted, leaving only their log traces. This is the
-- last one standing.
--
-- Stock is deliberately NOT restored. The arithmetic says 328 units left via
-- returns, not the 420 this one claims, so no single reversal is correct -- and
-- more importantly the product was reconciled to a physical count on 30 July
-- (its 5-unit ADJUSTMENT batch). Today's 507 is grounded in someone counting
-- them. Adding 420 back would overwrite a real count with a figure derived from
-- the very mistake being voided.
--
-- Nothing was ever offset against it (no CREDIT_NOTE rows exist), so voiding is
-- clean: MADEENA's payable is unaffected at Rs 6,900 and the Rs 2,100 claim
-- simply disappears.

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.madeena_void_return_20260802 AS
SELECT * FROM public.purchase_returns WHERE id = 'PRN-F4C66U';

DO $$
DECLARE v_offset int; v_amt numeric;
BEGIN
  SELECT count(*) INTO v_offset FROM public.supplier_payments
  WHERE note = 'Credit note PRN-F4C66U' AND deleted_at IS NULL;

  IF v_offset > 0 THEN
    RAISE EXCEPTION 'PRN-F4C66U has % offset row(s) against bills; unwind those first', v_offset;
  END IF;

  SELECT total_amount INTO v_amt FROM public.purchase_returns
  WHERE id = 'PRN-F4C66U' AND deleted_at IS NULL;

  IF v_amt IS DISTINCT FROM 2100 THEN
    RAISE EXCEPTION 'PRN-F4C66U is not Rs 2,100 (got %) - aborting', v_amt;
  END IF;
END $$;

UPDATE public.purchase_returns
   SET deleted_at = now()
 WHERE id = 'PRN-F4C66U' AND deleted_at IS NULL;
