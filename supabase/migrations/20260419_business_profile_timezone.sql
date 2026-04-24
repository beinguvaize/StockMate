-- Add per-tenant timezone + locale overrides to business_profile. Null means
-- derive from country via client-side COUNTRY_TZ lookup in lib/utils.js.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS locale text;

COMMENT ON COLUMN public.business_profile.timezone IS
  'IANA timezone (e.g. Asia/Kolkata, America/New_York). Null -> derive from country.';
COMMENT ON COLUMN public.business_profile.locale IS
  'BCP47 locale (e.g. en-IN, en-US). Null -> derive from country.';
