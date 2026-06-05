-- Billing core (Phase 1): subscription status mirror per tenant.
create table if not exists public.subscriptions (
  tenant_id uuid primary key,
  plan text not null default 'STARTER',
  status text not null default 'TRIAL',        -- TRIAL | ACTIVE | PAST_DUE | CANCELLED | EXPIRED
  amount numeric not null default 0,
  interval text not null default 'monthly',
  trial_end timestamptz,
  current_period_end timestamptz,
  gateway text, gateway_sub_id text, gateway_customer_id text,
  pm_last4 text, pm_brand text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy tenant_select on public.subscriptions for select using ((tenant_id = current_tenant_id()) or is_global_admin());
create policy admin_write on public.subscriptions for all using (is_global_admin()) with check (is_global_admin());
