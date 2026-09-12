import { isElectron } from './offline/hookAdapter';

/**
 * Which surfaces open a Realtime subscription, and which rely on refetching.
 *
 * Realtime was on by default everywhere: 11 files, 19 subscriptions, so a user
 * with a few pages open held 10-15 live subscriptions. Postgres re-evaluates
 * subscription rules on every write, and that made Realtime 57% of all database
 * time -- with ONE active business. It is the ceiling this product hits first,
 * well before storage or bandwidth.
 *
 * Most of it was redundant. useRefetchOnFocus already exists and is used by ten
 * hooks, so those screens refresh when the user returns to the tab anyway. A
 * subscription that duplicates a refetch costs the database and buys nothing.
 *
 * TWO RULES:
 *
 * 1. DESKTOP SUBSCRIBES TO NOTHING. The desktop app is offline-first by design:
 *    it reads from a local cache and syncs every 10 minutes and on focus. It was
 *    paying full Realtime cost for data it already receives another way.
 *
 * 2. ON WEB, only surfaces where "live" is the point stay subscribed. A shop
 *    floor watching a delivery van, a kitchen watching orders, and a till where
 *    a second terminal may be selling the same stock -- those genuinely need to
 *    update without a click. A report or a dashboard does not.
 *
 * To put a surface back, add its key to LIVE_SURFACES. That is the whole change;
 * the guard reads this list and nothing else.
 */
export const LIVE_SURFACES = Object.freeze([
  'sales',     // a second till selling the same stock
  'orders',    // kitchen display
  'vehicles',  // van tracking on a map
]);

/**
 * True when this surface should hold an open subscription.
 * Everything else refreshes on focus, which the hooks already do.
 */
export const realtimeEnabled = (surface) => {
  if (isElectron()) return false;
  return LIVE_SURFACES.includes(surface);
};

export default realtimeEnabled;
