-- Fix settle_supplier_payment — suppliers has no outstanding_balance column.
-- Backfill historical credit purchases into suppliers.balance.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-26.
create or replace function public.settle_supplier_payment(
  p_id text, p_tenant_id uuid, p_supplier_id text, p_amount numeric,
  p_method text default 'CASH', p_date date default current_date,
  p_reference_no text default null, p_note text default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_name text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select name into v_name from public.suppliers
   where id = p_supplier_id and tenant_id = p_tenant_id;
  insert into public.supplier_payments
    (id, tenant_id, supplier_id, supplier_name, amount, payment_method, date, reference_no, note)
  values (p_id, p_tenant_id, p_supplier_id, v_name, p_amount, p_method, p_date, p_reference_no, p_note);
  update public.suppliers
     set balance = greatest(0, coalesce(balance, 0) - p_amount),
         updated_at = now()
   where id = p_supplier_id and tenant_id = p_tenant_id;
end $$;

with credit_owed as (
  select supplier_id, sum(total_amount) owed
    from public.purchases
   where deleted_at is null
     and upper(coalesce(payment_type, '')) in ('CREDIT','UDHAAR','POST-CAPITAL')
   group by supplier_id
),
paid as (
  select supplier_id, sum(amount) paid
    from public.supplier_payments
   where deleted_at is null
   group by supplier_id
)
update public.suppliers s
   set balance = greatest(0, coalesce(co.owed, 0) - coalesce(p.paid, 0)),
       updated_at = now()
  from credit_owed co
  left join paid p on p.supplier_id = co.supplier_id
 where s.id = co.supplier_id;
