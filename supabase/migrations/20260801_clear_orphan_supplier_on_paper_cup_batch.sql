-- Follow-up to 20260801_remove_paper_cup_210_purchase.
--
-- That migration severed the batch from its deleted bill via purchase_id and
-- origin, but left supplier_id pointing at GPS Paper Cup. The inventory screen
-- renders SOURCE from supplier_id, so the layer still displayed "GPS PAPER CUP"
-- - crediting a supplier for a purchase that no longer exists, and contradicting
-- its own origin of OPENING.
--
-- Only this one batch is affected. The Paper Cup 150 Ml layer keeps its
-- supplier_id: PUR-ASO5NY is a real bill and still live.

DO $$
DECLARE v_purchase text; v_origin text;
BEGIN
  SELECT purchase_id, origin INTO v_purchase, v_origin
  FROM public.product_batches
  WHERE id = 'da00b85e-8062-4e9f-85b7-01a55901dae9';

  IF v_purchase IS NOT NULL OR v_origin <> 'OPENING' THEN
    RAISE EXCEPTION 'batch is not the severed opening layer (purchase=%, origin=%) - aborting',
      v_purchase, v_origin;
  END IF;
END $$;

UPDATE public.product_batches
   SET supplier_id = NULL
 WHERE id = 'da00b85e-8062-4e9f-85b7-01a55901dae9';

-- Guard the general case: no batch should name a supplier while claiming to be
-- opening stock with no bill behind it.
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.product_batches
  WHERE deleted_at IS NULL AND purchase_id IS NULL
    AND origin IN ('OPENING', 'ADJUSTMENT') AND supplier_id IS NOT NULL;
  IF v_left > 0 THEN
    RAISE WARNING '% other batch(es) name a supplier with no purchase behind them', v_left;
  END IF;
END $$;
