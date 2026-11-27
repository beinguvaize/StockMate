-- Share an invoice with the client through a link they can open without
-- signing in.
--
-- WHY A LINK NEEDS ITS OWN TABLE
--
-- Invoice ids are short and guessable, so an id must never work as a public
-- key. The client gets a random token instead: 32 bytes from pgcrypto, sent
-- once in the share message and never stored. Only its SHA-256 is kept, so a
-- read of these tables (or a backup of them) cannot be turned into a working
-- link.
--
-- ONE LINK, MANY TOKENS
--
-- There is one live link per invoice. It carries the expiry (60 days), the
-- revoke switch and the view count. Each time the shop shares the invoice a
-- new token is minted ON THAT LINK, because the raw token of an earlier share
-- cannot be read back (only its hash exists). Every token of a link stops
-- working the moment the link is revoked or expires, so "Stop sharing" stops
-- every message ever sent for that invoice.
--
-- WHO CAN DO WHAT
--
--   invoice_share_links    members of the shop read their own; nobody writes
--                          directly; the functions below do
--   invoice_share_tokens   nobody reads or writes directly
--   invoice_share_events   members read their own; written by a function
--   invoice_share_rate_limits  nobody; used by the public view function
--   anon                   nothing at all. The public page reaches the data
--                          only through invoice_share_resolve, which only the
--                          service role (the invoice-view Edge Function) may run.
--
-- BACKUP AND RESTORE
--
-- None of these tables is shop data in the backup sense. A restore that put
-- back old links would revive links the shop had stopped, and old tokens would
-- match again; a restore that wiped them would break links already sent. So
-- they are left out of shop backups (see the end of this file) and a restore
-- leaves them exactly as they are. A link whose invoice no longer exists after
-- a restore, or now carries a different invoice number, simply shows "This
-- link is no longer available". There are no triggers on these tables, so
-- there is nothing for the app.restoring guard to stand aside.
--
-- Idempotent and additive: safe to run twice.

-- ── tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_share_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  invoice_id      text NOT NULL,
  -- The number the invoice had when the link was made. If an id is ever
  -- reused (after a restore) the link refuses to show a different invoice.
  invoice_number  text,
  pdf_path        text NOT NULL,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  revoked_at      timestamptz,
  revoked_by      text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  view_count      integer NOT NULL DEFAULT 0,
  last_viewed_at  timestamptz
);

-- One live link per invoice. Expired links are closed (revoked_at set) by
-- invoice_share_link_issue before a new one is made, so they never block it.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_share_links_one_live
  ON public.invoice_share_links (tenant_id, invoice_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoice_share_tokens (
  token_hash  text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  link_id     uuid NOT NULL REFERENCES public.invoice_share_links(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_share_tokens_link ON public.invoice_share_tokens (link_id);

CREATE TABLE IF NOT EXISTS public.invoice_share_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  invoice_id  text NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'share_sheet', 'download', 'link_copy')),
  method      text,
  recipient   text,
  status      text NOT NULL CHECK (status IN ('opened', 'downloaded', 'copied', 'cancelled', 'failed')),
  error       text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_share_events_invoice
  ON public.invoice_share_events (tenant_id, invoice_id, created_at DESC);

-- No tenant_id on purpose: this is the public page's counter, not shop data.
CREATE TABLE IF NOT EXISTS public.invoice_share_rate_limits (
  bucket_key    text NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

ALTER TABLE public.invoice_share_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_share_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_share_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_share_rate_limits ENABLE ROW LEVEL SECURITY;

-- New public tables get ALL for anon and authenticated by default here.
REVOKE ALL ON public.invoice_share_links, public.invoice_share_tokens,
              public.invoice_share_events, public.invoice_share_rate_limits
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoice_share_links, public.invoice_share_events TO authenticated;

DROP POLICY IF EXISTS invoice_share_links_select ON public.invoice_share_links;
CREATE POLICY invoice_share_links_select ON public.invoice_share_links
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS invoice_share_events_select ON public.invoice_share_events;
CREATE POLICY invoice_share_events_select ON public.invoice_share_events
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));
-- invoice_share_tokens and invoice_share_rate_limits: no policies, so RLS
-- returns nothing to anyone but the table owner.

-- ── helpers ─────────────────────────────────────────────────────────────────

