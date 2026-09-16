-- Money paid to a supplier beyond their open bills becomes an on-account
-- advance: settle_supplier_payment allocates what it can and drops the leftover
-- into a supplier_payments row with purchase_id NULL.
--
-- Nothing ever consumed it. HASSAN KOUSER's Rs 2,390 has sat there since 29 Jun
-- (SUPP-MR0IJWLF-1, the "-1" being that very leftover), while he went on to
-- bill Rs 8,200 across 17-25 Jul. That cash should have paid those bills, and
-- could not.
--
-- This adds the missing step. It is ledger-neutral: supplier_payments carries
-- no triggers, and the cash entries for supplier payments are posted separately
-- by the client at the time money actually moves. Reshuffling allocation rows
-- moves no money and touches no account.

CREATE OR REPLACE FUNCTION public.apply_supplier_advances(
  p_tenant_id uuid,
  p_supplier_id text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_applied numeric := 0;
  v_left    numeric;
  v_take    numeric;
  v_n       int;
  adv       record;
  bill      record;
BEGIN
  IF p_tenant_id IS NULL OR p_supplier_id IS NULL THEN RETURN 0; END IF;

  -- Oldest advance first, so the earliest money is used up first.
  FOR adv IN
    SELECT id, amount, payment_method, date, supplier_name
      FROM public.supplier_payments
     WHERE tenant_id = p_tenant_id AND supplier_id = p_supplier_id
       AND purchase_id IS NULL AND deleted_at IS NULL
       AND COALESCE(amount,0) > 0.005
     ORDER BY date ASC, id ASC
  LOOP
    v_left := adv.amount;
    v_n    := 0;

    FOR bill IN
      SELECT id, total_amount, COALESCE(paid_amount,0) AS paid
        FROM public.purchases
       WHERE tenant_id = p_tenant_id AND supplier_id = p_supplier_id
         AND deleted_at IS NULL
         AND UPPER(COALESCE(payment_type,'')) IN ('CREDIT','UDHAAR','POST-CAPITAL')
         AND (total_amount - COALESCE(paid_amount,0)) > 0.005
       ORDER BY date ASC, created_at ASC
    LOOP
      EXIT WHEN v_left <= 0.005;
      v_take := LEAST(v_left, bill.total_amount - bill.paid);

      -- Record where this slice of the advance landed, keeping the original
      -- row's id visible so the trail from advance to bill stays readable.
      INSERT INTO public.supplier_payments
        (id, tenant_id, supplier_id, supplier_name, amount, payment_method,
         date, reference_no, note, purchase_id)
      VALUES
        (adv.id || '-APP' || v_n, p_tenant_id, p_supplier_id, adv.supplier_name,
         v_take, adv.payment_method, adv.date, NULL,
         'Applied from advance ' || adv.id, bill.id);

      UPDATE public.purchases
         SET paid_amount = COALESCE(paid_amount,0) + v_take, updated_at = now()
       WHERE id = bill.id AND tenant_id = p_tenant_id;

      v_left    := v_left - v_take;
      v_applied := v_applied + v_take;
      v_n       := v_n + 1;
    END LOOP;

    IF v_n > 0 THEN
      IF v_left <= 0.005 THEN
        -- Fully consumed. Soft delete, never hard: the allocation rows carry
        -- the same money and this row is the receipt it came from.
        UPDATE public.supplier_payments
           SET deleted_at = now()
         WHERE id = adv.id AND tenant_id = p_tenant_id;
      ELSE
        UPDATE public.supplier_payments
           SET amount = v_left
         WHERE id = adv.id AND tenant_id = p_tenant_id;
      END IF;
    END IF;
  END LOOP;

  RETURN v_applied;
END $function$;

-- Consume anything already sitting on account before taking new money, so a
-- payment cannot stack a second advance on top of an unused one.
CREATE OR REPLACE FUNCTION public.settle_supplier_payment(
  p_id text,
  p_tenant_id uuid,
  p_supplier_id text,
  p_amount numeric,
  p_method text DEFAULT 'CASH'::text,
  p_date date DEFAULT CURRENT_DATE,
  p_reference_no text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_name text;
  v_remaining numeric := p_amount;
  v_apply numeric;
  v_due numeric;
  v_n int := 0;
  v_row_id text;
  r record;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select name into v_name from public.suppliers where id = p_supplier_id and tenant_id = p_tenant_id;

  -- Spend what is already on account first. Without this a supplier could hold
  -- an unused advance while their newer bills sat open, which is exactly how
  -- HASSAN KOUSER's Rs 2,390 became stranded.
  perform public.apply_supplier_advances(p_tenant_id, p_supplier_id);

  update public.suppliers
     set balance = greatest(0, coalesce(balance,0) - p_amount), updated_at = now()
   where id = p_supplier_id and tenant_id = p_tenant_id;

  -- FIFO: allocate to oldest unpaid credit purchases (one payment row per order)
  for r in
    select id, total_amount, coalesce(paid_amount,0) as paid
      from public.purchases
     where supplier_id = p_supplier_id and tenant_id = p_tenant_id and deleted_at is null
       and upper(coalesce(payment_type,'')) in ('CREDIT','UDHAAR','POST-CAPITAL')
       and (total_amount - coalesce(paid_amount,0)) > 0.005
     order by date asc, created_at asc
  loop
    exit when v_remaining <= 0.005;
    v_due   := r.total_amount - r.paid;
    v_apply := least(v_remaining, v_due);
    v_row_id := case when v_n = 0 then p_id else p_id || '-' || v_n end;
    insert into public.supplier_payments
      (id, tenant_id, supplier_id, supplier_name, amount, payment_method, date, reference_no, note, purchase_id)
    values (v_row_id, p_tenant_id, p_supplier_id, v_name, v_apply, p_method, p_date, p_reference_no, p_note, r.id);
    update public.purchases set paid_amount = coalesce(paid_amount,0) + v_apply, updated_at = now()
      where id = r.id and tenant_id = p_tenant_id;
    v_remaining := v_remaining - v_apply;
    v_n := v_n + 1;
  end loop;

  -- leftover (advance, or no open credit orders) -> single on-account row
  if v_remaining > 0.005 then
    v_row_id := case when v_n = 0 then p_id else p_id || '-' || v_n end;
    insert into public.supplier_payments
      (id, tenant_id, supplier_id, supplier_name, amount, payment_method, date, reference_no, note, purchase_id)
    values (v_row_id, p_tenant_id, p_supplier_id, v_name, v_remaining, p_method, p_date, p_reference_no, p_note, null);
  end if;
end $function$;
