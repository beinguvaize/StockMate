-- Stage C: Services vertical — service duration + appointments.
alter table public.products add column if not exists duration_min int;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id text, client_name text,
  service_id text, service_name text,
  staff_id text,
  start_at timestamptz not null,
  duration_min int not null default 30,
  status text not null default 'BOOKED',   -- BOOKED | COMPLETED | CANCELLED | NOSHOW
  price numeric not null default 0,
  notes text, sale_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_appointments_tenant on public.appointments(tenant_id);
create index if not exists idx_appointments_start on public.appointments(tenant_id, start_at);
alter table public.appointments enable row level security;
create policy tenant_select on public.appointments for select using ((tenant_id = current_tenant_id()) or is_global_admin());
create policy tenant_insert on public.appointments for insert with check ((tenant_id = current_tenant_id()) or is_global_admin());
create policy tenant_update on public.appointments for update using ((tenant_id = current_tenant_id()) or is_global_admin());
create policy tenant_delete on public.appointments for delete using (((tenant_id = current_tenant_id()) and is_tenant_admin()) or is_global_admin());
