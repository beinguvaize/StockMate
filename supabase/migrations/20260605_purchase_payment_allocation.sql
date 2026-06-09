-- Per-order supplier payments: link payments to a specific purchase.
alter table public.purchases add column if not exists paid_amount numeric not null default 0;
alter table public.supplier_payments add column if not exists purchase_id text;

create or replace function public.settle_purchase_payment(
  p_id text, p_tenant_id uuid, p_supplier_id text, p_purchase_id text,
  p_amount numeric, p_method text default 'CASH', p_date date default current_date,
  p_reference_no text default null, p_note text default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_name text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select name into v_name from public.suppliers where id = p_supplier_id and tenant_id = p_tenant_id;
  insert into public.supplier_payments (id, tenant_id, supplier_id, supplier_name, amount, payment_method, date, reference_no, note, purchase_id)
  values (p_id, p_tenant_id, p_supplier_id, v_name, p_amount, p_method, p_date, p_reference_no, p_note, p_purchase_id);
  if p_purchase_id is not null then
    update public.purchases set paid_amount = coalesce(paid_amount,0) + p_amount where id = p_purchase_id and tenant_id = p_tenant_id;
  end if;
  update public.suppliers set balance = greatest(0, coalesce(balance,0) - p_amount), updated_at = now()
   where id = p_supplier_id and tenant_id = p_tenant_id;
end $$;
