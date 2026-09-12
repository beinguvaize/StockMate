-- A purchase return is a claim on the supplier, not a reduction of a payable.
--
-- MADEENA's Rs 2,100 return is against PUR-PMMGII, a CASH bill already paid in
-- full, so they owe that money back. Their open bills are a separate Rs 6,900.
-- Whether the credit note offsets those bills or comes back as cash is a
-- conversation with the supplier, so nothing happens automatically -- this runs
-- only when the user says to.
--
-- The offset is recorded as supplier_payments rows carrying payment_method
-- 'CREDIT_NOTE'. That raises paid_amount on the bills without implying cash
-- moved, and since supplier_payments has no ledger trigger, no bank or cash
-- account is touched. Which is right: no money changes hands in an offset.

CREATE OR REPLACE FUNCTION public.offset_supplier_credit_note(
  p_tenant_id uuid,
  p_return_id text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sup    text;
  v_amount numeric;
  v_used   numeric;
  v_left   numeric;
  v_take   numeric;
  v_n      int := 0;
  v_applied numeric := 0;
  bill     record;
BEGIN
  SELECT supplier_id, COALESCE(total_amount,0)
    INTO v_sup, v_amount
  FROM public.purchase_returns
  WHERE id = p_return_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

  IF v_sup IS NULL THEN
    RAISE EXCEPTION 'Credit note % not found', p_return_id;
  END IF;
  IF v_amount <= 0.005 THEN
    RAISE EXCEPTION 'Credit note % has no value to offset', p_return_id;
  END IF;

  -- How much of this note has already been offset. Derived from the allocation
  -- rows themselves rather than a flag, so the two can never disagree.
  SELECT COALESCE(sum(amount),0) INTO v_used
  FROM public.supplier_payments
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
    AND note = 'Credit note ' || p_return_id;

  v_left := v_amount - v_used;
  IF v_left <= 0.005 THEN
    RAISE EXCEPTION 'Credit note % is already fully offset', p_return_id;
  END IF;

  FOR bill IN
    SELECT id, total_amount, COALESCE(paid_amount,0) AS paid
      FROM public.purchases
     WHERE tenant_id = p_tenant_id AND supplier_id = v_sup AND deleted_at IS NULL
       AND UPPER(COALESCE(payment_type,'')) IN ('CREDIT','UDHAAR','POST-CAPITAL')
       AND (total_amount - COALESCE(paid_amount,0)) > 0.005
     ORDER BY date ASC, created_at ASC
  LOOP
    EXIT WHEN v_left <= 0.005;
    v_take := LEAST(v_left, bill.total_amount - bill.paid);

    INSERT INTO public.supplier_payments
      (id, tenant_id, supplier_id, supplier_name, amount, payment_method,
       date, reference_no, note, purchase_id)
    SELECT p_return_id || '-OFF' || v_n, p_tenant_id, v_sup, s.name, v_take,
           'CREDIT_NOTE', CURRENT_DATE, NULL, 'Credit note ' || p_return_id, bill.id
      FROM public.suppliers s WHERE s.id = v_sup AND s.tenant_id = p_tenant_id;

    UPDATE public.purchases
       SET paid_amount = COALESCE(paid_amount,0) + v_take, updated_at = now()
     WHERE id = bill.id AND tenant_id = p_tenant_id;

    v_left    := v_left - v_take;
    v_applied := v_applied + v_take;
    v_n       := v_n + 1;
  END LOOP;

  IF v_applied <= 0.005 THEN
    RAISE EXCEPTION 'No open credit bills for this supplier to offset against';
  END IF;

  RETURN v_applied;
END $function$;
