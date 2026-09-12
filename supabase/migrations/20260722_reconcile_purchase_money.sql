-- Move the money when an edited purchase changes what was owed or paid.
--
-- handleEditPurchase updated total_amount, payment_type and supplier and then
-- stopped. Nothing adjusted the cash ledger, so a corrected amount left
-- account_transactions on the original figure; and nothing adjusted
-- suppliers.balance, so a CREDIT purchase's payable stayed stale. Editing a
-- 32,250 bill down to 1,032 moved the purchase register and left the money
-- side untouched.
--
-- Posts a CORRECTING entry rather than amending the original. Two reasons:
-- 10 of 62 existing PURCHASE ledger rows carry no ref_id (the multi-purchase
-- form never set one), so the original often cannot be found; and a ledger
-- correction should be visible as its own entry, not a silent rewrite of
-- history.
--
-- Cash only moves for non-credit purchases: a credit purchase pays nothing at
-- purchase time, it creates a payable. Switching between the two therefore
-- reverses one side and creates the other.
--
-- NOT idempotent — it posts deltas. The caller must invoke it exactly once per
-- edit. A call where nothing money-relevant changed is a no-op and safe.

CREATE OR REPLACE FUNCTION public.reconcile_purchase_money(
  p_purchase_id      text,
  p_tenant_id        uuid,
  p_old_total        numeric,
  p_old_payment_type text,
  p_old_supplier_id  text,
  p_account_id       text DEFAULT NULL     -- account for the method; ledger skipped when null
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total    numeric;
  v_new_type     text;
  v_new_supplier text;
  v_was_credit   boolean;
  v_is_credit    boolean;
  v_delta        numeric;
  v_dir          text;
  v_amt          numeric;
  v_note         text;
BEGIN
  IF NOT (is_global_admin() OR p_tenant_id = current_tenant_id()) THEN
    RAISE EXCEPTION 'Not authorised for tenant %', p_tenant_id;
  END IF;

  SELECT total_amount, payment_type, supplier_id
    INTO v_new_total, v_new_type, v_new_supplier
  FROM public.purchases
  WHERE id = p_purchase_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

  IF v_new_total IS NULL THEN
    RAISE EXCEPTION 'Purchase % not found for tenant %', p_purchase_id, p_tenant_id;
  END IF;

  v_was_credit := UPPER(COALESCE(p_old_payment_type,'')) IN ('CREDIT','UDHAAR','POST-CAPITAL');
  v_is_credit  := UPPER(COALESCE(v_new_type,''))         IN ('CREDIT','UDHAAR','POST-CAPITAL');

  -- Nothing money-relevant changed.
  IF v_new_total = p_old_total
     AND v_was_credit = v_is_credit
     AND v_new_supplier IS NOT DISTINCT FROM p_old_supplier_id THEN
    RETURN;
  END IF;

  v_note := 'Purchase ' || p_purchase_id || ' edited';

  -- ── Supplier payable ──────────────────────────────────────────────────────
  IF v_was_credit AND v_is_credit
     AND v_new_supplier IS NOT DISTINCT FROM p_old_supplier_id THEN
    -- Same supplier, still on credit: move only the difference.
    UPDATE public.suppliers SET balance = COALESCE(balance,0) + (v_new_total - p_old_total)
     WHERE id = v_new_supplier AND tenant_id = p_tenant_id;
  ELSE
    -- Any other combination: withdraw the old obligation, then create the new
    -- one. Covers a changed supplier and a switch between cash and credit.
    IF v_was_credit AND p_old_supplier_id IS NOT NULL THEN
      UPDATE public.suppliers SET balance = COALESCE(balance,0) - p_old_total
       WHERE id = p_old_supplier_id AND tenant_id = p_tenant_id;
    END IF;
    IF v_is_credit AND v_new_supplier IS NOT NULL THEN
      UPDATE public.suppliers SET balance = COALESCE(balance,0) + v_new_total
       WHERE id = v_new_supplier AND tenant_id = p_tenant_id;
    END IF;
  END IF;

  -- ── Cash ledger ───────────────────────────────────────────────────────────
  -- Left non-blocking, matching the rest of the app: a missing account should
  -- not fail the edit.
  IF p_account_id IS NOT NULL THEN
    IF NOT v_was_credit AND NOT v_is_credit THEN
      v_delta := v_new_total - p_old_total;      -- paid more, or got money back
      v_dir   := CASE WHEN v_delta > 0 THEN 'OUT' ELSE 'IN' END;
      v_amt   := ABS(v_delta);
      v_note  := v_note || ': amount ' || p_old_total || ' -> ' || v_new_total;
    ELSIF NOT v_was_credit AND v_is_credit THEN
      v_dir  := 'IN';   v_amt := p_old_total;    -- became credit: cash never left
      v_note := v_note || ': switched to credit, reversing cash paid';
    ELSIF v_was_credit AND NOT v_is_credit THEN
      v_dir  := 'OUT';  v_amt := v_new_total;    -- became cash: it is paid now
      v_note := v_note || ': switched from credit, recording cash paid';
    ELSE
      v_amt := 0;                                -- credit to credit: no cash moves
    END IF;

    IF v_amt > 0 THEN
      INSERT INTO public.account_transactions
        (id, tenant_id, account_id, date, direction, amount, mode, ref_type, ref_id, note)
      VALUES
        (gen_random_uuid()::text, p_tenant_id, p_account_id, CURRENT_DATE,
         v_dir, v_amt, v_new_type, 'PURCHASE_EDIT', p_purchase_id, v_note);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_purchase_money(text, uuid, numeric, text, text, text) TO authenticated;
