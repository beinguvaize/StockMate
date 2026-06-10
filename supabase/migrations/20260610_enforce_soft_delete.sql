-- Server-enforced soft delete: BEFORE DELETE trigger converts any DELETE on
-- business tables into UPDATE deleted_at = now() and cancels the drop.
-- Protects against old app builds that still issue hard deletes.
-- NOT applied to users / price_lists / budgets / bank_transactions
-- (those deletes carry real semantics: access revocation / clear-setting).
-- Applied dev + prod. Verified: delete on products left row flagged.
create or replace function public.soft_delete_row()
returns trigger
language plpgsql
security definer
as $$
begin
  execute format(
    'update %I.%I set deleted_at = now() where id = $1 and deleted_at is null',
    tg_table_schema, tg_table_name
  ) using old.id;
  return null; -- cancel the physical delete
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'products','product_categories','inventory_locations','vehicles',
    'employees','payroll','expenses','sales','suppliers','clients',
    'appointments','orders','purchases','estimates','invoices'
  ] loop
    execute format('drop trigger if exists trg_soft_delete on public.%I', t);
    execute format(
      'create trigger trg_soft_delete before delete on public.%I
       for each row execute function public.soft_delete_row()', t);
  end loop;
end $$;
