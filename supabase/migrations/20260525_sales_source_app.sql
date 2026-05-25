-- Track which client placed each sale: WEB / DESKTOP / MOBILE / VAN.
-- Default WEB so the existing audit retains its meaning (all sales to
-- date were placed from the web app). Mobile and desktop set the
-- appropriate value at insert time.
-- Applied to project lmviftlynuhopzmvaxeu on 2026-05-25.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS source_app text NOT NULL DEFAULT 'WEB';

COMMENT ON COLUMN public.sales.source_app IS
  'Which client created the sale: WEB | DESKTOP | MOBILE | VAN.';
