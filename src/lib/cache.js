/**
 * Cache utility for Ledgr ERP
 * Handles localStorage persistence with TTL (Time To Live)
 */

const PREFIX = 'ledgr_';
const DEFAULT_TTL = 1800000; // 30 minutes in milliseconds

/**
 * Save data to cache
 * @param {string} key 
 * @param {any} data 
 * @param {number} ttl Time to live in milliseconds
 */
export const cacheSet = (key, data, ttl = DEFAULT_TTL) => {
    try {
        const item = {
            data,
            expiry: Date.now() + ttl
        };
        localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(item));
    } catch (e) {
        console.error('Cache set error:', e);
    }
};

/**
 * Retrieve data from cache
 * @param {string} key 
 * @returns {any|null} Data if valid, null if expired or missing
 */
export const cacheGet = (key) => {
    try {
        const itemStr = localStorage.getItem(`${PREFIX}${key}`);
        if (!itemStr) return null;

        const item = JSON.parse(itemStr);
        if (Date.now() > item.expiry) {
            localStorage.removeItem(`${PREFIX}${key}`);
            return null;
        }
        return item.data;
    } catch (e) {
        console.error('Cache get error:', e);
        return null;
    }
};

/**
 * Clear all ledgr prefixed keys from localStorage
 */
export const cacheClear = () => {
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    } catch (e) {
        console.error('Cache clear error:', e);
    }
};
