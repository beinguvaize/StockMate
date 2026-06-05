-- settle_supplier_payment: auto-allocate a general (on-account) supplier
-- payment FIFO across the supplier's oldest unpaid credit purchases.
--
-- Before: the payment only reduced suppliers.balance and stored one
-- on-account row (purchase_id null), so per-order Paid/Due never updated —
-- orders kept showing full credit due while the payment floated separately.
--
-- After: the payment is split into one supplier_payments row per order it
-- covers (purchase_id set) and bumps purchases.paid_amount, oldest first.
-- Any leftover beyond all open dues is booked as a single on-account advance
-- row. Net suppliers.balance is unchanged (greatest(0, balance - amount)).
--
-- Per-order display (paidByPurchase from purchase_id) and FIFO due()
-- (from paid_amount) therefore stay in lockstep — no double-show.

CREATE OR REPLACE FUNCTION public.settle_supplier_payment(
  p_id text, p_tenant_id uuid, p_supplier_id text, p_amount numeric,
  p_method text DEFAULT 'CASH', p_date date DEFAULT CURRENT_DATE,
  p_reference_no text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
