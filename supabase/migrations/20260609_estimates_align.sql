-- Align the pre-existing `estimates` table with the app's useEstimates hook.
-- A legacy estimates table already existed (date/expiry_date/subtotal/
-- tax_amount/total_amount, no `items`, lowercase status check), so the earlier
-- `create table if not exists` was a no-op and inserts failed silently. Add the
-- columns the hook writes, relax the legacy NOT NULL `date`, and switch the
-- status check to the uppercase set the app uses. Applied dev + prod.

alter table public.estimates
  add column if not exists estimate_date text,
  add column if not exists valid_until date,
  add column if not exists client_address text,
  add column if not exists place_of_supply text,
  add column if not exists is_interstate boolean default false,
  add column if not exists items jsonb default '[]'::jsonb,
  add column if not exists taxable_amount numeric default 0,
  add column if not exists tax_total numeric default 0,
  add column if not exists cgst_amount numeric default 0,
  add column if not exists sgst_amount numeric default 0,
  add column if not exists igst_amount numeric default 0,
  add column if not exists discount_total numeric default 0,
  add column if not exists round_off numeric default 0,
  add column if not exists grand_total numeric default 0,
  add column if not exists converted_invoice_id text,
  add column if not exists converted_sale_id text,
  add column if not exists client_gstin text,
  add column if not exists client_phone text;

-- legacy policy referenced a non-app 'profiles' table — remove it
drop policy if exists tenant_estimates on public.estimates;
-- PostgREST caches the schema; reload so the new columns are insertable
-- (otherwise inserts hang / error "column not found in schema cache")
notify pgrst, 'reload schema';

alter table public.estimates alter column date drop not null;
alter table public.estimates alter column date set default now();

alter table public.estimates drop constraint if exists estimates_status_check;
alter table public.estimates add constraint estimates_status_check
  check (status = any (array['DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED']));
