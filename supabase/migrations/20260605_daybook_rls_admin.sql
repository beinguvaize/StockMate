-- Fix: Day Book opening balance not saving for global-admin users.
-- day_book insert/update with_check was tenant_id = current_tenant_id() only;
-- add OR is_global_admin() to match the other tenant tables.
drop policy if exists tenant_insert on public.day_book;
drop policy if exists tenant_update on public.day_book;
create policy tenant_insert on public.day_book for insert with check ((tenant_id = current_tenant_id()) or is_global_admin());
create policy tenant_update on public.day_book for update using ((tenant_id = current_tenant_id()) or is_global_admin());
