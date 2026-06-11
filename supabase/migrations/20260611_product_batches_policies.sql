-- Expiry tracking pack: product_batches gains insert/update tenant policies
-- (only SELECT existed — writes were impossible) + uuid default on id.
-- Applied dev + prod.
alter table public.product_batches alter column id set default gen_random_uuid();
drop policy if exists pb_tenant_write on public.product_batches;
create policy pb_tenant_write on public.product_batches
  for insert to authenticated
  with check (tenant_id = current_tenant_id() or is_global_admin());
drop policy if exists pb_tenant_update on public.product_batches;
create policy pb_tenant_update on public.product_batches
  for update to authenticated
  using (tenant_id = current_tenant_id() or is_global_admin());
