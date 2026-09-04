-- Deleting a payment has to unwind what it settled. Doing that from the client
-- means several writes with no transaction: soft-delete the receipt, re-read,
-- recompute, then write each affected row in a loop. A failure halfway leaves
-- bills part-settled and a balance that matches nothing -- which is how the
-- duplicate Rs 6,900 supplier payment arose in the first place.
--
-- Both run in one statement each, so they either fully reverse or do nothing.

-- ── Supplier payment ────────────────────────────────────────────────────────
--
-- Reversal is symmetric with settle_supplier_payment:
--   · a payment linked to a bill lowers that bill's paid_amount
--   · an on-account payment was an advance, and simply goes
-- Either way the supplier is owed that much more again, so balance rises by the
-- amount. That matches the invariant the balance column now holds:
--   balance = SUM(open bill due) - unapplied advances
CREATE OR REPLACE FUNCTION public.delete_supplier_payment(
  p_tenant_id uuid,
  p_payment_id text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_supplier text;
  v_purchase text;
BEGIN
  SELECT amount, supplier_id, purchase_id
    INTO v_amount, v_supplier, v_purchase
  FROM public.supplier_payments
  WHERE id = p_payment_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Payment % not found, or already deleted', p_payment_id;
  END IF;

  UPDATE public.supplier_payments
     SET deleted_at = now()
   WHERE id = p_payment_id AND tenant_id = p_tenant_id;

  -- Give the bill its debt back. Floor at zero: a bill can never be less than
  -- unpaid, and clamping here is cheaper than trusting every historical row.
  IF v_purchase IS NOT NULL THEN
    UPDATE public.purchases
       SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_amount),
           updated_at  = now()
     WHERE id = v_purchase AND tenant_id = p_tenant_id;
  END IF;

  UPDATE public.suppliers
     SET balance = COALESCE(balance, 0) + v_amount, updated_at = now()
   WHERE id = v_supplier AND tenant_id = p_tenant_id;

  RETURN v_amount;
END $$;

-- ── Client payment ──────────────────────────────────────────────────────────
--
-- The client side allocates by rewriting sales.paidAmount, so reversing one
-- receipt means replaying what remains. Done here rather than in the browser:
-- the old client-side version soft-deleted the receipt first and then wrote
-- each sale in a loop, so a failure part-way left the receipt gone and the
-- sales still showing it.
--
-- Replay is FIFO over credit sales, oldest first, which is what
-- settle_client_payment does when it allocates.
CREATE OR REPLACE FUNCTION public.delete_client_payment(
  p_tenant_id uuid,
  p_payment_id text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_client text;
  v_pool   numeric;
  v_take   numeric;
  r        record;
BEGIN
  SELECT amount, client_id INTO v_amount, v_client
  FROM public.client_payments
  WHERE id = p_payment_id AND tenant_id = p_tenant_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Receipt % not found, or already deleted', p_payment_id;
  END IF;

  UPDATE public.client_payments
     SET deleted_at = now()
   WHERE id = p_payment_id AND tenant_id = p_tenant_id;

  -- What the client has paid, after this receipt is gone.
  SELECT COALESCE(SUM(amount), 0) INTO v_pool
  FROM public.client_payments
  WHERE tenant_id = p_tenant_id AND client_id = v_client AND deleted_at IS NULL;

  -- Replay it across their credit sales, oldest first.
  FOR r IN
    SELECT id, COALESCE("totalAmount", 0) AS total
    FROM public.sales
    WHERE tenant_id = p_tenant_id
      AND "shopId"::text = v_client::text
      AND UPPER(COALESCE("paymentMethod", '')) = 'CREDIT'
      AND deleted_at IS NULL
    ORDER BY date ASC, created_at ASC
  LOOP
    v_take := LEAST(GREATEST(v_pool, 0), r.total);

    UPDATE public.sales
       SET "paidAmount"    = v_take,
           "paymentStatus" = CASE WHEN v_take >= r.total AND r.total > 0 THEN 'PAID'
                                  WHEN v_take > 0 THEN 'PARTIAL'
                                  ELSE 'UNPAID' END,
           updated_at      = now()
     WHERE id = r.id AND tenant_id = p_tenant_id;

    UPDATE public.invoices
       SET paid_amount    = v_take,
           payment_status = CASE WHEN v_take >= r.total AND r.total > 0 THEN 'PAID'
                                 WHEN v_take > 0 THEN 'PARTIAL'
                                 ELSE 'UNPAID' END
     WHERE sale_id = r.id AND tenant_id = p_tenant_id;

    v_pool := v_pool - v_take;
  END LOOP;

  -- Let the existing recalculation own the outstanding figure rather than
  -- computing it a second way here.
  PERFORM public._recalc_outstanding_for_client(p_tenant_id, v_client);

  RETURN v_amount;
END $$;
