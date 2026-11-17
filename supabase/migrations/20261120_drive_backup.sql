-- Automatic Google Drive backup.
--
-- The owner connects a Google Drive once; the drive-backup edge function then
-- makes the shop's format-2 backup file every night and uploads it. Everything
-- runs server-side so it works with no device open.
--
-- The refresh token is the only secret here. It is stored AES-GCM encrypted
-- (key DRIVE_TOKEN_KEY lives in the function's env, never in the database) and
-- the table has no grants to anon/authenticated: only the service role reads
-- it. The app learns the non-secret columns through drive_backup_status().

CREATE TABLE IF NOT EXISTS public.drive_backup_links (
  tenant_id          uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  google_email       text,
  refresh_token_enc  text NOT NULL,
  folder_id          text NOT NULL,
  enabled            boolean NOT NULL DEFAULT true,
  last_backup_at     timestamptz,
  last_status        text,
  last_error         text,
  last_file_id       text,
  last_size_bytes    bigint,
  connected_by       uuid,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_backup_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_backup_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.drive_backup_links TO service_role;

-- Owner-only status for the app. Also hands the edge function the caller's
-- tenant (it calls this with the caller's JWT), so "who is the owner of which
-- shop" is decided in exactly one place: _assert_shop_owner.
CREATE OR REPLACE FUNCTION public.drive_backup_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  r public.drive_backup_links;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No shop for this user' USING ERRCODE = '42501';
  END IF;
  PERFORM public._assert_shop_owner(v_tenant);
  SELECT * INTO r FROM public.drive_backup_links WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('tenant_id', v_tenant, 'connected', false);
  END IF;
  RETURN jsonb_build_object(
    'tenant_id', v_tenant, 'connected', true,
    'google_email', r.google_email, 'enabled', r.enabled,
    'last_backup_at', r.last_backup_at, 'last_status', r.last_status,
    'last_error', r.last_error, 'last_size_bytes', r.last_size_bytes,
    'connected_at', r.connected_at);
END
$$;

REVOKE ALL ON FUNCTION public.drive_backup_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.drive_backup_status() TO authenticated, service_role;

-- Service-role export path. export_shop_table / shop_backup_manifest call
-- _assert_shop_owner, which needs auth.uid(); a service-role call has none and
-- is (rightly) refused, so the nightly job cannot use them. Rather than loosen
-- that check, these two are the same reads, granted to service_role ONLY. The
-- table list still comes from shop_backup_tables(), so it cannot drift.
CREATE OR REPLACE FUNCTION public.drive_export_manifest(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r   record;
  n   bigint;
  out jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(auth.role(), current_setting('request.jwt.claim.role', true)) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR r IN SELECT * FROM public.shop_backup_tables() LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id::text = $1', r.table_name)
      INTO n USING p_tenant_id::text;
    out := out || jsonb_build_object('table', r.table_name, 'ord', r.ord, 'mode', r.mode, 'count', n);
  END LOOP;
  RETURN out;
END
$$;

CREATE OR REPLACE FUNCTION public.drive_export_table(
  p_tenant_id uuid, p_table text, p_offset int DEFAULT 0, p_limit int DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order text;
  v_rows  jsonb;
BEGIN
  IF coalesce(auth.role(), current_setting('request.jwt.claim.role', true)) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_backup_tables() t WHERE t.table_name = p_table) THEN
    RAISE EXCEPTION 'BACKUP_INVALID: % is not one of this shop''s tables', p_table;
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'BACKUP_INVALID: page size must be between 1 and 5000';
  END IF;
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY array_position(i.indkey, a.attnum))
    INTO v_order
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = ('public.' || quote_ident(p_table))::regclass AND i.indisprimary;
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (
       SELECT * FROM public.%I WHERE tenant_id::text = $1 ORDER BY %s LIMIT $2 OFFSET $3
     ) x',
    p_table, COALESCE(v_order, '1'))
    INTO v_rows USING p_tenant_id::text, p_limit, GREATEST(p_offset, 0);
  RETURN v_rows;
END
$$;

REVOKE ALL ON FUNCTION public.drive_export_manifest(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drive_export_table(uuid, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drive_export_manifest(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.drive_export_table(uuid, text, int, int) TO service_role;

-- Nightly trigger: 21:00 UTC = 02:30 IST. pg_cron, pg_net and supabase_vault
-- are all installed on prod. The secret is read from the vault AT RUN TIME, so
-- the owner must create it once (same value as the function's DRIVE_CRON_SECRET):
--   select vault.create_secret('<value>', 'drive_cron_secret');
-- Until then the job sends an empty header and the function answers 401.
-- The function itself skips shops backed up in the last 20h, so a double fire
-- is harmless.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'drive-backup-nightly';
    PERFORM cron.schedule(
      'drive-backup-nightly', '0 21 * * *',
      $job$
      select net.http_post(
        url := 'https://lmviftlynuhopzmvaxeu.supabase.co/functions/v1/drive-backup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'drive_cron_secret'), '')),
        body := '{"action":"cron"}'::jsonb,
        timeout_milliseconds := 5000);
      $job$);
  END IF;
END
$cron$;
