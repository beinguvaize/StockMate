-- e-Way bill fields on invoices (Phase 4). Applied dev + prod.
alter table public.invoices
  add column if not exists vehicle_no text,
  add column if not exists eway_no text,
  add column if not exists transport jsonb;
