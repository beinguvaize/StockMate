-- PUR-AQXHO1 (Paper Cup 210 Ml, 350 @ Rs 38 = Rs 13,300, GPS Paper Cup, 19 May)
-- is not a purchase that happened. Remove it.
--
-- The bill cannot simply be deleted whole. Its FIFO batch was fully consumed:
-- 350 units left through 14 real, invoiced sales between 29 May and 5 Jun,
-- carrying Rs 13,300 of COGS. Dropping the batch would strip the cost from
-- those 14 invoices and overstate past profit by that exact amount.
--
-- So the bill goes and the cost layer stays, reclassified as what it now is:
-- stock the shop held without a supplier bill behind it. Same treatment the
-- other two layers of this product already carry.
--
-- Safe on every other axis, verified before writing:
--   * no account_transactions reference it - this May bill never reached the
--     cash/bank ledger, consistent with that account opening on 30 June
--   * no supplier_payments rows, no purchase_returns
--   * the batch holds 0 remaining, so products.stock (229) does not move

CREATE SCHEMA IF NOT EXISTS snap;

CREATE TABLE IF NOT EXISTS snap.paper_cup_210_purchase_20260801 AS
SELECT * FROM public.purchases WHERE id = 'PUR-AQXHO1';

CREATE TABLE IF NOT EXISTS snap.paper_cup_210_batch_20260801 AS
SELECT * FROM public.product_batches
WHERE id = 'da00b85e-8062-4e9f-85b7-01a55901dae9';

-- Abort rather than half-apply if the shape is not what was surveyed.
DO $$
DECLARE v_qty numeric; v_amt numeric; v_remaining numeric;
BEGIN
  SELECT quantity, total_amount INTO v_qty, v_amt
  FROM public.purchases WHERE id = 'PUR-AQXHO1' AND deleted_at IS NULL;

  IF v_qty IS DISTINCT FROM 350 OR v_amt IS DISTINCT FROM 13300 THEN
    RAISE EXCEPTION 'PUR-AQXHO1 is not 350 @ 13300 (got % @ %) - aborting', v_qty, v_amt;
  END IF;

  SELECT qty_remaining INTO v_remaining
  FROM public.product_batches WHERE id = 'da00b85e-8062-4e9f-85b7-01a55901dae9';

  -- If the layer still held stock, removing its bill would leave unsupported
  -- inventory valued off a bill that no longer exists. It does not - but check.
  IF v_remaining IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'batch still holds % units - aborting', v_remaining;
  END IF;
END $$;

UPDATE public.purchases
   SET deleted_at = now()
 WHERE id = 'PUR-AQXHO1' AND deleted_at IS NULL;

-- Keep the cost layer, sever it from the bill.
UPDATE public.product_batches
   SET origin      = 'OPENING',
       cost_basis  = 'ESTIMATED',
       purchase_id = NULL,
       note        = 'Opening stock. Purchase PUR-AQXHO1 removed 1 Aug 2026 '
                     || '(never purchased); cost layer retained because 350 '
                     || 'units were already sold against it.'
 WHERE id = 'da00b85e-8062-4e9f-85b7-01a55901dae9';
