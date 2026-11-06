/**
 * Talks to the ai-ask Edge Function. The client only ever sends an action, a
 * question id and a language: the shop, the dates and the prompt are the
 * server's. Uses a direct fetch because supabase.functions.invoke falls back to
 * the anon key under Electron's file:// (see TenantSetup.jsx).
 */
import { supabase } from './supabase';

const TIMEOUT_MS = 25000;

export class AskError extends Error {
  /** @param kind 'reason' (the server refused), 'connection' or 'slow' */
  constructor(kind, reason, message) {
    super(message || reason || kind);
    this.kind = kind;
    this.reason = reason || null;
  }
}

export async function callAsk(body) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) throw new AskError('reason', 'not_signed_in');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-ask`, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AskError(e?.name === 'AbortError' ? 'slow' : 'connection');
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try { json = await res.json(); } catch { /* a gateway error can have no JSON body */ }
  if (!res.ok) throw new AskError('reason', json?.reason || (res.status === 401 ? 'not_signed_in' : 'read_failed'), json?.message);
  return json;
}

export async function setAskEnabled(on) {
  const { error } = await supabase.rpc('ai_set_enabled', { p_enabled: on });
  if (error) throw new AskError('reason', 'read_failed', error.message);
}
