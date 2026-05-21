-- Add 60-day trial end date to tenants
-- New signups get status='TRIAL' + trial_end_date = now + 60 days (set in create-tenant edge fn)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_end_date timestamptz DEFAULT NULL;
