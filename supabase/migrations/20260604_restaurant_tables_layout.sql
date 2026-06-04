-- Floor-plan designer: spatial layout per table.
alter table public.restaurant_tables
  add column if not exists pos_x int,
  add column if not exists pos_y int,
  add column if not exists shape text not null default 'sq',   -- 'sq' | 'rd'
  add column if not exists width int not null default 84,
  add column if not exists height int not null default 84;
