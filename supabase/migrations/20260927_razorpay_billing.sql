-- ═══════════════════════════════════════════════════════════════════════════
-- Razorpay billing
-- ═══════════════════════════════════════════════════════════════════════════
-- Until now nothing collected money: Settings said "Contact us to upgrade",
-- and tenants.plan was set by hand.
--
-- The standing rule for this codebase is that money logic lives server-side.
-- So the ONLY thing that may move a tenant between paid plans for billing
-- reasons is apply_subscription_event(), which is SECURITY DEFINER, revoked
-- from every client role, and callable in practice only by the service role
-- inside the verified webhook. A browser cannot reach it, which matters
-- because the client would otherwise be one devtools call away from PRO.
--
-- The plan gate already exists: get_my_tenant_plan() + the plan_gate_* RLS
-- policies read tenants.plan. Flipping that one column is the whole
-- entitlement change; nothing else needs to know Razorpay exists.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Which Razorpay plan means which of ours ────────────────────────────────
-- Data, not a CASE statement in an edge function: the ids differ between
-- Razorpay test and live mode, and a mapping in code means a deploy to fix a
-- typo made in a dashboard.
CREATE TABLE IF NOT EXISTS public.billing_plan_map (
  razorpay_plan_id  text PRIMARY KEY,
  plan              text NOT NULL CHECK (plan IN ('FREE','GROWTH','PRO','ENTERPRISE')),
  mode              text NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live')),
  amount_paise      integer NOT NULL,
  period            text NOT NULL DEFAULT 'yearly',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── The subscription itself ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  razorpay_subscription_id text NOT NULL UNIQUE,
  razorpay_plan_id         text,
  plan                     text NOT NULL CHECK (plan IN ('FREE','GROWTH','PRO','ENTERPRISE')),
  -- Razorpay's own vocabulary, kept verbatim rather than translated: when a
  -- subscription is in 'halted' it is worth being able to read that word in
  -- our table and in their dashboard and know they are the same thing.
  status                   text NOT NULL,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_tenant_idx
  ON public.billing_subscriptions(tenant_id);

-- ── Idempotency ────────────────────────────────────────────────────────────
-- Razorpay retries a webhook until it gets a 2xx, so the same event arrives
-- more than once as a matter of course. Without this, one retry of
-- subscription.charged extends a paid period twice.
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  payload      jsonb
);

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_map      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- A tenant may READ its own subscription, so Settings can show what is being
-- billed and when it renews. Nobody may write one from a client.
DROP POLICY IF EXISTS billing_subscriptions_read ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_read ON public.billing_subscriptions
  FOR SELECT USING (tenant_id = public.current_tenant_id());

-- The plan map is public-ish reference data; the webhook log is not readable
-- by anyone but the service role, which bypasses RLS. No policy = no access.
DROP POLICY IF EXISTS billing_plan_map_read ON public.billing_plan_map;
CREATE POLICY billing_plan_map_read ON public.billing_plan_map FOR SELECT USING (true);

-- ── The one function that may change a plan for billing reasons ────────────
CREATE OR REPLACE FUNCTION public.apply_subscription_event(
  p_event_id        text,
  p_event_type      text,
  p_subscription_id text,
  p_plan_id         text,
  p_status          text,
  p_period_end      timestamptz,
  p_payload         jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub     public.billing_subscriptions%ROWTYPE;
  v_plan    text;
  v_applied text;
BEGIN
  -- Idempotency first. A duplicate is the normal case, not an error, so it
  -- returns 200-shaped success and changes nothing.
  INSERT INTO public.billing_webhook_events (event_id, event_type, payload)
  VALUES (p_event_id, p_event_type, p_payload)
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT * INTO v_sub
  FROM public.billing_subscriptions
  WHERE razorpay_subscription_id = p_subscription_id;

  IF NOT FOUND THEN
    -- A webhook for a subscription we never recorded means create-subscription
    -- did not finish, or this is someone else's event. Log it and stop rather
    -- than guessing which tenant it belongs to.
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_subscription');
  END IF;

  SELECT plan INTO v_plan FROM public.billing_plan_map WHERE razorpay_plan_id = p_plan_id;
  v_plan := COALESCE(v_plan, v_sub.plan);

  UPDATE public.billing_subscriptions
     SET status             = p_status,
         razorpay_plan_id   = COALESCE(p_plan_id, razorpay_plan_id),
         plan               = v_plan,
         current_period_end = COALESCE(p_period_end, current_period_end),
         updated_at         = now()
   WHERE id = v_sub.id;

  -- Entitlement. Paid states grant the plan; terminal states drop to FREE.
  -- 'pending' is deliberately NOT a downgrade: it means a charge failed and
  -- Razorpay is still retrying, and locking someone out of their own books
  -- mid-retry is how you turn a failed card into a cancelled customer.
  IF p_status IN ('active', 'authenticated') THEN
    v_applied := v_plan;
  ELSIF p_status IN ('halted', 'cancelled', 'expired', 'completed') THEN
    v_applied := 'FREE';
  ELSE
    v_applied := NULL;
  END IF;

  IF v_applied IS NOT NULL THEN
    UPDATE public.tenants SET plan = v_applied WHERE id = v_sub.tenant_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tenant_id', v_sub.tenant_id, 'plan', v_applied);
END;
$$;

-- No client role may call it. The service role bypasses these grants, which
-- is exactly the intent: the webhook can, a browser cannot.
REVOKE ALL ON FUNCTION public.apply_subscription_event(text,text,text,text,text,timestamptz,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_subscription_event(text,text,text,text,text,timestamptz,jsonb) FROM anon, authenticated;

COMMENT ON FUNCTION public.apply_subscription_event IS
  'The only path from a Razorpay event to tenants.plan. Callable by the service role only, from the signature-verified webhook.';
