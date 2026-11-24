-- AI chat: a provider_busy outcome that never counts against the shop
-- ============================================================================
--
-- ai-ask now runs on the Gemini free tier, whose limits are per key across
-- every shop. When Google answers 429 (or is overloaded), the claim is closed as
-- provider_busy. It is not in the counted set ('claimed', 'answered',
-- 'refused', 'guard_rejected') in ai_usage_status, so the shop keeps the answer.

ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_outcome_check;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_outcome_check CHECK (outcome IN (
  'claimed', 'answered', 'cached', 'no_data', 'ai_off', 'ai_not_configured',
  'quota_reached', 'rate_limited', 'model_error', 'refused', 'guard_rejected', 'provider_busy'));
