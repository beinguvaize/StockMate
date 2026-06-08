// Payment-reminder sender via Twilio (SMS or WhatsApp).
//
// Secrets (set in Supabase → Edge Functions → Secrets):
//   TWILIO_ACCOUNT_SID   AC...
//   TWILIO_AUTH_TOKEN    ...
//   TWILIO_FROM          "+1415..." for SMS, or "whatsapp:+1415..." for WhatsApp
//
// Channel is inferred from TWILIO_FROM: a `whatsapp:` prefix sends WhatsApp,
// otherwise SMS. The caller passes the recipient phone + the message body
// (built client-side, same style as the WhatsApp share). Requires a valid
// Supabase JWT (verify_jwt stays on) so random anon callers can't spam.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// E.164 normalise — default to India (+91) for bare 10-digit numbers.
function toE164(raw: string): string | null {
  const d = (raw || '').replace(/[^0-9+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) return d;
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith('91')) return `+${d}`;
  return `+${d}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const SID = Deno.env.get('TWILIO_ACCOUNT_SID');
  const TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
  const FROM = Deno.env.get('TWILIO_FROM');
  if (!SID || !TOKEN || !FROM) {
    return json({ error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.' }, 500);
  }

  let payload: { to?: string; message?: string };
  try { payload = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }

  const message = (payload.message || '').trim();
  const toNum = toE164(payload.to || '');
  if (!toNum) return json({ error: 'invalid recipient phone' }, 400);
  if (!message) return json({ error: 'empty message' }, 400);

  const isWhatsApp = FROM.startsWith('whatsapp:');
  const to = isWhatsApp ? `whatsapp:${toNum}` : toNum;

  const form = new URLSearchParams({ From: FROM, To: to, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${SID}:${TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const data = await res.json();
  if (!res.ok) return json({ error: data?.message || 'Twilio send failed', code: data?.code }, 502);
  return json({ ok: true, sid: data.sid, status: data.status, channel: isWhatsApp ? 'whatsapp' : 'sms' });
});
