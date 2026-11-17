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
 *          Allowed if grace window (30 days paid/trial, 7 days free) hasn't expired AND
 *          last known subscription status is not SUSPENDED/CANCELLED.
 *
 * Web/mobile users: every helper here is a no-op (gated by isElectron()).
 */

import { getMeta, setMeta } from './cache.js';
import { hasFeature } from '../tenancy.js';

const BOOTSTRAP_KEY = 'authBootstrap';

// How long a desktop client can stay offline after the last successful
// online validation before we force a fresh online sign-in.
// 7 days lines up with typical billing cycles + gives field staff
// (vans, kirana counters with patchy 4G) a comfortable buffer.
export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Paid plans (and trials) get 30 days; everyone else keeps 7.
const CLOCK_SLACK_MS = 6 * 60 * 60 * 1000;
const MAX_SEEN_KEY = 'offlineMaxSeenAt';

export function graceDaysFor(plan, status) {
  if (String(status || '').toUpperCase() === 'TRIAL') return 30;
  return hasFeature(plan, 'offline_30_days') ? 30 : 7;
}

/**
 * Pure grace calculation. `maxSeenAt` is the largest Date.now() this machine
 * has ever reported (see touchMaxSeen) - used to catch a rolled-back clock.
 */
export function graceInfo(bootstrap, now = Date.now(), maxSeenAt = 0) {
  const graceDays = graceDaysFor(bootstrap?.subscription?.plan, bootstrap?.subscription?.status);
  const validatedAt = bootstrap?.validatedAt || 0;
  const expiresAt = validatedAt + graceDays * DAY_MS;
  const clockBack = !!validatedAt &&
    (now < (maxSeenAt || 0) - CLOCK_SLACK_MS || now < validatedAt - CLOCK_SLACK_MS);
  const expired = !validatedAt || now >= expiresAt;
  const daysLeft = Math.max(0, Math.ceil((expiresAt - now) / DAY_MS));
  return { graceDays, validatedAt, expiresAt, daysLeft, expired, clockBack };
}

/** Read the stored max-seen time, then raise it to `now`. Returns the PREVIOUS max. */
export async function touchMaxSeen(now = Date.now()) {
  if (!isElectron()) return 0;
  try {
    const prev = Number(await getMeta(MAX_SEEN_KEY)) || 0;
    if (now > prev) await setMeta(MAX_SEEN_KEY, now);
    return prev;
  } catch (err) {
    console.warn('[authGuard] touchMaxSeen failed (clock-rollback check skipped):', err);
    return 0;
  }
}

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
export function isGraceValid(bootstrap, now = Date.now(), maxSeenAt = 0) {
  if (!bootstrap?.validatedAt) return false;
  const g = graceInfo(bootstrap, now, maxSeenAt);
  return !g.expired && !g.clockBack;
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
  const now = Date.now();
  const maxSeen = await touchMaxSeen(now);
  const info = graceInfo(bootstrap, now, maxSeen);
  if (info.clockBack) return { allowed: false, reason: 'offline-clock-back', bootstrap, info };
  if (info.expired) return { allowed: false, reason: 'offline-grace-expired', bootstrap, info };
  return { allowed: true, reason: 'offline-grace', bootstrap, info };
}
