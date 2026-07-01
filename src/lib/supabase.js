import { createClient } from '@supabase/supabase-js';

// --- Environment-driven configuration ---
// Secrets live in Vercel/CI env vars or a local .env (gitignored) — never in source.
//
//   VITE_SUPABASE_URL       → project URL for the active environment
//   VITE_SUPABASE_ANON_KEY  → public (RLS-enforced) anon key
//
// Production deployments set these at the platform level to point at the prod
// project; local dev reads them from .env (staging project by default).

const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(url && key);

// Stale-session guard. If the VITE_SUPABASE_URL baked into this build
// differs from the URL the last cached session was issued for, the
// persisted JWT will fail on the new project (PGRST/auth returns 401).
// Detect the mismatch and wipe the supabase auth keys so the user is
// forced to sign in fresh against the current project. Cheap, runs once
// at module import.
try {
  if (typeof window !== 'undefined' && url) {
    const PROJECT_KEY = 'sm-supabase-url';
    const cachedUrl = window.localStorage.getItem(PROJECT_KEY);
    if (cachedUrl && cachedUrl !== url) {
      // Strip every supabase auth token blob so the SDK starts clean.
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('sb-') || k === 'sm-auth-token')
        .forEach((k) => window.localStorage.removeItem(k));
      console.warn('[supabase] project URL changed — cleared cached auth session');
    }
    window.localStorage.setItem(PROJECT_KEY, url);
  }
} catch (_) {/* private mode / restricted storage — ignore */}

if (!isSupabaseConfigured) {
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in the values, or configure them in your deploy platform.'
  );
}

// Safety guard — loudly warn if a dev box is accidentally wired to prod.
// The prod project ref is encoded here only as a string fragment for detection;
// it's not a secret (the URL alone can't authenticate anything).
const PROD_PROJECT_REF_FRAGMENT = 'lmviftlynuhop';
if (
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost' &&
  url.includes(PROD_PROJECT_REF_FRAGMENT)
) {
  console.warn('🚨 PRODUCTION Supabase project detected on localhost! Proceed with caution.');
}

// Hard ceiling on every supabase HTTP request. Without this, a stalled
// socket (flaky wifi, captive portal, DB cold-start, desktop suspend/resume)
// leaves hooks awaiting forever and the UI stuck on "Loading…". With a
// timeout the request rejects, the hook's catch + auto-retry path kicks in,
// and the page recovers on its own.
const SUPABASE_FETCH_TIMEOUT_MS = 30000;

const timedFetch = (input, init = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new DOMException('supabase request timed out', 'TimeoutError')),
    SUPABASE_FETCH_TIMEOUT_MS,
  );
  // Honour any caller-supplied abort signal too.
  if (init.signal) {
    if (init.signal.aborted) ctrl.abort(init.signal.reason);
    else init.signal.addEventListener('abort', () => ctrl.abort(init.signal.reason), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sm-auth-token',
        // Bypass browser-tabs-lock to prevent AbortError: Lock broken
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
      global: { fetch: timedFetch },
    })
  : null;

// Lightweight reachability probe — hits the Supabase auth health endpoint
// (tiny, unauthenticated beyond the public anon key) with a short timeout.
// navigator.onLine is unreliable: it reports false on transient blips and can
// stay stuck false while the network is actually fine. A real probe lets the
// online indicator reflect truth and auto-recover.
export const probeConnectivity = async (timeoutMs = 4000) => {
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: key },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

// Direct PostgREST write — escape hatch around the supabase-js auth queue.
// supabase-js serializes every write behind its auth-token getter; if a token
// refresh gets stuck (long sessions, tab sleep, aborted refresh) that getter
// can deadlock and the write never even hits the network. This posts straight
// to PostgREST with the persisted access token, so a write always fires.
//
// Token acquisition goes through supabase.auth.getSession() which triggers
// autoRefreshToken when the JWT is expired — preventing "JWT expired" errors
// on long-open Electron sessions. Falls back to the localStorage token only
// if the auth client itself is unavailable.
const getValidAccessToken = async () => {
  if (!supabase) return key;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch (_) {/* offline or restricted storage */}
  // Fallback: read raw cached token (may be expired, but best effort)
  try {
    const raw = window.localStorage.getItem('sm-auth-token');
    if (!raw) return key;
    const s = JSON.parse(raw);
    return s?.access_token || s?.currentSession?.access_token || key;
  } catch (_) { return key; }
};

const restHeaders = async (extra = {}) => ({
  apikey: key,
  Authorization: `Bearer ${await getValidAccessToken()}`,
  'Content-Type': 'application/json',
  ...extra,
});

const parseRestError = async (res, fallback) => {
  let msg = fallback;
  try { const j = await res.json(); msg = j.message || j.details || j.hint || fallback; } catch (_) {}
  return new Error(msg);
};

