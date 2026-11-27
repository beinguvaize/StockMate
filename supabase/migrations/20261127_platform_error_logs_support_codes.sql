-- Error messages with support codes: platform_error_logs learns the code,
-- the reference the shopkeeper reads out, and the outcome the screen showed.
-- ============================================================================
--
-- NOT APPLIED. Delivered as a file; it ships when the owner says so. The phone
-- and web work unchanged without it: their inserts are refused, quietly, and
-- the phone keeps at most 50 rows queued until this lands.
--
-- What a row now carries (phone: core/errors/error_report.dart toRow(); web:
-- src/lib/errorLogger.js logCodedError()):
--
--   error_code     the support code, e.g. NET-01, or SYNC-03 / DB-03 (existing)
--   reference_id   8 characters made on the phone at the moment of failure,
--                  so it exists offline. Unique: a queued row sent twice
--                  (lost reply) answers 23505 and the phone drops it.
--   outcome        NOT_SENT | MAY_HAVE_SAVED | NOT_SAVED | NO_CHANGE
--   module/action  the screen and what was being done (existing)
--   platform       phone-android, phone-ios, web
--   app_version    "1.7.36 (154)"
--   occurred_at    when it failed, UTC, from the device. created_at stays the
--                  server's arrival time; a queued row arrives later.
--   error_message  the raw error, scrubbed of tokens and personal values on
--                  the device BEFORE it is sent (existing)
--
-- Never stored: shop name, client name, amounts, phone numbers, typed values.
--
-- Shop restore: platform_error_logs is a platform table. It is listed in
-- shop_backup_excluded() (20261022_restore_a_shop_exactly.sql), so a restore
-- never touches it and this file adds no trigger; the app.restoring guard does
-- not apply.
--
-- Security. Before this file the table had three policies, all reading
-- auth.jwt() -> 'user_metadata'. user_metadata is written by the user
-- (supabase.auth.updateUser({ data: { role: 'GLOBAL_ADMIN' } })), so any
-- signed-in user could make themselves a "Global Admin" and read every shop's
-- error rows, or an "OWNER" and update any shop's rows (the UPDATE policy had
-- no tenant filter at all). Raw errors are about to carry more, so those three
-- are replaced with the same policies built on the server-side role functions
-- every other table uses (users.roles, users.tenant_id). Real owners and
-- global admins keep exactly the access they had.
--
-- No new SECURITY DEFINER function: clients INSERT directly, gated by RLS.
-- The existing record_platform_error() (SECURITY DEFINER, no tenant check) is
-- left as it is; web's older logError() still calls it. Tightening it is a
-- separate change.

-- ── 0. the table, for a database rebuilt from migrations ───────────────────
-- Production has had it since before migrations were kept. Same definition as
-- the dev schema dump; a no-op where it exists.
CREATE TABLE IF NOT EXISTS public.platform_error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    user_id uuid,
    user_role text,
    module text,
    action text,
    error_code text,
    error_message text,
    stack_trace text,
    severity text DEFAULT 'Medium'::text
      CHECK (severity = ANY (ARRAY['Critical','High','Medium','Low'])),
    status text DEFAULT 'New'::text
      CHECK (status = ANY (ARRAY['New','Acknowledged','Resolved'])),
    plan_tier text,
    created_at timestamp with time zone DEFAULT now()
);

-- ── 1. additive columns ─────────────────────────────────────────────────────
ALTER TABLE public.platform_error_logs
  ADD COLUMN IF NOT EXISTS reference_id text,
  ADD COLUMN IF NOT EXISTS outcome      text,
  ADD COLUMN IF NOT EXISTS platform     text,
  ADD COLUMN IF NOT EXISTS app_version  text,
  ADD COLUMN IF NOT EXISTS occurred_at  timestamptz;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'platform_error_logs_outcome_check') THEN
    ALTER TABLE public.platform_error_logs
      ADD CONSTRAINT platform_error_logs_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('NOT_SENT','MAY_HAVE_SAVED','NOT_SAVED','NO_CHANGE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'platform_error_logs_reference_format') THEN
    -- 8 characters, no 0/O/1/I (core/errors/error_report.dart newReference).
    ALTER TABLE public.platform_error_logs
      ADD CONSTRAINT platform_error_logs_reference_format
      CHECK (reference_id IS NULL OR reference_id ~ '^[2-9A-HJ-NP-Z]{8}$');
  END IF;
END $c$;

-- ── 2. indexes ──────────────────────────────────────────────────────────────
-- Support looks a row up by the reference the shopkeeper reads out.
CREATE UNIQUE INDEX IF NOT EXISTS platform_error_logs_reference_id_key
  ON public.platform_error_logs (reference_id)
  WHERE reference_id IS NOT NULL;

-- "How many NET-01 this week?"
CREATE INDEX IF NOT EXISTS platform_error_logs_code_created_idx
  ON public.platform_error_logs (error_code, created_at DESC);

-- ── 3. row level security ───────────────────────────────────────────────────
ALTER TABLE public.platform_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global Admins see all logs"   ON public.platform_error_logs;
DROP POLICY IF EXISTS "Owners see tenant logs"       ON public.platform_error_logs;
DROP POLICY IF EXISTS "Admins can update status"     ON public.platform_error_logs;
DROP POLICY IF EXISTS "Members log their own shop's errors" ON public.platform_error_logs;
DROP POLICY IF EXISTS "Global admins see all error logs"    ON public.platform_error_logs;
DROP POLICY IF EXISTS "Owners see their shop's error logs"  ON public.platform_error_logs;
DROP POLICY IF EXISTS "Admins update error log status"      ON public.platform_error_logs;

-- Any signed-in member may log an error for THEIR OWN shop, as themselves,
-- as a new row. (SELECT ...) so the calls are evaluated once, not per row.
CREATE POLICY "Members log their own shop's errors"
  ON public.platform_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
    AND coalesce(status, 'New') = 'New'
  );

-- Reading: global admins everything, a shop's owner that shop only. Staff
-- cannot read error rows (support read access is a later step).
CREATE POLICY "Global admins see all error logs"
  ON public.platform_error_logs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_global_admin()));

CREATE POLICY "Owners see their shop's error logs"
  ON public.platform_error_logs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_tenant_admin())
    AND tenant_id = (SELECT public.current_tenant_id())
  );

-- Acknowledge / resolve: global admins anywhere, owners in their own shop.
CREATE POLICY "Admins update error log status"
  ON public.platform_error_logs
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_global_admin())
    OR ((SELECT public.is_tenant_admin())
        AND tenant_id = (SELECT public.current_tenant_id()))
  )
  WITH CHECK (
    (SELECT public.is_global_admin())
    OR ((SELECT public.is_tenant_admin())
        AND tenant_id = (SELECT public.current_tenant_id()))
  );

-- ── 4. grants ───────────────────────────────────────────────────────────────
-- Signed-out callers get nothing on the table. Signed-in callers may insert,
-- read and update as the policies allow; nobody deletes through the API.
REVOKE ALL ON public.platform_error_logs FROM anon, public;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.platform_error_logs FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.platform_error_logs TO authenticated;
