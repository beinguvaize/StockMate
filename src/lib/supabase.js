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
    })
  : null;

/**
 * Upload a product image to Supabase Storage.
 * Retained for backwards compatibility with the Inventory module.
 */
export const uploadProductImage = async (file) => {
  const BUCKET = 'product-images';
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
  const filePath = `products/${fileName}`;

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
