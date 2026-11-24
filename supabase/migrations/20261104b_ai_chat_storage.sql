-- AI chat v1: answer cache, usage log, and the owner's on/off switch (docs/ai-chat-v1.md §7-§8)
-- ============================================================================
--
-- Neither table takes a direct client write: the user's JWT can read only that
-- user's own rows, and every write goes through a SECURITY DEFINER function
-- that resolves the shop from auth. No service role is involved.
--
-- ai_answer_cache keeps one row per user, question and language, so it needs no
-- purge job. ai_usage holds no figures and no answer text.
--
-- Both are excluded from shop backups: shop_backup_tables() takes every table
-- with a tenant_id, and restoring ai_usage would reset the month's quota.
-- Neither table has a trigger, so the is_restoring() rule does not apply.

CREATE TABLE IF NOT EXISTS public.ai_answer_cache (
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id            text NOT NULL,
  question_id        text NOT NULL,
  lang               text NOT NULL,
  figures_hash       text NOT NULL,
  text_with_standins text NOT NULL,
  model              text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, question_id, lang)
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       text NOT NULL,
  question_id   text NOT NULL,
  lang          text NOT NULL,
  model         text,
  input_tokens  int NOT NULL DEFAULT 0,
  cached_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  outcome       text NOT NULL CHECK (outcome IN (
    'claimed', 'answered', 'cached', 'no_data', 'ai_off', 'ai_not_configured',
    'quota_reached', 'rate_limited', 'model_error', 'refused', 'guard_rejected')),
  latency_ms    int,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_tenant_created ON public.ai_usage (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_user_created   ON public.ai_usage (user_id, created_at);

ALTER TABLE public.ai_answer_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage        ENABLE ROW LEVEL SECURITY;

-- A user's own rows only. A global admin gets no wider view here.
DROP POLICY IF EXISTS ai_answer_cache_own ON public.ai_answer_cache;
CREATE POLICY ai_answer_cache_own ON public.ai_answer_cache
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()) AND user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS ai_usage_own ON public.ai_usage;
CREATE POLICY ai_usage_own ON public.ai_usage
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()) AND user_id = (SELECT auth.uid())::text);

REVOKE ALL ON public.ai_answer_cache, public.ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_answer_cache, public.ai_usage TO authenticated;

