-- Give every stock batch a stated origin and cost basis.
--
-- Until now the only way to tell a purchased lot from a hand-made one was
-- `purchase_id IS NULL` — an absence, not a statement. That is why 27 batches
-- carrying Rs 1.12 lakh of stock, Rs 73k of it on costs no bill supports, took
-- archaeology to find months after the fact. Worse, the adjustment path keeps
-- producing the same shape: a batch with no purchase reference, costed from
-- whatever products."costPrice" happened to say.
--
-- Two columns fix that permanently:
--   origin      — where the stock came from
--   cost_basis  — how much confidence its cost deserves
--
-- Set by a BEFORE INSERT trigger rather than by editing process_purchase /
-- adjust_inventory_atomic. That keeps the money path untouched and, crucially,
-- also covers the client-side inserts (the expiry-dated batch written by the
-- purchase forms) which a function edit would have missed.
--
-- A caller may set origin explicitly to override — a future
-- transfer_stock_between_products would pass 'TRANSFER'.

ALTER TABLE public.product_batches
  ADD COLUMN IF NOT EXISTS origin     text,
  ADD COLUMN IF NOT EXISTS cost_basis text;

COMMENT ON COLUMN public.product_batches.origin IS
  'PURCHASE | OPENING | ADJUSTMENT | PRODUCTION | TRANSFER — how this lot entered stock.';
COMMENT ON COLUMN public.product_batches.cost_basis IS
  'SUPPLIER_BILL = a bill supports it · LAST_KNOWN = copied from a prior purchase · ESTIMATED = typed by hand · DERIVED = computed (production).';

CREATE OR REPLACE FUNCTION public.tg_product_batches_classify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin IS NULL THEN
    NEW.origin := CASE
      WHEN NEW.purchase_id IS NOT NULL            THEN 'PURCHASE'
      WHEN COALESCE(NEW.note,'') = 'Manufactured' THEN 'PRODUCTION'
      ELSE 'ADJUSTMENT'
    END;
  END IF;

  IF NEW.cost_basis IS NULL THEN
    NEW.cost_basis := CASE
      WHEN NEW.origin = 'PURCHASE'   THEN 'SUPPLIER_BILL'
      WHEN NEW.origin = 'PRODUCTION' THEN 'DERIVED'
      ELSE 'ESTIMATED'
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_batches_classify ON public.product_batches;
CREATE TRIGGER trg_product_batches_classify
  BEFORE INSERT ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_batches_classify();

-- Backfill. Purchase-backed lots are unambiguous. Among the rest, the batches
-- written in the 16 Jul 2026 01:32 bulk are the original opening-stock seeding;
-- anything else without a purchase arrived through an adjustment.
UPDATE public.product_batches
   SET origin = CASE
         WHEN purchase_id IS NOT NULL             THEN 'PURCHASE'
         WHEN COALESCE(note,'') = 'Manufactured'  THEN 'PRODUCTION'
         WHEN created_at BETWEEN TIMESTAMPTZ '2026-07-16 01:30' AND TIMESTAMPTZ '2026-07-16 01:35'
                                                  THEN 'OPENING'
         ELSE 'ADJUSTMENT'
       END,
       cost_basis = CASE
         WHEN purchase_id IS NOT NULL            THEN 'SUPPLIER_BILL'
         WHEN COALESCE(note,'') = 'Manufactured' THEN 'DERIVED'
         ELSE 'ESTIMATED'
       END
 WHERE origin IS NULL OR cost_basis IS NULL;

CREATE INDEX IF NOT EXISTS idx_pb_cost_basis_open
  ON public.product_batches (tenant_id, cost_basis)
  WHERE qty_remaining > 0;

-- Standing replacement for the ad-hoc reconciliation query: stock whose cost no
-- bill supports, with its age, so it can be monitored instead of discovered.
CREATE OR REPLACE VIEW public.stock_unverified_cost AS
SELECT b.tenant_id,
       b.id            AS batch_id,
       b.product_id,
       p.name          AS product_name,
       b.origin,
       b.cost_basis,
       b.received_date,
       (CURRENT_DATE - b.received_date)            AS age_days,
       b.unit_cost,
       b.qty_remaining,
       ROUND(b.qty_remaining * b.unit_cost, 2)     AS value_at_risk,
       (SELECT COUNT(*) FROM public.sale_batch_consumption c WHERE c.batch_id = b.id) AS sold_rows
FROM public.product_batches b
JOIN public.products p ON p.id = b.product_id
WHERE b.qty_remaining > 0
  AND b.cost_basis <> 'SUPPLIER_BILL';

GRANT SELECT ON public.stock_unverified_cost TO authenticated;
