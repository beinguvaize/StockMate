-- Orders module was broken on prod: the orders + price_lists tables existed on
-- dev but were never created on prod (schema drift). useOrders fetch/insert
-- failed silently → could not create orders, and the pipeline showed only
-- invoices. Recreate both tables + tenant RLS on prod (mirrors dev).

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_number text not null,
  client_id text, client_name text not null default '',
  order_type text not null default 'B2B',
  price_tier text not null default 'RETAIL',
  status text not null default 'DRAFT',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  grand_total numeric not null default 0,
  notes text, requested_date date, route_id text, sale_id text, invoice_id text,
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);
create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tier text not null, product_id text not null, price numeric not null, min_qty integer not null default 1,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);
create index if not exists idx_orders_tenant_created on public.orders(tenant_id, created_at desc);
create index if not exists idx_price_lists_tenant on public.price_lists(tenant_id);
alter table public.orders enable row level security;
alter table public.price_lists enable row level security;

-- tenant RLS (select/insert/update/delete) with global-admin bypass
do $$
declare t text;
begin
  foreach t in array array['orders','price_lists'] loop
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format('drop policy if exists %I_ins on public.%I', t, t);
    execute format('drop policy if exists %I_upd on public.%I', t, t);
    execute format('drop policy if exists %I_del on public.%I', t, t);
    execute format('create policy %I_sel on public.%I for select using (tenant_id = current_tenant_id() or is_global_admin())', t, t);
    execute format('create policy %I_ins on public.%I for insert with check (tenant_id = current_tenant_id() or is_global_admin())', t, t);
    execute format('create policy %I_upd on public.%I for update using (tenant_id = current_tenant_id() or is_global_admin()) with check (tenant_id = current_tenant_id() or is_global_admin())', t, t);
    execute format('create policy %I_del on public.%I for delete using (tenant_id = current_tenant_id() or is_global_admin())', t, t);
  end loop;
end $$;
