-- In-app bug / issue reports. Surfaced via floating "Report Issue" button
-- and aggregated in Super-Admin Portal for triage.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-25.
create table if not exists public.bug_reports (
  id           uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete set null,
  user_id     text,
  user_email  text,
  title       text not null,
  description text not null,
  severity    text not null default 'NORMAL' check (severity in ('LOW','NORMAL','HIGH','CRITICAL')),
  source_app  text not null default 'WEB'    check (source_app in ('WEB','DESKTOP','MOBILE')),
  app_version text,
  page_url    text,
  user_agent  text,
  status      text not null default 'OPEN'   check (status in ('OPEN','TRIAGED','IN_PROGRESS','RESOLVED','WONTFIX')),
  admin_notes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_bug_reports_tenant_created on public.bug_reports (tenant_id, created_at desc);
create index if not exists idx_bug_reports_status         on public.bug_reports (status, created_at desc);
create index if not exists idx_bug_reports_severity       on public.bug_reports (severity);

alter table public.bug_reports enable row level security;

create policy tenant_self_insert on public.bug_reports for insert with check (tenant_id = current_tenant_id());
create policy tenant_self_select on public.bug_reports for select using  (tenant_id = current_tenant_id() or is_global_admin());
create policy admin_update       on public.bug_reports for update using (is_global_admin()) with check (is_global_admin());
create policy admin_delete       on public.bug_reports for delete using (is_global_admin());

alter publication supabase_realtime add table public.bug_reports;

create or replace function public.bug_reports_touch_updated()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_bug_reports_updated on public.bug_reports;
create trigger trg_bug_reports_updated before update on public.bug_reports
  for each row execute function public.bug_reports_touch_updated();
