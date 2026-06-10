-- Learned bill-text -> product mappings ("alias memory" for bill OCR).
-- Written when a user manually links a scanned line to a product; read on
-- every scan so repeat supplier bills auto-match. Applied dev + prod.
create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  supplier_id text,                 -- null = applies to any supplier
  alias_norm text not null,         -- normalized bill text (lowercase, alnum)
  alias_raw text,                   -- original bill text for display
  product_id text not null,
  created_at timestamptz default now(),
  unique (tenant_id, supplier_id, alias_norm)
);
alter table public.product_aliases enable row level security;
drop policy if exists product_aliases_all on public.product_aliases;
create policy product_aliases_all on public.product_aliases
  for all to authenticated
  using (tenant_id = current_tenant_id() or is_global_admin())
  with check (tenant_id = current_tenant_id() or is_global_admin());
notify pgrst, 'reload schema';
