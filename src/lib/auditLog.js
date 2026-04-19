/**
 * Audit Log client — append-only trail for sensitive operations.
 *
 * Writes go through the `log_audit_event` SECURITY DEFINER RPC, which stamps
 * tenant_id from `current_tenant_id()` and actor from `auth.uid()`. Callers
 * cannot forge either.
 *
 * Usage:
 *   await logAuditEvent({
 *     action: 'ROLE_CHANGE',
 *     entityType: 'user',
 *     entityId: targetUser.id,
 *     summary: `Elevated ${targetUser.email} to GLOBAL_ADMIN`,
 *     metadata: { before: { roles: ['STAFF'] }, after: { roles: ['GLOBAL_ADMIN'] } },
 *   });
 *
 * Failures are swallowed (console.warn) — audit logging must never block the
 * primary operation. BUG-007 is about visibility, not enforcement.
 */

import { supabase } from './supabase';

// Canonical action codes. Keep this list in sync with any audit viewer UI.
export const AUDIT_ACTIONS = Object.freeze({
  ROLE_CHANGE:      'ROLE_CHANGE',
  PERMISSION_CHANGE:'PERMISSION_CHANGE',
  USER_CREATE:      'USER_CREATE',
  USER_DELETE:      'USER_DELETE',
  SALE_DELETE:      'SALE_DELETE',          // refund / void
  SALE_REFUND:      'SALE_REFUND',
  PAYROLL_PROCESS:  'PAYROLL_PROCESS',
  PAYROLL_DELETE:   'PAYROLL_DELETE',
  TENANT_PLAN_CHANGE: 'TENANT_PLAN_CHANGE',
});

/**
 * Write one audit event. Fire-and-forget — never throws.
 * @param {Object} evt
 * @param {string} evt.action      - One of AUDIT_ACTIONS
 * @param {string} evt.entityType  - 'user' | 'sale' | 'payroll' | ...
 * @param {string} [evt.entityId]  - DB id of the affected entity
 * @param {string} evt.summary     - Human-readable one-liner
 * @param {Object} [evt.metadata]  - Arbitrary JSON context (before/after, amounts)
 */
export async function logAuditEvent({ action, entityType, entityId = null, summary, metadata = {} }) {
  if (!supabase) {
    // Offline / misconfigured — silently skip. Primary error surface is supabase.js.
    return;
  }
  try {
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_summary: summary,
      p_metadata: metadata,
    });
    if (error) {
      // Don't surface to the user — audit failure must not break the flow.
      console.warn('[audit] log_audit_event failed:', error.message);
    }
  } catch (e) {
    console.warn('[audit] unexpected error:', e);
  }
}

/**
 * Compute the diff between two user records' role-related fields.
 * Returns null if nothing sensitive changed.
 */
export function diffRoles(before, after) {
  const b = Array.isArray(before?.roles) ? [...before.roles].sort() : [];
  const a = Array.isArray(after?.roles)  ? [...after.roles].sort()  : [];
  const rolesChanged = JSON.stringify(b) !== JSON.stringify(a);

  // Permissions: shallow JSON compare (sufficient for RBAC matrix object)
  const bp = JSON.stringify(before?.permissions || {});
  const ap = JSON.stringify(after?.permissions  || {});
  const permsChanged = bp !== ap;

  const statusChanged = (before?.status || null) !== (after?.status || null);

  if (!rolesChanged && !permsChanged && !statusChanged) return null;
  return {
    rolesChanged,
    permsChanged,
    statusChanged,
    before: { roles: b, status: before?.status, permissions: before?.permissions },
    after:  { roles: a, status: after?.status,  permissions: after?.permissions },
  };
}
