-- Delete a sale properly: reverse the stock, then hide the sale AND its invoice.
--
-- The UI's delete was a bare soft-delete (deleted_at on the sales row and
-- nothing else). Outstanding and the cash ledger self-corrected via triggers,
-- but two things leaked: stock (FIFO consumption + inventory deduction were
-- never reversed, so deleted sales left units permanently missing) and the
-- invoice (stayed live + UNPAID, showing as a phantom bill on the client's
-- settle screen).
--
-- Reuses the tested void_sale (restores batches, inventory_balances,
-- products.stock, movement_log and outstanding), then soft-deletes the linked
-- invoice and the sale.

CREATE OR REPLACE FUNCTION public.delete_sale(
  p_id        text,
  p_tenant_id uuid,
  p_user_id   uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tenant uuid;
BEGIN
  IF NOT (is_global_admin() OR p_tenant_id = current_tenant_id()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.sales WHERE id = p_id AND tenant_id = p_tenant_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sale % not found for tenant %', p_id, p_tenant_id;
  END IF;

  PERFORM public.void_sale(p_id, 'Deleted from list', p_user_id);

  UPDATE public.invoices
     SET deleted_at = NOW()
   WHERE sale_id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

  UPDATE public.sales SET deleted_at = NOW() WHERE id = p_id AND tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_sale(text, uuid, uuid) TO authenticated;
