-- Estimates / Quotations — non-binding quotes that convert into a sale.
-- Mirrors invoice money fields; never touches stock or payments.
-- Status: DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED | CONVERTED.

create table if not exists public.estimates (
  id text primary key, tenant_id uuid not null,
  estimate_number text, estimate_date text, valid_until date,
  client_id text, client_name text, client_gstin text, client_address text, client_phone text,
  place_of_supply text, is_interstate boolean default false,
  items jsonb default '[]'::jsonb,
  taxable_amount numeric default 0, tax_total numeric default 0,
  cgst_amount numeric default 0, sgst_amount numeric default 0, igst_amount numeric default 0,
  discount_total numeric default 0, round_off numeric default 0, grand_total numeric default 0,
  status text default 'DRAFT', converted_invoice_id text, converted_sale_id text,
  notes text, created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);
create index if not exists idx_estimates_tenant_created on public.estimates(tenant_id, created_at desc);
alter table public.estimates enable row level security;

drop policy if exists estimates_select on public.estimates;
drop policy if exists estimates_insert on public.estimates;
drop policy if exists estimates_update on public.estimates;
drop policy if exists estimates_delete on public.estimates;
create policy estimates_select on public.estimates for select using (tenant_id = current_tenant_id() or is_global_admin());
create policy estimates_insert on public.estimates for insert with check (tenant_id = current_tenant_id() or is_global_admin());
create policy estimates_update on public.estimates for update using (tenant_id = current_tenant_id() or is_global_admin()) with check (tenant_id = current_tenant_id() or is_global_admin());
create policy estimates_delete on public.estimates for delete using (tenant_id = current_tenant_id() or is_global_admin());
