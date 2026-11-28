/**
 * The bell in the top bar: what it lists, and what has been read.
 *
 * Nothing here is a new calculation. Each line restates a figure the
 * Dashboard already shows, from the same read:
 *
 *   low stock      get_dashboard_kpis.low_stock_items (the Dashboard's
 *                  "Low stock items" figure and the side menu's count)
 *   money owed     get_dashboard_kpis.outstanding_collections (the
 *                  Dashboard's "Owed to you")
 *   expiring stock the Dashboard's expiry alert: batches with stock left
 *                  whose expiry date is past, or within 30 days
 *
 * A line appears only when its figure is known and above zero, and only to
 * someone allowed to open the page it links to. "Read" is kept per browser
 * (as the phone keeps everything about its bell on the device): a line counts
 * as read while its figure is the one that was seen, so a changed figure
 * brings the dot back.
 */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const num = (v) => (v == null || v === '' ? NaN : Number(v));

export function deriveNotifications({ kpi, expiry, gates = {}, basePath = '', money = (n) => String(n) } = {}) {
  const out = [];

  const low = num(kpi?.low_stock_items);
  if (gates.inventory && Number.isFinite(low) && low > 0) {
    out.push({
      id: 'low-stock', sig: String(low), tone: 'warn',
      title: `${plural(low, 'item', 'items')} low on stock`,
      body: 'Check them in Inventory and restock before they run out.',
      to: `${basePath}/inventory`, action: 'Open Inventory',
    });
  }

  const expired = num(expiry?.expired);
  const soon = num(expiry?.soon);
  if (gates.expiry && Number.isFinite(expired) && Number.isFinite(soon) && expired + soon > 0) {
    const title = expired > 0 && soon > 0
      ? `${plural(expired, 'batch', 'batches')} expired, ${soon} more within 30 days`
      : expired > 0
        ? `${plural(expired, 'batch', 'batches')} expired`
        : `${plural(soon, 'batch', 'batches')} expiring within 30 days`;
    out.push({
      id: 'expiry', sig: `${expired}:${soon}`, tone: expired > 0 ? 'bad' : 'warn',
      title, body: 'Sell, return or write them off before they go to waste.',
      to: `${basePath}/reports?tab=EXPIRY`, action: 'Review',
    });
  }

  const owed = num(kpi?.outstanding_collections);
  if (gates.clients && Number.isFinite(owed) && owed > 0) {
    out.push({
      id: 'owed', sig: String(Math.round(owed)), tone: 'info',
      title: `${money(owed)} owed to you`,
      body: 'Clients with a balance still to pay.',
      to: gates.collect ? `${basePath}/clients/collect` : `${basePath}/clients`,
      action: gates.collect ? 'Collect payment' : 'Open Clients',
    });
  }

  return out;
}

/** Lines whose current figure has not been seen. */
export const unreadOf = (list, readMap) => (list || []).filter(n => (readMap || {})[n.id] !== n.sig);

/** The read map with every listed line marked as seen at its current figure. */
export const markAllRead = (list, readMap) =>
  (list || []).reduce((m, n) => ({ ...m, [n.id]: n.sig }), { ...(readMap || {}) });

const keyFor = (tenantId) => `bl_notifications_read:${tenantId}`;

/** Stored read map for this shop in this browser; {} when storage is unavailable. */
export function loadReadMap(tenantId, storage = globalThis.localStorage) {
  if (!tenantId) return {};
  try {
    const raw = storage?.getItem(keyFor(tenantId));
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function saveReadMap(tenantId, map, storage = globalThis.localStorage) {
  if (!tenantId) return;
  try { storage?.setItem(keyFor(tenantId), JSON.stringify(map || {})); } catch { /* private window */ }
}
