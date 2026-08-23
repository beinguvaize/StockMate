// Auth OTP delivery over WhatsApp, via Meta's Cloud API directly.
//
// This is a Supabase **Send SMS Hook**, not a normal function: Supabase Auth
// calls it instead of its own sender whenever an auth OTP needs to go out, and
// hands over the already-generated code. That is the whole reason this exists —
// Supabase's built-in WhatsApp channel works only through Twilio, and going to
// Meta directly drops the reseller markup.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SEND_SMS_HOOK_SECRET       "v1,whsec_..." — generated when creating the hook
//   WHATSAPP_PHONE_NUMBER_ID   numeric id of the sender, from Meta
//   WHATSAPP_ACCESS_TOKEN      Meta access token for that app
//   WHATSAPP_OTP_TEMPLATE      approved authentication template name
//   WHATSAPP_OTP_LANG          template language, default "en"
//   WHATSAPP_OTP_HAS_BUTTON    "false" only if the template has no code button
//
// Deploy WITHOUT jwt verification — the caller is Supabase Auth, not a signed-in
// user, and it authenticates with the webhook signature instead:
//   supabase functions deploy send-auth-otp --no-verify-jwt
//
// Then point Auth → Hooks → "Send SMS hook" at this function's URL.
//
// Contract: an empty 200 means delivered. Anything else and Auth reports a
// failure to the client, which is what we want — a silent success on an
// undelivered code would leave someone staring at a phone forever.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const GRAPH_VERSION = 'v21.0';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Auth reads this shape and surfaces the message. */
const fail = (status: number, message: string) =>
  json({ error: { http_code: status, message } }, status);

/**
 * Meta wants the number as digits with the country code and no plus.
 * Auth always hands us E.164, so this is a strip, not a parse — the real
 * normalisation already happened client-side in phoneAuth.js / phone_auth.dart.
 */
const digitsOnly = (phone: string) => (phone || '').replace(/\D/g, '');

/**
 * Build the Cloud API body for an authentication template.
 *
 * Meta's authentication templates take the code TWICE: once for the message
 * body, and once for the copy-code / one-tap button. Sending a button component
 * for a template that has no button is an error, and omitting it for a template
 * that has one is also an error — hence WHATSAPP_OTP_HAS_BUTTON. Meta requires
 * a button on authentication templates, so it defaults to on.
 */
function buildTemplateMessage(to: string, otp: string, template: string, lang: string, hasButton: boolean) {
  const components: unknown[] = [
    { type: 'body', parameters: [{ type: 'text', text: otp }] },
  ];
  if (hasButton) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: otp }],
    });
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: { name: template, language: { code: lang }, components },
  };
}

serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'POST only');

  const HOOK_SECRET = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const TEMPLATE = Deno.env.get('WHATSAPP_OTP_TEMPLATE');
  const LANG = Deno.env.get('WHATSAPP_OTP_LANG') || 'en';
  const HAS_BUTTON = (Deno.env.get('WHATSAPP_OTP_HAS_BUTTON') || 'true') !== 'false';

  // Name what is missing. A hook that 500s with no reason is the kind of thing
  // that stays broken for days because nobody can tell what to fix.
  const missing = [
    ['SEND_SMS_HOOK_SECRET', HOOK_SECRET],
    ['WHATSAPP_PHONE_NUMBER_ID', PHONE_NUMBER_ID],
    ['WHATSAPP_ACCESS_TOKEN', ACCESS_TOKEN],
    ['WHATSAPP_OTP_TEMPLATE', TEMPLATE],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('[send-auth-otp] missing secrets:', missing.join(', '));
    return fail(500, `OTP sender is not configured: missing ${missing.join(', ')}`);
  }

  const payload = await req.text();

  // Verify the webhook signature. Without this the endpoint is an open relay
  // that will send a WhatsApp message to any number anyone posts.
  let user: { phone?: string };
  let sms: { otp?: string };
  try {
    const wh = new Webhook(HOOK_SECRET!.replace('v1,whsec_', ''));
    ({ user, sms } = wh.verify(payload, Object.fromEntries(req.headers)) as {
      user: { phone?: string };
      sms: { otp?: string };
    });
  } catch (e) {
    console.error('[send-auth-otp] signature verification failed', e);
    return fail(401, 'Invalid webhook signature.');
  }

  const to = digitsOnly(user?.phone || '');
  const otp = String(sms?.otp || '').trim();
  if (!to || !otp) {
    console.error('[send-auth-otp] hook payload had no phone or otp');
    return fail(400, 'Hook payload was missing the phone number or the code.');
  }

  const body = buildTemplateMessage(to, otp, TEMPLATE!, LANG, HAS_BUTTON);

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[send-auth-otp] could not reach Meta', e);
    return fail(502, 'Could not reach WhatsApp. Try again.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Log the whole thing — Meta puts the actionable part in error_data.details
    // ("template name does not exist", "recipient not in allowed list" on a
    // test number, "template is paused"). Never reduce that to "failed".
    const detail = data?.error?.error_data?.details || data?.error?.message || `HTTP ${res.status}`;
    console.error('[send-auth-otp] Meta rejected the send:', JSON.stringify(data));
    // The code never left, so Auth must not report success. The user-facing
    // string stays generic; the reason stays in the log.
    return fail(res.status === 401 || res.status === 403 ? 500 : 502,
      `WhatsApp did not accept the message: ${detail}`);
  }

  // Accepted for delivery. Meta returns messages[0].id; keep it so a specific
  // undelivered code can be traced later.
  console.log('[send-auth-otp] queued', data?.messages?.[0]?.id ?? '(no id)', 'to', to.slice(0, 4) + '…' + to.slice(-2));
  return json({}, 200);
});
