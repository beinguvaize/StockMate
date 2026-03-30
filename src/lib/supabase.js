import { createClient } from '@supabase/supabase-js';

// --- Dynamic Environment Mapping ---
const HOSTNAME = typeof window !== 'undefined' ? window.location.hostname : '';

// 1. Staging/Development Project (tiywdsbaymrnqmlkxupj)
const STAGING_CONFIG = {
  url: 'https://tiywdsbaymrnqmlkxupj.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeXdkc2JheW1ybnFtbGt4dXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0Mjk1NDAsImV4cCI6MjA4OTAwNTU0MH0.1VvvVoGG44YUHZ3_evzIgaOEpHP0baFH3YyPA4MrjyY'
};

// 2. Production Project (lmviftlynuhopzmvaxeu)
const PROD_CONFIG = {
  url: 'https://lmviftlynuhopzmvaxeu.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtdmlmdGx5bnVob3B6bXZheGV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDUxMzEsImV4cCI6MjA4ODg4MTEzMX0.DX0HpM6jEYZrRx8Nl8mZxvTjvvMIY2AneJgnkS-e1xA'
};

// Determine configuration based on hostname
let activeConfig = STAGING_CONFIG; // Default to Staging/Develop

if (HOSTNAME === 'ledgrpro-prod.vercel.app' || HOSTNAME === 'ledgr-beinguvaizes-projects.vercel.app') {
  activeConfig = PROD_CONFIG;
} else {
  // Catch-all for ledgrpro-dev.vercel.app, localhost, and other dev environments
  activeConfig = STAGING_CONFIG;
}

const url = activeConfig.url;
const key = activeConfig.key;

// Safety guard — block prod URL in dev mode
if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && url.includes('lmviftlynuhop')) {
  console.warn('🚨 PRODUCTION database detected on localhost! Proceed with caution.');
}

export const isSupabaseConfigured = !!(url && key);

export const supabase = isSupabaseConfigured ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sm-auth-token',
    // Bypass browser-tabs-lock to prevent AbortError: Lock broken
    lock: async (_name, _acquireTimeout, fn) => fn()
  }
}) : null;

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
