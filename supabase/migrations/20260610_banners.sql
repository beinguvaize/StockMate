-- In-app promo/announcement banners (dashboard carousels, web + mobile).
-- Managed by global admin; tenants read active ones in their date window.
-- Applied dev + prod with 3 seed banners.
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  cta_label text,
  cta_url text,
  gradient text default 'amber',     -- amber | indigo | emerald | slate | rose
  emoji text,
  audience_plan text,                -- null = all plans
  starts_at timestamptz default now(),
  ends_at timestamptz,
  active boolean default true,
  sort int default 0,
  created_at timestamptz default now()
);
alter table public.banners enable row level security;
drop policy if exists banners_read on public.banners;
create policy banners_read on public.banners for select to authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()));
drop policy if exists banners_admin on public.banners;
create policy banners_admin on public.banners for all to authenticated
  using (is_global_admin()) with check (is_global_admin());
