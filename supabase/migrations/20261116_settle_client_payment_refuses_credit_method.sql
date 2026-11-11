-- settle_client_payment refuses a payment method that is not money
-- ============================================================================
--
-- The phone's sale screen passed its 'CREDIT_SALE' sentinel as the method of a
-- collection made right after a credit sale. Three such receipts reached
-- client_payments; post_client_payment_to_ledger put them IN a bank account
-- with mode CREDIT_SALE, and the Day Book, which counts only cash and bank
-- modes, never listed them.
--
-- A receipt is money arriving, so CREDIT, CREDIT_SALE and UDHAAR are refused
-- with a message the cashier can act on. The RAISE rolls the whole call back,
-- processed_ops included, so a corrected retry with the same id still runs.
-- Same signature, so no overload. Nothing else in the body changes.

CREATE OR REPLACE FUNCTION public.settle_client_payment(p_id text, p_tenant_id uuid, p_client_id text, p_amount numeric, p_date date, p_method text DEFAULT 'CASH'::text, p_notes text DEFAULT NULL::text, p_recorded_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric := p_amount;
  v_sale RECORD;
  v_alloc numeric;
  v_new_paid numeric;
  v_new_status text;
  v_noncredit_alloc numeric := 0;
  v_payment_amount numeric;
BEGIN
  IF p_tenant_id <> public.current_tenant_id() AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF UPPER(COALESCE(p_method, '')) IN ('CREDIT', 'CREDIT_SALE', 'UDHAAR') THEN
    RAISE EXCEPTION 'Choose how the money was paid (Cash, UPI or Bank). "%" is not a payment method.', p_method
      USING ERRCODE = '22023';
  END IF;

  -- replay guard: the outbox replays this op when the network returns.
  -- This one claims an id rather than looking for its own row: a receipt
  -- fully absorbed by non-credit sales writes no client_payments row.
  INSERT INTO public.processed_ops (fn, op_id, tenant_id)
  VALUES ('settle_client_payment', p_id, p_tenant_id)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'allocated', 0, 'unallocated', 0, 'cash_sale_portion', 0, 'payment_row_amount', 0);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  FOR v_sale IN
    SELECT id, "totalAmount", COALESCE("paidAmount", 0) AS paid,
           UPPER(COALESCE("paymentMethod",'CASH')) AS method
    FROM sales
    WHERE tenant_id = p_tenant_id
      AND "customerInfo"->>'id' = p_client_id
      AND "paymentStatus" IN ('UNPAID', 'PARTIAL', 'PENDING')
      AND deleted_at IS NULL
      AND voided_at IS NULL
    ORDER BY date ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_alloc := LEAST(v_remaining, v_sale."totalAmount" - v_sale.paid);
    CONTINUE WHEN v_alloc <= 0;

    IF v_sale.method = 'CREDIT' THEN
      v_remaining := v_remaining - v_alloc;
      CONTINUE;
    END IF;

    v_new_paid := v_sale.paid + v_alloc;
    v_new_status := CASE WHEN v_new_paid >= v_sale."totalAmount" THEN 'PAID' ELSE 'PARTIAL' END;

    UPDATE sales
       SET "paymentStatus" = v_new_status,
           "paidAmount"    = v_new_paid,
           "lastPaymentDate" = p_date
     WHERE id = v_sale.id AND tenant_id = p_tenant_id;

    UPDATE invoices
       SET payment_status = v_new_status, paid_amount = v_new_paid
     WHERE id = 'INV-' || v_sale.id AND tenant_id = p_tenant_id;

    v_noncredit_alloc := v_noncredit_alloc + v_alloc;
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  v_payment_amount := p_amount - v_noncredit_alloc;
  IF v_payment_amount > 0 THEN
    INSERT INTO client_payments (id, tenant_id, client_id, amount, date, payment_method, notes, recorded_by)
    VALUES (p_id, p_tenant_id, p_client_id, v_payment_amount, p_date, p_method, p_notes, p_recorded_by)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'allocated', p_amount - v_remaining,
    'unallocated', v_remaining,
    'cash_sale_portion', v_noncredit_alloc,
    'payment_row_amount', GREATEST(0, v_payment_amount)
  );
END $function$;
