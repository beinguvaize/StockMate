/**
 * Users & roles view rules (web redesign, mockups users-01 to 08).
 *
 * Pure functions only. The rules that decide what a role template fills in,
 * how a View/Edit switch moves its partner, who is listed and which row
 * actions show are moved here from pages/Users.jsx unchanged, so they can be
 * tested. Nothing here writes; the page calls usePeople exactly as before.
 */
import { DEFAULT_PERMISSIONS, MODULES_CONFIG } from './constants';
import { PLANS } from './tenancy';

/** The five templates, in the order the dialog lists them. */
export const ROLE_TEMPLATES = [
  { id: 'OWNER', label: 'Owner', hint: 'Full access to every module' },
  { id: 'SALES', label: 'Sales', hint: 'Sales, Clients and Day Book' },
  { id: 'INVENTORY', label: 'Inventory', hint: 'Inventory, Purchases and Suppliers' },
  { id: 'DRIVER', label: 'Driver', hint: 'Van sales and operations only' },
  { id: 'CUSTOM', label: 'Custom', hint: 'Choose each module below' },
];

const ROLE_WORDS = {
  OWNER: 'Owner', SALES: 'Sales', INVENTORY: 'Inventory', DRIVER: 'Driver',
  CUSTOM: 'Custom', STAFF: 'Staff', GLOBAL_ADMIN: 'Platform admin',
};
export const roleLabel = (role) => ROLE_WORDS[role] || (role ? String(role) : 'Staff');

/** A fresh form, as the page has always opened "add". */
export const blankForm = () => ({ name: '', email: '', roles: ['STAFF'], permissions: { ...DEFAULT_PERMISSIONS } });

/** The form for editing a login (no password field: it is never edited here). */
export const formFromUser = (user) => ({
  name: user.name,
  email: user.email,
  roles: user.roles || [user.role || 'STAFF'],
  permissions: user.permissions || { ...DEFAULT_PERMISSIONS },
});

/** The permissions a template fills in. Unchanged from the old page. */
export function templatePermissions(roleId) {
  const map = {
    OWNER: Object.keys(DEFAULT_PERMISSIONS).reduce((acc, key) => ({ ...acc, [key]: { view: true, edit: true } }), {}),
    // No dashboard for the templates: privacy.
    SALES: { ...DEFAULT_PERMISSIONS, sales: { view: true, edit: true }, clients: { view: true, edit: true }, daybook: { view: true, edit: true } },
    INVENTORY: { ...DEFAULT_PERMISSIONS, inventory: { view: true, edit: true }, purchases: { view: true, edit: true }, suppliers: { view: true, edit: true } },
    DRIVER: { ...DEFAULT_PERMISSIONS, vehicles: { view: true, edit: true }, sales: { view: true, edit: true } },
    CUSTOM: { ...DEFAULT_PERMISSIONS },
  };
  return map[roleId] || null;
}

/**
 * Picking a template. Picking the one already chosen clears it back to
 * STAFF with nothing switched on, as the old page did.
 */
export function pickTemplate(form, roleId) {
  const isSelected = form.roles?.includes(roleId);
  return {
    ...form,
    roles: isSelected ? ['STAFF'] : [roleId],
    permissions: isSelected ? { ...DEFAULT_PERMISSIONS } : (templatePermissions(roleId) || form.permissions),
  };
}

/** Edit on turns View on; View off turns Edit off. */
export function togglePermission(form, moduleKey, action) {
  const current = form.permissions || { ...DEFAULT_PERMISSIONS };
  const mod = current[moduleKey] || { view: false, edit: false };
  const next = { ...mod, [action]: !mod[action] };
  if (action === 'view' && !next.view) next.edit = false;
  if (action === 'edit' && next.edit) next.view = true;
  return { ...form, permissions: { ...current, [moduleKey]: next } };
}

