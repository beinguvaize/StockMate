import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Environment Guard: Prevent production accidental leak into Dev
// Assuming you set a production flag or by checking URL pattern
if (import.meta.env.DEV && supabaseUrl?.includes('production-ref-placeholder')) {
    throw new Error("🚨 SECURITY ALERT: You are attempting to connect to the PRODUCTION database in DEVELOPMENT mode. Please check your .env.development file.");
}

const isConfigured = supabaseUrl && supabaseAnonKey && !supabaseAnonKey.includes('REPLACE_WITH');

if (!isConfigured) {
    console.warn('🚨 Supabase credentials missing or invalid. Please check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
}

// Only create the client if we have a valid-looking URL to avoid fatal "SupabaseUrl is required" error
const rawSupabase = isConfigured 
    ? createClient(supabaseUrl, supabaseAnonKey, {
        db: { schema: import.meta.env.VITE_SUPABASE_SCHEMA || 'public' }
    })
    : null;

/**
 * Production Write Guard
 * Intercepts mutation calls (insert, update, delete, upsert, rpc) 
 * and blocks them in production unless VITE_FORCE_PRODUCTION is 'true'.
 */
const mutationMethods = ['insert', 'update', 'delete', 'upsert', 'rpc'];

/**
 * Upload a product image to Supabase Storage.
 * Uses rawSupabase to bypass the write-guard proxy (storage != database mutation).
 * @param {File} file - The image file to upload
 * @returns {Promise<{url: string|null, error: string|null}>}
 */
export const uploadProductImage = async (file) => {
    const BUCKET = 'product-images';
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { data, error } = await rawSupabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
        });

    if (error) {
        console.error('Image upload error:', error);
        return { url: null, error: error.message };
    }

    const { data: urlData } = rawSupabase.storage
        .from(BUCKET)
        .getPublicUrl(data.path);

    return { url: urlData.publicUrl, error: null };
};

export const supabase = new Proxy(rawSupabase || {}, {
    get(target, prop) {
        if (!rawSupabase) {
            // If the client isn't initialized, any call to it should be safe but informative
            if (mutationMethods.includes(prop) || prop === 'from' || prop === 'rpc') {
                return () => {
                    console.error(`🚨 Supabase not initialized. Cannot call '${prop}'. Check your VITE_SUPABASE_URL.`);
                    return { data: null, error: { message: 'Supabase not initialized' } };
                };
            }
            return undefined;
        }

        const value = Reflect.get(target, prop);

        // If it's a mutation method, wrap it in a guard
        if (mutationMethods.includes(prop) || (prop === 'from' && typeof value === 'function')) {
            return (...args) => {
                const result = value.apply(target, args);

                // If it was 'from', we get a query builder; we must proxy that too
                if (prop === 'from') {
                    return new Proxy(result, {
                        get(innerTarget, innerProp) {
                            const innerValue = Reflect.get(innerTarget, innerProp);
                            if (mutationMethods.includes(innerProp)) {
                                return (...innerArgs) => {
                                    const isProd = import.meta.env.PROD || supabaseUrl?.includes('production');
                                    const isForced = import.meta.env.VITE_FORCE_PRODUCTION === 'true';

                                    if (isProd && !isForced) {
                                        const errorMsg = `🚨 PRODUCTION WRITE-GUARD: Mutation '${innerProp}' blocked. Set VITE_FORCE_PRODUCTION=true to override.`;
                                        console.error(errorMsg);
                                        throw new Error(errorMsg);
                                    }
                                    return innerValue.apply(innerTarget, innerArgs);
                                };
                            }
                            return typeof innerValue === 'function' ? innerValue.bind(innerTarget) : innerValue;
                        }
                    });
                }

                // If it was 'rpc', guard it directly
                if (prop === 'rpc') {
                    const isProd = import.meta.env.PROD || supabaseUrl?.includes('production');
                    const isForced = import.meta.env.VITE_FORCE_PRODUCTION === 'true';

                    if (isProd && !isForced) {
                        const errorMsg = `🚨 PRODUCTION WRITE-GUARD: RPC mutation blocked. Set VITE_FORCE_PRODUCTION=true to override.`;
                        console.error(errorMsg);
                        throw new Error(errorMsg);
                    }
                }

                return result;
            };
        }

        return typeof value === 'function' ? value.bind(target) : value;
    }
});
