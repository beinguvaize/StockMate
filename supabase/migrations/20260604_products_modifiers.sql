-- R4 Modifiers: per-dish modifier groups (restaurant). jsonb shape:
--   [{ id, name, multi:bool, required:bool, options:[{name, price}] }]
alter table public.products add column if not exists modifier_groups jsonb not null default '[]'::jsonb;