/** Platform staff are hidden from a shop's own list. */
export function visibleUsers(all, currentUser) {
  const list = all || [];
  if (currentUser?.roles?.includes('GLOBAL_ADMIN')) return list;
  return list.filter((u) => !(u.roles || []).includes('GLOBAL_ADMIN'));
}

export const rolesOf = (user) => user?.roles || [user?.role || 'SALES'];
export const primaryRole = (user) => rolesOf(user)[0];

const join = (labels) => labels.join(', ');

/**
 * "Can open" in words, following the same order of rules the app uses to
 * let a login in (AuthContext.hasPermission): a template role decides by
 * itself; only a login with none of them reads its own switches.
 */
export function canOpenWords(user) {
  const roles = rolesOf(user);
  if (roles.includes('GLOBAL_ADMIN') || roles.includes('OWNER')) return 'Every module, view and edit';
  if (roles.includes('STAFF')) return 'View every module; edit Sales, Clients, Day Book';
  if (roles.includes('SALES')) return 'Sales, Clients, Day Book';
  if (roles.includes('INVENTORY')) return 'Inventory, Purchases, Suppliers';
  if (roles.includes('DRIVER')) return 'Vehicles, Sales';
  const perms = user?.permissions || {};
  const label = (k) => MODULES_CONFIG.find((m) => m.key === k)?.label || (k === 'dashboard' ? 'Dashboard' : k);
  const keys = [...(perms.dashboard ? ['dashboard'] : []), ...MODULES_CONFIG.map((m) => m.key)];
  const edit = keys.filter((k) => perms[k]?.edit).map(label);
  const viewOnly = keys.filter((k) => perms[k]?.view && !perms[k]?.edit).map(label);
  if (!edit.length && !viewOnly.length) return 'Nothing yet';
  const viewWords = viewOnly.length > 1
    ? `${viewOnly.slice(0, -1).join(', ')} and ${viewOnly[viewOnly.length - 1]}`
    : viewOnly[0];
  if (!edit.length) return `View ${viewWords}`;
  return viewOnly.length ? `${join(edit)}; view ${viewWords}` : join(edit);
}

/**
 * What a row offers. Same rules as before: a platform admin's row is only
 * managed by a platform admin, and nobody deactivates or removes themselves
 * (the old page disabled the toggle and hid remove on your own row).
 */
export function userRowActions(user, currentUser) {
  const isPlatform = rolesOf(user).includes('GLOBAL_ADMIN');
  const canManage = !isPlatform || !!currentUser?.roles?.includes('GLOBAL_ADMIN');
  const isSelf = !!currentUser && user.id === currentUser.id;
  return {
    canManage,
    isSelf,
    canEdit: canManage,
    canToggle: canManage && !isSelf,
    canRemove: canManage && !isSelf,
    active: user.status === 'ACTIVE',
  };
}

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Avatar tint by role: owner amber, sales blue, inventory green, rest grey. */
export const avatarTone = (role) => ({ OWNER: 'a', GLOBAL_ADMIN: 'a', SALES: 'b', INVENTORY: 'g' }[role] || '');

/**
 * "4 active logins of 5 on Pro". Display only: the seat cap comes from
 * PLANS, as usePlanLimits reads it. Unlimited plans say so.
 */
export function seatNote(users, plan) {
  const active = (users || []).filter((u) => u.status === 'ACTIVE').length;
  const meta = PLANS[plan] || null;
  const max = meta ? meta.maxUsers : null;
  const s = active === 1 ? '' : 's';
  if (!meta) return { active, max: null, planLabel: null, words: `${active} active login${s}` };
  if (max === -1) return { active, max, planLabel: meta.label, words: `${active} active login${s} on ${meta.label}, no limit` };
  return { active, max, planLabel: meta.label, words: `${active} active login${s} of ${max} on ${meta.label}` };
}

/** Password strength segments to light (0 to 4) and the word for them. */
export function strengthWords(score) {
  return ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][Math.max(0, Math.min(4, score || 0))];
}
