-- recost_purchase_batches left products."costPrice" stale.
--
-- It corrected the batch, the per-sale cost snapshots and sales.totalCogs, so
-- COGS and the P&L were right — but nothing recomputed the product's
-- weighted-average cost. There is no trigger on product_batches that would,
-- and the only caller of recompute_product_cost on the edit path is
-- resync_purchase_batch, which the client skips when nothing but the rate
-- changed. So correcting a price on an old bill left the cost shown on the
-- product, and every stock valuation built from it, on the old average until
-- that item was next purchased.
--
-- Loops over distinct products because a purchase can carry more than one
-- batch when an expiry was entered on the line.
--
-- Also pins search_path. The function is SECURITY DEFINER and had none, so a
-- caller could shadow `product_batches` with a temp table and have this write
-- somewhere else entirely. Every reference inside is already schema-qualified,
-- so pinning it changes nothing else.

CREATE OR REPLACE FUNCTION public.recost_purchase_batches(
  p_purchase_id text,
  p_unit_cost   numeric,
  p_tenant_id   uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sale_id    text;
  v_product_id text;
BEGIN
  UPDATE public.product_batches
    SET unit_cost = p_unit_cost, updated_at = NOW()
    WHERE purchase_id = p_purchase_id AND tenant_id = p_tenant_id;

  UPDATE public.sale_batch_consumption
    SET unit_cost = p_unit_cost
    WHERE tenant_id = p_tenant_id
      AND batch_id IN (SELECT id FROM public.product_batches
                       WHERE purchase_id = p_purchase_id AND tenant_id = p_tenant_id);

  FOR v_sale_id IN
    SELECT DISTINCT sale_id FROM public.sale_batch_consumption
    WHERE tenant_id = p_tenant_id
      AND batch_id IN (SELECT id FROM public.product_batches
                       WHERE purchase_id = p_purchase_id AND tenant_id = p_tenant_id)
  LOOP
    UPDATE public.sales s
      SET "totalCogs" = (SELECT COALESCE(SUM(qty_taken * unit_cost), 0)
                         FROM public.sale_batch_consumption
                         WHERE sale_id = v_sale_id AND tenant_id = p_tenant_id)
      WHERE s.id = v_sale_id AND s.tenant_id = p_tenant_id;
  END LOOP;

  -- The missing step: the product's weighted average is derived from its open
  -- batches, and one of them just changed cost.
  FOR v_product_id IN
    SELECT DISTINCT product_id FROM public.product_batches
    WHERE purchase_id = p_purchase_id AND tenant_id = p_tenant_id
  LOOP
    PERFORM public.recompute_product_cost(p_tenant_id, v_product_id);
  END LOOP;
END;
$function$;
