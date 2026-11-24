/**
 * One place that decides whether this install bills from the local database.
 * ==========================================================================
 *
 * Until now that decision was `isElectron()`, spelled out at six separate
 * call sites in hookAdapter.js. It meant two things at once -- "is this the
 * desktop build" and "may we use the cache and the outbox" -- and once the web
 * app is allowed a local database those stop being the same question.
 *
 * So the question is asked here, once, and the gates ask this instead.
 *
 * ROLLOUT, AND WHY IT IS NOT A DATABASE FLAG
 *
 * Billing from a local copy is the kind of change that wants to go to one shop
 * first and be revocable from the counter, not from a migration. So:
 *
 *   Electron          always on. This is today's behaviour, unchanged.
 *   Web               on when the tenant is listed in VITE_LOCAL_FIRST_TENANTS,
 *                     or when someone sets the local override.
 *
 * A build-time list is a deliberately blunt instrument: switching a tenant on
 * is a deploy, switching the whole thing off is one variable. The override
 * exists so a specific machine can be tried (or taken out of the experiment)
 * without waiting for one.
 *
 * The flag is read ONCE per tenant resolution and cached, because the gates
 * are called inside render paths and on every write; re-reading localStorage
 * there would be work in the hot loop for a value that cannot change
 * mid-session without a reload.
 */

const OVERRIDE_KEY = 'sm.localFirst';

/** Resolved state. null = not configured yet, so the gates stay conservative. */
let _enabled = null;
let _tenantId = null;

/**
 * Desktop detection, moved here from hookAdapter so there is one copy.
 * UA sniffing plus the preload bridge: the bridge is the reliable half, the UA
 * covers a renderer that has not had it injected yet.
 */
export const isElectron = () => {
  if (typeof navigator === 'undefined') return false;
  return /Electron/i.test(navigator.userAgent)
    || !!(typeof window !== 'undefined' && window.electron);
};

/** The per-machine override: 'on' | 'off' | null when unset. */
export function readOverride() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(OVERRIDE_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    // Private mode, blocked storage: no override, not an error.
    return null;
  }
}

/** Tenants switched on at build time, as a set of ids. */
export function allowlist() {
  const raw = (import.meta?.env?.VITE_LOCAL_FIRST_TENANTS ?? '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(/[,\s]+/).filter(Boolean));
}

/**
 * Decide, without touching module state. Exported so the rule itself is
 * testable without configuring anything.
 *
 * The override wins in both directions on purpose: 'off' must be able to take
 * a till OUT of the experiment on the spot, including a desktop one, because
 * the fallback -- read straight from the server -- is the behaviour that has
 * been running for a year.
 */
export function decideLocalFirst({ tenantId, electron, override, allow } = {}) {
  if (override === 'off') return false;
  if (override === 'on') return true;
  if (electron) return true;
  if (!tenantId) return false;
  return (allow || new Set()).has(tenantId);
}

/**
 * Called when the tenant resolves (and again when it changes).
 * Returns the resolved boolean so the caller can log what it got.
 */
export function configureLocalFirst(tenantId) {
  _tenantId = tenantId || null;
  _enabled = decideLocalFirst({
    tenantId: _tenantId,
    electron: isElectron(),
    override: readOverride(),
    allow: allowlist(),
  });
  return _enabled;
}

/**
 * The gate the rest of the offline layer asks.
 *
 * Before configureLocalFirst has run, fall back to the desktop answer rather
 * than to `false`: the desktop app queues sales at the counter, and a window
 * between boot and tenant resolution where it silently stopped doing that
 * would lose a bill and look like nothing happened.
 */
export function localFirstEnabled() {
  if (_enabled === null) return isElectron();
  return _enabled;
}

/** For tests and for the Troubleshoot menu. */
export function resetLocalFirst() {
  _enabled = null;
  _tenantId = null;
}

export function localFirstState() {
  return { enabled: localFirstEnabled(), tenantId: _tenantId, override: readOverride() };
}
