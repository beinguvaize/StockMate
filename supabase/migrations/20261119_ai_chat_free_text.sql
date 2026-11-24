-- AI chat: free-text questions in Ask ("Ask your own question")
-- ============================================================================
--
-- The chat box sends what the owner types to the AI, which the first consent
-- notice did not say. Owners who turned Ask on before that sentence was added
-- must read the updated notice once before their first chat message. ai-ask
-- compares settings.ai_chat_consent_version with its own CHAT_CONSENT_VERSION
-- and refuses a chat message (reason chat_consent_needed) until they match.
-- Set questions keep working meanwhile.
--
-- Same rules as 20261104_ai_chat_read_functions.sql: no tenant argument (the
-- shop comes from auth through ai_owner_tenant(), which refuses staff), a
-- fixed search_path, REVOKE from PUBLIC and anon, and one signature only.
--
-- Nothing typed in the chat box is stored: ai_usage has no text column, and
-- chat answers are never written to ai_answer_cache.

CREATE OR REPLACE FUNCTION public.ai_set_chat_consent(p_version int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid := public.ai_owner_tenant();
BEGIN
  IF p_version IS NULL OR p_version < 1 OR p_version > 1000 THEN
    RAISE EXCEPTION 'ai_set_chat_consent needs a notice version from 1 to 1000';
  END IF;
  UPDATE public.tenants
     SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
           'ai_chat_consent_version', p_version,
           'ai_chat_consent_at', now(),
           'ai_chat_consent_by', auth.uid())
   WHERE id = v_tenant;
  RETURN p_version;
END
$fn$;

REVOKE ALL ON FUNCTION public.ai_set_chat_consent(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_set_chat_consent(int) TO authenticated;
