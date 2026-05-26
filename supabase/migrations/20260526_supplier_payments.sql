-- Money paid OUT to suppliers to settle credit purchases.
-- Mirror of client_payments but reverse direction.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-26.
create table if not exists public.supplier_payments (
  id              text primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  supplier_id     text not null,
  supplier_name   text,
  amount          numeric(14,2) not null check (amount > 0),
  payment_method  text not null default 'CASH' check (payment_method in ('CASH','BANK','UPI','CHEQUE','OTHER')),
  reference_no    text,
  date            date not null default current_date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_supplier_payments_tenant_date on public.supplier_payments (tenant_id, date desc);
create index if not exists idx_supplier_payments_supplier    on public.supplier_payments (supplier_id);
create index if not exists idx_supplier_payments_created     on public.supplier_payments (created_at desc);

alter table public.supplier_payments enable row level security;
create policy tenant_select on public.supplier_payments for select using  (tenant_id = current_tenant_id() or is_global_admin());
create policy tenant_insert on public.supplier_payments for insert with check (tenant_id = current_tenant_id() or is_global_admin());
create policy tenant_update on public.supplier_payments for update using  (tenant_id = current_tenant_id() or is_global_admin());
create policy tenant_delete on public.supplier_payments for delete using  (tenant_id = current_tenant_id() or is_global_admin());

alter publication supabase_realtime add table public.supplier_payments;

create or replace function public.settle_supplier_payment(
  p_id text, p_tenant_id uuid, p_supplier_id text, p_amount numeric,
  p_method text default 'CASH', p_date date default current_date,
  p_reference_no text default null, p_note text default null
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_name text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select name into v_name from public.suppliers where id = p_supplier_id and tenant_id = p_tenant_id;
  insert into public.supplier_payments
    (id, tenant_id, supplier_id, supplier_name, amount, payment_method, date, reference_no, note)
  values (p_id, p_tenant_id, p_supplier_id, v_name, p_amount, p_method, p_date, p_reference_no, p_note);
  update public.suppliers
     set balance = greatest(0, coalesce(balance, 0) - p_amount),
         outstanding_balance = greatest(0, coalesce(outstanding_balance, 0) - p_amount),
         updated_at = now()
   where id = p_supplier_id and tenant_id = p_tenant_id;
end;
$$;
