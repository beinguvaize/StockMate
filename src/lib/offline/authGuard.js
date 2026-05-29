/**
 * offline/authGuard.js
 *
 * Desktop-only first-sign-in + subscription validation for offline mode.
 *
 * Flow:
 *   1. First launch ever (no bootstrap snapshot in IDB):
 *        → MUST be online. Login.jsx blocks offline first-sign-in.
 *   2. Successful online sign-in:
 *        → AuthContext calls `saveBootstrap()` with the validated profile,
 *          tenant, and subscription status. Timestamps it.
 *   3. Subsequent launches (with network):
 *        → AuthContext re-validates subscription via supabase, refreshes
 *          bootstrap snapshot.
 *   4. Subsequent launches (no network):
 *        → AuthContext reads cached profile/tenant/subscription.
 *          Allowed if grace window (default 7 days) hasn't expired AND
 *          last known subscription status is not SUSPENDED/CANCELLED.
 *
 * Web/mobile users: every helper here is a no-op (gated by isElectron()).
 */

import { getMeta, setMeta } from './cache.js';

const BOOTSTRAP_KEY = 'authBootstrap';

// How long a desktop client can stay offline after the last successful
// online validation before we force a fresh online sign-in.
// 7 days lines up with typical billing cycles + gives field staff
// (vans, kirana counters with patchy 4G) a comfortable buffer.
export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export const isElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent) ||
         !!(typeof window !== 'undefined' && window.electron);
};

/**
 * Persist the validated bootstrap snapshot. Call this *only* after a
 * successful online round-trip to supabase.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.email
 * @param {string} args.tenantId
 * @param {object} args.subscription  — { plan, status }
 */
export async function saveBootstrap({ userId, email, tenantId, subscription }) {
  if (!isElectron()) return;
  if (!userId || !tenantId) return;
  try {
    await setMeta(BOOTSTRAP_KEY, {
      userId,
      email: email || null,
      tenantId,
      subscription: subscription || { plan: null, status: 'ACTIVE' },
      validatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[authGuard] saveBootstrap failed:', err);
  }
}

export async function loadBootstrap() {
  if (!isElectron()) return null;
  try {
    return (await getMeta(BOOTSTRAP_KEY)) || null;
  } catch (_) {
    return null;
  }
}

export async function clearBootstrap() {
  if (!isElectron()) return;
  try { await setMeta(BOOTSTRAP_KEY, null); } catch (_) {}
}

/**
 * True if the bootstrap snapshot is still within the offline grace window.
 */
export function isGraceValid(bootstrap, now = Date.now()) {
  if (!bootstrap?.validatedAt) return false;
  return (now - bootstrap.validatedAt) < OFFLINE_GRACE_MS;
}

/**
 * True if the cached subscription is not in a hard-block state.
 * SUSPENDED / CANCELLED → block. Anything else (ACTIVE, TRIAL, null) → allow.
 */
export function isSubscriptionActive(bootstrap) {
  const status = bootstrap?.subscription?.status;
  if (!status) return true; // legacy tenants without explicit status
  const s = String(status).toUpperCase();
  return s !== 'SUSPENDED' && s !== 'CANCELLED' && s !== 'EXPIRED';
}

/**
 * Single-call gate used by Login.jsx / AuthContext.
 *
 * Returns:
 *   { allowed: true,  reason: 'online' }                 — has network
 *   { allowed: true,  reason: 'offline-grace', bootstrap } — offline but cached + grace valid
 *   { allowed: false, reason: 'offline-no-bootstrap' }   — first launch, offline
 *   { allowed: false, reason: 'offline-grace-expired' }  — cached but too old
 *   { allowed: false, reason: 'subscription-blocked' }   — last known sub is SUSPENDED
 */
export async function evaluateOfflineAccess({ online = navigator?.onLine } = {}) {
  if (!isElectron()) return { allowed: true, reason: 'web' };
  if (online) return { allowed: true, reason: 'online' };

  const bootstrap = await loadBootstrap();
  if (!bootstrap) return { allowed: false, reason: 'offline-no-bootstrap' };
  if (!isSubscriptionActive(bootstrap)) {
    return { allowed: false, reason: 'subscription-blocked', bootstrap };
  }
  if (!isGraceValid(bootstrap)) {
    return { allowed: false, reason: 'offline-grace-expired', bootstrap };
  }
  return { allowed: true, reason: 'offline-grace', bootstrap };
}