-- ── writes ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ai_save_answer(
  p_question_id text, p_lang text, p_figures_hash text, p_text text, p_model text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
BEGIN
  IF length(p_text) > 4000 THEN
    RAISE EXCEPTION 'Answer too long to keep';
  END IF;
  INSERT INTO public.ai_answer_cache
    (tenant_id, user_id, question_id, lang, figures_hash, text_with_standins, model, created_at)
  VALUES (v_tenant, auth.uid()::text, p_question_id, p_lang, p_figures_hash, p_text, p_model, now())
  ON CONFLICT (tenant_id, user_id, question_id, lang) DO UPDATE
    SET figures_hash = EXCLUDED.figures_hash,
        text_with_standins = EXCLUDED.text_with_standins,
        model = EXCLUDED.model,
        created_at = EXCLUDED.created_at;
END
$fn$;

-- Take one answer from the quota BEFORE the model is called, under a lock, so
-- parallel taps cannot all pass a check that none of them has counted yet.
-- Monthly limit per plan, per shop, in the shop's calendar month; 10 a minute
-- per user. A model_error gives the answer back; the other outcomes spent tokens.
CREATE OR REPLACE FUNCTION public.ai_usage_claim(p_question_id text, p_lang text, p_model text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_user   text := auth.uid()::text;
  v_tz     text;
  v_limit  int;
  v_month  timestamptz;
  v_used   int;
  v_minute int;
  v_id     uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_usage:' || v_tenant::text, 0));

  v_limit := CASE public.get_my_effective_plan()
    WHEN 'ENTERPRISE' THEN 1000
    WHEN 'PRO'        THEN 500
    WHEN 'GROWTH'     THEN 100
    ELSE 10
  END;

  SELECT COALESCE(NULLIF(bp.timezone, ''), 'Asia/Kolkata') INTO v_tz
    FROM public.business_profile bp
   WHERE bp.tenant_id = v_tenant AND bp.deleted_at IS NULL
   LIMIT 1;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');
  v_month := date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  SELECT COUNT(*) INTO v_used
    FROM public.ai_usage u
   WHERE u.tenant_id = v_tenant AND u.created_at >= v_month
     AND u.outcome IN ('claimed', 'answered', 'refused', 'guard_rejected');

  SELECT COUNT(*) INTO v_minute
    FROM public.ai_usage u
   WHERE u.tenant_id = v_tenant AND u.user_id = v_user AND u.created_at >= now() - interval '1 minute'
     AND u.outcome IN ('claimed', 'answered', 'refused', 'guard_rejected');

  IF v_minute >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited', 'used', v_used, 'limit', v_limit);
  END IF;
  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_reached', 'used', v_used, 'limit', v_limit);
  END IF;

  INSERT INTO public.ai_usage (tenant_id, user_id, question_id, lang, model, outcome)
  VALUES (v_tenant, v_user, p_question_id, p_lang, p_model, 'claimed')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'used', v_used + 1, 'limit', v_limit);
END
$fn$;

-- Close a claim with what happened, or (p_id NULL) log a request that needed
-- no model call. Only the caller's own open claim can be closed.
CREATE OR REPLACE FUNCTION public.ai_usage_record(
  p_id uuid, p_question_id text, p_lang text, p_model text,
  p_input_tokens int, p_cached_tokens int, p_output_tokens int,
  p_outcome text, p_latency_ms int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
BEGIN
  IF p_id IS NULL THEN
    IF p_outcome IN ('claimed', 'answered', 'refused', 'guard_rejected', 'model_error') THEN
      RAISE EXCEPTION 'Outcome % needs a claim', p_outcome;
    END IF;
    INSERT INTO public.ai_usage (tenant_id, user_id, question_id, lang, model, outcome, latency_ms)
    VALUES (v_tenant, auth.uid()::text, p_question_id, p_lang, p_model, p_outcome, p_latency_ms);
    RETURN;
  END IF;

  UPDATE public.ai_usage u
     SET outcome = p_outcome, model = p_model, latency_ms = p_latency_ms,
         input_tokens = COALESCE(p_input_tokens, 0),
         cached_tokens = COALESCE(p_cached_tokens, 0),
         output_tokens = COALESCE(p_output_tokens, 0)
   WHERE u.id = p_id AND u.tenant_id = v_tenant AND u.user_id = auth.uid()::text
     AND u.outcome = 'claimed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open claim %', p_id;
  END IF;
END
$fn$;

-- AI is off for a shop until its owner turns it on. tenants takes no owner
-- writes (only global admins can update it), so the switch needs this.
CREATE OR REPLACE FUNCTION public.ai_set_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'ai_set_enabled needs true or false';
  END IF;
  UPDATE public.tenants
     SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
           'ai_enabled', p_enabled, 'ai_enabled_at', now(), 'ai_enabled_by', auth.uid())
   WHERE id = v_tenant;
  RETURN p_enabled;
END
$fn$;

REVOKE ALL ON FUNCTION public.ai_save_answer(text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_usage_claim(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_usage_record(uuid,text,text,text,int,int,int,text,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_set_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_save_answer(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_claim(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_record(uuid,text,text,text,int,int,int,text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_set_enabled(boolean) TO authenticated;

-- ── keep both tables out of shop backups ───────────────────────────────────
-- Anchored on the live body, so a list changed since 20261022 is not overwritten.
DO $p$
DECLARE
  v_src text;
  v_old text := '''restore_jobs'', ''restore_staging'', ''restore_snapshots''';
  v_new text := '''restore_jobs'', ''restore_staging'', ''restore_snapshots'', ''ai_answer_cache'', ''ai_usage''';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'shop_backup_excluded' AND pronamespace = 'public'::regnamespace;
  IF v_src IS NULL OR (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'anchor not found exactly once in shop_backup_excluded';
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.shop_backup_excluded()
RETURNS text[] LANGUAGE sql IMMUTABLE AS %L$f$, replace(v_src, v_old, v_new));
END $p$;
