import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const env = import.meta.env.VITE_ENV;

// Safety guard — block prod URL in dev mode
if (env === 'development' && url?.includes('prod')) {
  console.warn('🚨 PRODUCTION URL detected in dev environment! Check your .env file.');
}

export const isSupabaseConfigured = !!(url && key && !key.includes('REPLACE-'));

export const supabase = isSupabaseConfigured ? createClient(url, key) : null;

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
