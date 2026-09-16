-- Stock must never appear without a recorded event.
--
-- On 16 Jul 2026 the opening-stock seeding wrote straight into product_batches.
-- adjust_inventory_atomic was never called, so no movement_log row was created
-- and the item screen truthfully reported "No manual adjustments" while 29
-- batches of stock sat there. Rs 1.12 lakh arrived with nothing recording it.
--
-- This closes the hole at the table, so it holds no matter which client, RPC or
-- raw statement inserts the batch.
--
-- The double-log trap: adjust_inventory_atomic ALREADY writes movement_log and
-- then inserts the batch, so a naive AFTER INSERT trigger would log every
-- adjustment twice. The guard is per-transaction: if anything in this same
-- transaction already logged a movement for this product, stay quiet. xmin on
-- the movement_log row equals the current xid only for rows written by this
-- transaction, which is exactly the question being asked.
--
-- PURCHASE batches are skipped outright: process_purchase logs them, and the
-- purchase forms also insert an expiry-dated batch client-side that would
-- otherwise double up.

CREATE OR REPLACE FUNCTION public.tg_product_batches_log_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin = 'PURCHASE' OR COALESCE(NEW.qty_received, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movement_log m
     WHERE m.product_id = NEW.product_id
       AND m.tenant_id  = NEW.tenant_id
       AND m.xmin       = pg_current_xact_id()::text::xid
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.movement_log (id, product_id, type, quantity, reason, user_id, tenant_id, date)
  VALUES (
    'LOG-' || floor(extract(epoch from now())) || '-' || substr(md5(random()::text), 1, 5),
    NEW.product_id,
    'IN',
    NEW.qty_received,
    COALESCE(NULLIF(trim(NEW.note), ''), initcap(NEW.origin) || ' stock added'),
    'system',
    NEW.tenant_id,
    COALESCE(NEW.received_date::timestamptz, now())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_batches_log_movement ON public.product_batches;
CREATE TRIGGER trg_product_batches_log_movement
  AFTER INSERT ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_batches_log_movement();

-- Backfill the batches that arrived unrecorded, so the history is complete
-- rather than only correct from today. One row per batch that has no
-- movement_log entry on its received_date.
INSERT INTO public.movement_log (id, product_id, type, quantity, reason, user_id, tenant_id, date)
SELECT 'LOG-BF-' || substr(md5(b.id::text), 1, 12),
       b.product_id, 'IN', b.qty_received,
       COALESCE(NULLIF(trim(b.note), ''), initcap(b.origin) || ' stock added'),
       'system', b.tenant_id, b.received_date::timestamptz
FROM public.product_batches b
WHERE b.origin <> 'PURCHASE'
  AND b.deleted_at IS NULL
  AND COALESCE(b.qty_received, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movement_log m
     WHERE m.product_id = b.product_id
       AND m.tenant_id  = b.tenant_id
       AND m.type       = 'IN'
       AND m.date::date = b.received_date
       AND m.quantity   = b.qty_received
  );
