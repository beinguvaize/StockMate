-- AI chat: what the panel needs beyond the first contract (mockup v2)
-- ============================================================================
--
-- ai_usage_status: the "63 of 100 used in November" line needs the shop's count,
-- and ai_usage only shows a user their own rows, so this reads it as DEFINER
-- with the same owner guard. ai_usage_claim now takes its numbers from here, so
-- the limit and what counts against it live in one place.
--
-- ai_expiring_stock: the card shows each batch's unit, as the other stock
-- questions do. Patched on the live body, anchored once.

CREATE OR REPLACE FUNCTION public.ai_usage_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_tz     text;
  v_limit  int;
  v_month  timestamptz;
  v_used   int;
BEGIN
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

  RETURN jsonb_build_object(
    'used', v_used, 'limit', v_limit,
    'resets_on', ((date_trunc('month', now() AT TIME ZONE v_tz) + interval '1 month')::date));
END
$fn$;

CREATE OR REPLACE FUNCTION public.ai_usage_claim(p_question_id text, p_lang text, p_model text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
  v_user   text := auth.uid()::text;
  v_status jsonb;
  v_limit  int;
  v_used   int;
  v_minute int;
  v_id     uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_usage:' || v_tenant::text, 0));

  v_status := public.ai_usage_status();
  v_limit  := (v_status ->> 'limit')::int;
  v_used   := (v_status ->> 'used')::int;

  SELECT COUNT(*) INTO v_minute
    FROM public.ai_usage u
   WHERE u.tenant_id = v_tenant AND u.user_id = v_user AND u.created_at >= now() - interval '1 minute'
     AND u.outcome IN ('claimed', 'answered', 'refused', 'guard_rejected');

  IF v_minute >= 10 THEN
    RETURN v_status || jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;
  IF v_used >= v_limit THEN
    RETURN v_status || jsonb_build_object('ok', false, 'reason', 'quota_reached');
  END IF;

  INSERT INTO public.ai_usage (tenant_id, user_id, question_id, lang, model, outcome)
  VALUES (v_tenant, v_user, p_question_id, p_lang, p_model, 'claimed')
  RETURNING id INTO v_id;

  RETURN v_status || jsonb_build_object('ok', true, 'id', v_id, 'used', v_used + 1);
END
$fn$;

REVOKE ALL ON FUNCTION public.ai_usage_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_usage_status() TO authenticated;

DO $p$
DECLARE
  v_src text;
  v_old text := '''product_name'', p.name, ''expiry_date''';
  v_new text := '''product_name'', p.name, ''unit'', p.unit, ''expiry_date''';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'ai_expiring_stock' AND pronamespace = 'public'::regnamespace;
  IF v_src IS NULL OR (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'anchor not found exactly once in ai_expiring_stock';
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.ai_expiring_stock(p_days int DEFAULT 30, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS %L$f$, replace(v_src, v_old, v_new));
END $p$;
