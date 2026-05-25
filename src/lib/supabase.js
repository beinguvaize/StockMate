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
