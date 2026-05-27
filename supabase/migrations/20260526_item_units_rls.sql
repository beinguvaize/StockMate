-- item_units is a system catalog of measurement units (PCS, KG, etc).
-- No tenant_id — shared across all tenants. Read-only for everyone,
-- writes restricted to global admins.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-26.
alter table public.item_units enable row level security;

drop policy if exists item_units_read       on public.item_units;
drop policy if exists item_units_admin_all  on public.item_units;

create policy item_units_read on public.item_units
  for select using (true);

create policy item_units_admin_all on public.item_units
  for all using (is_global_admin()) with check (is_global_admin());