export const restInsert = async (table, row) => {
  if (!url) return { error: new Error('Supabase not configured') };
  try {
    const res = await timedFetch(`${url}/rest/v1/${table}`, {
      method: 'POST', headers: await restHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(row),
    });
    if (!res.ok) return { error: await parseRestError(res, `Save failed (${res.status})`) };
    return { error: null };
  } catch (err) { return { error: err }; }
};

// PATCH with eq filters: restUpdate('products', { stock: 5 }, { id, tenant_id }).
export const restUpdate = async (table, patch, filters = {}) => {
  if (!url) return { error: new Error('Supabase not configured') };
  try {
    const qs = Object.entries(filters)
      .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
    const res = await timedFetch(`${url}/rest/v1/${table}?${qs}`, {
      method: 'PATCH', headers: await restHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(patch),
    });
    if (!res.ok) return { error: await parseRestError(res, `Update failed (${res.status})`) };
    return { error: null };
  } catch (err) { return { error: err }; }
};

// Call a Postgres function (RPC) without going through the supabase-js queue.
export const restRpc = async (fn, params = {}) => {
  if (!url) return { error: new Error('Supabase not configured') };
  try {
    const res = await timedFetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: await restHeaders(), body: JSON.stringify(params || {}),
    });
    if (!res.ok) return { data: null, error: await parseRestError(res, `${fn} failed (${res.status})`) };
    let data = null; try { data = await res.json(); } catch (_) {}
    return { data, error: null };
  } catch (err) { return { data: null, error: err }; }
};

// ── Keep realtime alive across token refresh + tab sleep ──────────────────────
// Long-open tabs go stale because (a) on the ~hourly TOKEN_REFRESHED the new JWT
// was never re-applied to the realtime socket (it then 401s on reconnect and
// dies), and (b) a backgrounded socket isn't nudged back on return. Both make
// the page look frozen until a manual reload. Re-arm realtime in one place.
if (supabase && typeof window !== 'undefined') {
  // (1) Re-apply the fresh JWT to the realtime socket on every refresh/sign-in.
  supabase.auth.onAuthStateChange((event, session) => {
    const token = session?.access_token;
    if (!token) return;
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
      try { supabase.realtime.setAuth(token); } catch (_) {/* noop */}
    }
  });

  // (2) On tab return, re-apply auth + reconnect the socket so live updates
  //     resume without a page reload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) { try { supabase.realtime.setAuth(token); } catch (_) {/* noop */} }
      try { supabase.realtime.connect(); } catch (_) {/* noop */}
    }).catch(() => {/* offline / restricted — ignore */});
  });
}

/**
 * Upload a product image to Supabase Storage.
 * Images are stored under {tenantId}/{filename} for tenant isolation.
 * Each tenant can only list/access photos under their own prefix.
 *
 * @param {File}   file     - The image file to upload
 * @param {string} tenantId - The current tenant's ID (used as storage prefix)
 */
export const uploadProductImage = async (file, tenantId) => {
  const BUCKET = 'product-images';
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
  const prefix = tenantId || 'shared';
  const filePath = `${prefix}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Image upload error:', error);
    return { url: null, error: error.message };
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return { url: urlData.publicUrl, error: null };
};

/**
 * List recent product images for a tenant from Supabase Storage.
 * Returns array of { name, url } objects, newest first.
 *
 * @param {string} tenantId - The current tenant's ID
 * @param {number} limit    - Max photos to return (default 24)
 */
export const listTenantProductImages = async (tenantId, limit = 24) => {
  if (!tenantId || !supabase) return [];
  const BUCKET = 'product-images';
  const prefix = tenantId;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, {
        limit,
        sortBy: { column: 'updated_at', ascending: false },
      });

    if (error) {
      console.error('Photo library list error:', error);
      return [];
    }

    return (data || [])
      .filter(f => f.name && !f.name.endsWith('/'))
      .map(f => {
        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(`${prefix}/${f.name}`);
        return { name: f.name, url: urlData.publicUrl };
      });
  } catch (err) {
    console.error('Photo library list threw:', err);
    return [];
  }
};

/**
 * Generate a DiceBear avatar URL (cartoon style, unique per seed).
 */
export const getDefaultAvatar = (seed = 'user', style = 'personas') => {
  const bg = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'f0f4d8', 'b5ead7'];
  const color = bg[Math.abs([...seed].reduce((h, c) => h * 31 + c.charCodeAt(0), 0)) % bg.length];
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${color}&radius=50`;
};

/**
 * Upload a user avatar to Supabase Storage.
 */
export const uploadAvatar = async (file, userId) => {
  const BUCKET = 'avatars';
  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) return { url: null, error: error.message };
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return { url: urlData.publicUrl, error: null };
};
