-- R2 Table POS: floor tables + per-table running tab (open order).
create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  label text not null,
  section text,
  seats int default 4,
  sort int default 0,
  created_at timestamptz default now(),
  deleted_at timestamptz
);
create index if not exists idx_restaurant_tables_tenant_id on public.restaurant_tables (tenant_id);

-- One running tab per table. status OPEN until settled into a sale.
create table if not exists public.table_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  table_id uuid references public.restaurant_tables(id) on delete cascade,
  status text not null default 'OPEN',   -- OPEN | SETTLED | VOID
  cart jsonb not null default '[]'::jsonb,
  client_id text,
  notes text,
  sale_id text,
  opened_at timestamptz default now(),
  settled_at timestamptz
);
create index if not exists idx_table_orders_tenant_id on public.table_orders (tenant_id);
create index if not exists idx_table_orders_table_id on public.table_orders (table_id);
-- At most one OPEN tab per table.
create unique index if not exists uq_table_orders_open
  on public.table_orders (table_id) where status = 'OPEN';

alter table public.restaurant_tables enable row level security;
alter table public.table_orders enable row level security;

-- Mirror the standard tenant RLS pattern.
do $$
declare t text;
begin
  foreach t in array array['restaurant_tables','table_orders'] loop
    execute format('drop policy if exists tenant_select on public.%I', t);
    execute format('drop policy if exists tenant_insert on public.%I', t);
    execute format('drop policy if exists tenant_update on public.%I', t);
    execute format('drop policy if exists tenant_delete on public.%I', t);
    execute format($f$create policy tenant_select on public.%I for select using ((tenant_id = current_tenant_id()) or is_global_admin())$f$, t);
    execute format($f$create policy tenant_insert on public.%I for insert with check ((tenant_id = current_tenant_id()) or is_global_admin())$f$, t);
    execute format($f$create policy tenant_update on public.%I for update using ((tenant_id = current_tenant_id()) or is_global_admin())$f$, t);
    execute format($f$create policy tenant_delete on public.%I for delete using (((tenant_id = current_tenant_id()) and is_tenant_admin()) or is_global_admin())$f$, t);
  end loop;
end $$;
