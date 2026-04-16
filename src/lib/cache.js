/**
 * Cache utility for Ledgr ERP
 * Handles localStorage persistence with TTL (Time To Live)
 *
 * SECURITY NOTE — Sensitive-field sanitization:
 * Raw cached objects previously included financially sensitive fields
 * (balances, cost prices, payroll amounts, profit margins, permissions).
 * These are stripped before writing to localStorage to limit XSS exposure.
 *
 * TRADEOFF: Stripped fields will be `undefined` when read back from cache.
 * This is intentional — the app re-fetches authoritative data from Supabase
 * on every mount (via initializeApp / useReportData), so the missing fields
 * are filled in from the server before they're needed by any UI component.
 *
 * CACHE-BUST: A version sentinel (CACHE_VERSION) is checked on module load.
 * If the stored version doesn't match, all ledgr_* keys are wiped so stale
 * pre-sanitization entries from older builds don't linger in user browsers.
 */

const PREFIX = 'ledgr_';
const DEFAULT_TTL = 1800000; // 30 minutes in milliseconds

/** Bump this string whenever the cache schema changes to force a client-side wipe. */
const CACHE_VERSION = 'v2';
const VERSION_KEY = `${PREFIX}cache_version`;

/**
 * Fields that must never be persisted to localStorage, keyed by cache key name.
 * An entry of `true` means strip the whole record (rare); an array means strip
 * those specific field names via a deep-clone pass.
 *
 * @type {Record<string, string[]>}
 */
const SENSITIVE_FIELDS = {
  clients: ['balance', 'outstanding', 'creditLimit'],
  products: ['costPrice', 'cost_price', 'supplierCost'],
  payrollRecords: ['amount', 'netPay', 'grossPay', 'deductions'],
  payroll: ['amount', 'netPay', 'grossPay', 'deductions'],
  sales: ['profit', 'margin', 'totalCogs'],
  users: ['permissions', 'roles'],
};

/**
 * Deep-strip the denylisted fields from a value before caching.
 * Works on arrays-of-objects and plain objects. Primitives are returned as-is.
 *
 * @param {string} key  The cache key (used to look up the denylist).
 * @param {any} data    The value to sanitize.
 * @returns {any}       A new value with sensitive fields removed.
 */
const sanitize = (key, data) => {
  const denied = SENSITIVE_FIELDS[key];
  if (!denied || !data) return data;

  const stripObj = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const clone = { ...obj };
    denied.forEach(field => { delete clone[field]; });
    return clone;
  };

  if (Array.isArray(data)) return data.map(stripObj);
  return stripObj(data);
};

// ── Cache-bust on module init ──────────────────────────────────────────────
// Run once when this module is first imported (i.e. app startup).
// If the stored version sentinel doesn't match, wipe all ledgr_* cache entries
// so old unsanitized data from previous builds cannot be read.
(() => {
  try {
    const stored = localStorage.getItem(VERSION_KEY);
    if (stored !== CACHE_VERSION) {
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith(PREFIX) && k !== VERSION_KEY) {
          localStorage.removeItem(k);
        }
      });
      localStorage.setItem(VERSION_KEY, CACHE_VERSION);
    }
  } catch {
    // Private browsing or storage blocked — silently skip.
  }
})();

/**
 * Save data to cache.
 * Sensitive fields (defined in SENSITIVE_FIELDS) are stripped before writing.
 * @param {string} key
 * @param {any} data
 * @param {number} ttl Time to live in milliseconds
 */
export const cacheSet = (key, data, ttl = DEFAULT_TTL) => {
    try {
        const sanitized = sanitize(key, data);
        const item = {
            data: sanitized,
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
