/**
 * Client-side login rate limiting via progressive backoff.
 *
 * LIMITATION: This is a client-side-only control stored in localStorage.
 * A determined attacker can clear localStorage (or use a different browser
 * profile) to bypass these limits entirely. This implementation is designed
 * to stop casual / automated brute-force attempts without a server round-trip.
 *
 * PROPER FIX (follow-up): Enable Supabase's built-in Auth rate limiting in the
 * Supabase dashboard (Auth → Settings → Rate Limits). That enforcement happens
 * server-side and cannot be bypassed via client storage manipulation.
 */

const STORAGE_PREFIX = 'ledgr_login_attempts:';

/**
 * Lockout durations (ms) by attempt count.
 * Attempts 1-3 → no lockout.
 * Attempt 4 → 30 s, 5 → 2 min, 6 → 10 min, 7+ → 30 min.
 */
const LOCKOUT_MS = {
  4: 30 * 1000,
  5: 2 * 60 * 1000,
  6: 10 * 60 * 1000,
};
const DEFAULT_LOCKOUT_MS = 30 * 60 * 1000; // 7+ failures

const _key = (email) => `${STORAGE_PREFIX}${email.toLowerCase().trim()}`;

const _read = (email) => {
  try {
    const raw = localStorage.getItem(_key(email));
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: null };
  }
};

const _write = (email, record) => {
  try {
    localStorage.setItem(_key(email), JSON.stringify(record));
  } catch {
    // Silently fail — storage quota or private-browsing restriction.
  }
};

/**
 * Returns whether the given email is currently under a lockout.
 * @param {string} email
 * @returns {boolean}
 */
export const isLocked = (email) => {
  const { lockedUntil } = _read(email);
  if (!lockedUntil) return false;
  return Date.now() < new Date(lockedUntil).getTime();
};

/**
 * Returns a human-readable string for how long until the lockout expires.
 * Returns null if not currently locked.
 * @param {string} email
 * @returns {string|null}
 */
export const timeRemaining = (email) => {
  const { lockedUntil } = _read(email);
  if (!lockedUntil) return null;
  const msLeft = new Date(lockedUntil).getTime() - Date.now();
  if (msLeft <= 0) return null;
  const totalSec = Math.ceil(msLeft / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min} min ${sec} s`;
  return `${sec} s`;
};

/**
 * Increments the failure counter for the email and applies a lockout
 * according to the progressive backoff schedule.
 * @param {string} email
 */
export const recordFailure = (email) => {
  const record = _read(email);
  const newCount = record.count + 1;
  const lockMs = LOCKOUT_MS[newCount] ?? (newCount >= 7 ? DEFAULT_LOCKOUT_MS : 0);
  const lockedUntil = lockMs > 0 ? new Date(Date.now() + lockMs).toISOString() : null;
  _write(email, { count: newCount, lockedUntil });
};

/**
 * Clears the attempt record for the email after a successful login.
 * @param {string} email
 */
export const recordSuccess = (email) => {
  try {
    localStorage.removeItem(_key(email));
  } catch {
    // ignore
  }
};
