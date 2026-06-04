-- R3 KOT: kitchen order tickets (restaurant). A table order is sent to the
-- kitchen as one or more tickets; items are grouped by station on the slip.
create table if not exists public.kot_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  table_id uuid references public.restaurant_tables(id) on delete set null,
  table_label text,
  ticket_no int not null default 0,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'NEW',   -- NEW | PREPARING | READY | SERVED
  created_at timestamptz default now()
);
create index if not exists idx_kot_tickets_tenant_id on public.kot_tickets (tenant_id);
create index if not exists idx_kot_tickets_table_id on public.kot_tickets (table_id);

alter table public.kot_tickets enable row level security;
create policy tenant_select on public.kot_tickets for select using ((tenant_id = current_tenant_id()) or is_global_admin());
create policy tenant_insert on public.kot_tickets for insert with check ((tenant_id = current_tenant_id()) or is_global_admin());
create policy tenant_update on public.kot_tickets for update using ((tenant_id = current_tenant_id()) or is_global_admin());
create policy tenant_delete on public.kot_tickets for delete using (((tenant_id = current_tenant_id()) and is_tenant_admin()) or is_global_admin());
