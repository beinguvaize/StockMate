/**
 * Which store new sales are rung at, on this device.
 *
 * This is the existing multi-store mechanism, not a new one: the Sales
 * screen has kept the choice in localStorage under `pos_store_id` since
 * multi-store landed, and fallen back to the first store when the saved one
 * is gone. The side menu's shop card now offers the same choice, so the two
 * read and write through here and hear about each other's changes.
 *
 * Stores are the shop's inventory locations that are not vehicles, as the
 * Sales screen has always listed them, in the same order (by name).
 */
export const POS_STORE_KEY = 'pos_store_id';
const EVENT = 'bl:pos-store';

export const posStoresFrom = (locations) =>
  (locations || []).filter(l => l && (l.type || 'WAREHOUSE') !== 'VEHICLE' && !l.deleted_at);

/** The store in effect: the saved one if it still exists, else the first. */
export const currentStoreOf = (stores, savedId) =>
  (stores || []).find(s => s.id === savedId) || (stores || [])[0] || null;

export function readPosStore(storage = globalThis.localStorage) {
  try { return storage?.getItem(POS_STORE_KEY) || ''; } catch { return ''; }
}

export function writePosStore(id, storage = globalThis.localStorage) {
  if (!id) return;
  try { storage?.setItem(POS_STORE_KEY, id); } catch { /* private window */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: id })); } catch { /* no window */ }
}

/** Calls `fn(id)` when the store is changed in this tab or another one. */
export function onPosStoreChange(fn) {
  if (typeof window === 'undefined') return () => {};
  const local = (e) => fn(e.detail);
  const other = (e) => { if (e.key === POS_STORE_KEY && e.newValue) fn(e.newValue); };
  window.addEventListener(EVENT, local);
  window.addEventListener('storage', other);
  return () => { window.removeEventListener(EVENT, local); window.removeEventListener('storage', other); };
}