-- Where the shared PDF lives: <tenant>/<invoice>.pdf. An id with characters a
-- storage key should not carry is replaced by its md5, so two ids can never
-- write to one file.
CREATE OR REPLACE FUNCTION public.invoice_share_pdf_path(p_tenant uuid, p_invoice_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_tenant::text || '/' ||
         CASE WHEN p_invoice_id ~ '^[A-Za-z0-9._-]{1,120}$' AND p_invoice_id !~ '^\.'
              THEN p_invoice_id ELSE md5(p_invoice_id) END || '.pdf'
$$;

-- ── make (or reuse) the link and mint a token ───────────────────────────────

CREATE OR REPLACE FUNCTION public.invoice_share_link_issue(p_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     text := (auth.uid())::text;
  v_tenant  uuid := public.current_tenant_id();
  v_inv     record;
  v_link    public.invoice_share_links%ROWTYPE;
  v_raw     bytea;
  v_token   text;
  v_tokens  int;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sign in again to share this invoice' USING ERRCODE = '28000';
  END IF;

  SELECT i.tenant_id, i.invoice_number, i.deleted_at INTO v_inv
    FROM public.invoices i WHERE i.id = p_invoice_id;
  -- Another shop's invoice gets the same answer as a missing one, so this
  -- cannot be used to find out which ids exist elsewhere.
  IF NOT FOUND OR v_inv.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invoice was deleted, so it cannot be shared' USING ERRCODE = 'P0001';
  END IF;

  -- Two shares of one invoice at once must land on one link.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice_share:' || v_tenant::text || ':' || p_invoice_id, 0));

  SELECT * INTO v_link FROM public.invoice_share_links
   WHERE tenant_id = v_tenant AND invoice_id = p_invoice_id AND revoked_at IS NULL
   FOR UPDATE;

  IF FOUND AND (v_link.expires_at <= now()
                OR v_link.invoice_number IS DISTINCT FROM v_inv.invoice_number) THEN
    UPDATE public.invoice_share_links
       SET revoked_at = now(), revoked_by = 'system:expired'
     WHERE id = v_link.id;
    v_link := NULL;
  END IF;

  IF v_link.id IS NULL THEN
    INSERT INTO public.invoice_share_links (tenant_id, invoice_id, invoice_number, pdf_path, created_by)
    VALUES (v_tenant, p_invoice_id, v_inv.invoice_number,
            public.invoice_share_pdf_path(v_tenant, p_invoice_id), v_uid)
    RETURNING * INTO v_link;
  END IF;

  SELECT count(*) INTO v_tokens FROM public.invoice_share_tokens WHERE link_id = v_link.id;
  IF v_tokens >= 200 THEN
    RAISE EXCEPTION 'This invoice has been shared too many times. Stop sharing it, then share again.'
      USING ERRCODE = 'P0001';
  END IF;

  v_raw   := extensions.gen_random_bytes(32);
  v_token := rtrim(translate(encode(v_raw, 'base64'), '+/', '-_'), '=');
  INSERT INTO public.invoice_share_tokens (token_hash, link_id, tenant_id, created_by)
  VALUES (encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), v_link.id, v_tenant, v_uid);

  -- The raw token leaves here once and is never stored.
  RETURN jsonb_build_object(
    'token',      v_token,
    'link_id',    v_link.id,
    'pdf_path',   v_link.pdf_path,
    'expires_at', v_link.expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.invoice_share_link_issue(text) IS
  'Reuses the live share link of an invoice in the caller''s shop (or makes one) and returns a new raw token once. Only its SHA-256 is stored.';

-- ── stop sharing ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoice_share_link_revoke(p_invoice_id text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    text := (auth.uid())::text;
  v_tenant uuid := public.current_tenant_id();
  v_n      int;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sign in again to change sharing' USING ERRCODE = '28000';
  END IF;
  UPDATE public.invoice_share_links
     SET revoked_at = now(), revoked_by = v_uid
   WHERE tenant_id = v_tenant AND invoice_id = p_invoice_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── the share log ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoice_share_event_log(
  p_invoice_id text,
  p_channel    text,
  p_status     text,
  p_method     text DEFAULT NULL,
  p_recipient  text DEFAULT NULL,
  p_error      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    text := (auth.uid())::text;
  v_tenant uuid := public.current_tenant_id();
  v_id     uuid;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sign in again' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = p_invoice_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.invoice_share_events
    (tenant_id, invoice_id, channel, method, recipient, status, error, created_by)
  VALUES (
    v_tenant, p_invoice_id, p_channel, left(p_method, 40),
    -- The app sends a masked recipient already; mask again here so a number
    -- or address never lands in full even from an older or edited client.
    CASE
      WHEN p_recipient IS NULL THEN NULL
      WHEN position('@' in p_recipient) > 0 THEN
        left(regexp_replace(p_recipient, '^(.)[^@]*@', '\1***@'), 64)
      ELSE left(regexp_replace(p_recipient, '[0-9](?=[0-9]{4})', '*', 'g'), 32)
    END,
    p_status, left(p_error, 500), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── the public page's only door ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoice_share_rate_hit(p_key text, p_limit int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_hits  int;
BEGIN
  INSERT INTO public.invoice_share_rate_limits AS r (bucket_key, window_start, hits)
  VALUES (left(p_key, 100), v_start, 1)
  ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING hits INTO v_hits;
  -- Old windows are cleared now and then by the same calls that fill them.
  IF random() < 0.02 THEN
    DELETE FROM public.invoice_share_rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN v_hits <= p_limit;
END;
$$;

-- Looks a token up by its hash and returns only what the public page shows.
-- Every failure is the same {"ok": false}, so the caller learns nothing about
-- why (unknown, revoked, expired, deleted are indistinguishable). `rate` is
-- separate only so the page can say "try again in a few minutes".
CREATE OR REPLACE FUNCTION public.invoice_share_resolve(
  p_token_hash text,
  p_client_key text,
  p_count_view boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_link  public.invoice_share_links%ROWTYPE;
  v_inv   record;
  v_biz   record;
  v_gone  constant jsonb := jsonb_build_object('ok', false);
  v_total numeric;
  v_due   numeric;
  v_gstin text;
BEGIN
  -- Per client first, before any lookup, so guessing tokens is throttled.
  IF NOT public.invoice_share_rate_hit('ip:' || coalesce(p_client_key, 'unknown'), 60, 600) THEN
    RETURN jsonb_build_object('ok', false, 'rate', true);
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN v_gone;
  END IF;
  IF NOT public.invoice_share_rate_hit('tok:' || left(p_token_hash, 32), 120, 3600) THEN
    RETURN jsonb_build_object('ok', false, 'rate', true);
  END IF;

  SELECT l.* INTO v_link
    FROM public.invoice_share_tokens t
    JOIN public.invoice_share_links l ON l.id = t.link_id AND l.tenant_id = t.tenant_id
   WHERE t.token_hash = p_token_hash;
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL OR v_link.expires_at <= now() THEN
    RETURN v_gone;
  END IF;

  SELECT i.invoice_number, i.invoice_date, i.date, i.grand_total, i.paid_amount,
         i.payment_status, i.deleted_at, i.tax_total
    INTO v_inv
    FROM public.invoices i
   WHERE i.id = v_link.invoice_id AND i.tenant_id = v_link.tenant_id;
  IF NOT FOUND OR v_inv.deleted_at IS NOT NULL
     OR v_inv.invoice_number IS DISTINCT FROM v_link.invoice_number THEN
    RETURN v_gone;
  END IF;

  SELECT b.name, b.gst_no INTO v_biz
    FROM public.business_profile b
   WHERE b.tenant_id = v_link.tenant_id AND b.deleted_at IS NULL
   ORDER BY b.updated_at DESC NULLS LAST
   LIMIT 1;

  IF p_count_view THEN
    UPDATE public.invoice_share_links
       SET view_count = view_count + 1, last_viewed_at = now()
     WHERE id = v_link.id;
  END IF;

  v_total := coalesce(v_inv.grand_total, 0);
  v_due   := CASE WHEN upper(coalesce(v_inv.payment_status, '')) = 'PAID' THEN 0
                  ELSE greatest(0, v_total - coalesce(v_inv.paid_amount, 0)) END;
  v_gstin := nullif(upper(btrim(coalesce(v_biz.gst_no, ''))), '');
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' THEN
    v_gstin := NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'shop_name',      coalesce(nullif(btrim(v_biz.name), ''), 'Shop'),
    'shop_gstin',     v_gstin,
    -- A registered seller's invoice is a tax invoice; otherwise call it what it is.
    'title',          CASE WHEN v_gstin IS NOT NULL THEN 'Tax invoice' ELSE 'Invoice' END,
    'invoice_number', v_inv.invoice_number,
    'invoice_date',   coalesce(nullif(v_inv.invoice_date, ''), to_char(v_inv.date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')),
    'grand_total',    v_total,
    'balance_due',    v_due,
    'pdf_path',       v_link.pdf_path
  );
END;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE re-grants EXECUTE to PUBLIC (and so to anon) by default.

REVOKE ALL ON FUNCTION public.invoice_share_pdf_path(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_share_link_issue(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_share_link_revoke(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_share_event_log(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_share_rate_hit(text, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_share_resolve(text, text, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.invoice_share_link_issue(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_share_link_revoke(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_share_event_log(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_share_resolve(text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_share_rate_hit(text, int, int) TO service_role;
GRANT ALL ON public.invoice_share_links, public.invoice_share_tokens,
             public.invoice_share_events, public.invoice_share_rate_limits TO service_role;

-- ── keep these tables out of shop backups ───────────────────────────────────
-- Anchored on the live body (same way 20261104b did), so a list changed since
-- is not overwritten. Skipped when already done.
DO $p$
DECLARE
  v_src text;
  v_old text := '''ai_answer_cache'', ''ai_usage''';
  v_new text := '''ai_answer_cache'', ''ai_usage'', ''invoice_share_links'', ''invoice_share_tokens'', ''invoice_share_events''';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'shop_backup_excluded' AND pronamespace = 'public'::regnamespace;
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'shop_backup_excluded not found';
  END IF;
  IF position('invoice_share_links' in v_src) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'anchor not found exactly once in shop_backup_excluded';
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.shop_backup_excluded()
RETURNS text[] LANGUAGE sql IMMUTABLE AS %L$f$, replace(v_src, v_old, v_new));
END $p$;
