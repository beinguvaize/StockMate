/**
 * Who sees which of the shell's extras (search groups, bell lines, the
 * "Collect payment" button, the low-stock count). Each one follows the gate
 * of the side menu item it leads to, so nothing here can open a page the
 * menu would not: `items` are the menu's own items, already carrying
 * `hidden` (role, permission, vertical module) and `locked` (plan).
 */

/** The menu item with this key, if it is shown and not plan-locked. */
export const openItem = (items, key) => {
  const it = (items || []).find(i => i.key === key);
  return it && !it.hidden && !it.locked ? it : null;
};

/**
 * `can(module, action)` is AuthContext.hasPermission.
 *
 * kpis: the get_dashboard_kpis figures (today's sales, cash, money owed) are
 * read only for someone who may see the Dashboard, so the count beside
 * Inventory is not a way round the Dashboard's own permission.
 */
export function shellGates(items, can = () => false) {
  const inventory = !!openItem(items, 'inventory');
  const clients = !!openItem(items, 'clients');
  const collect = clients && !!can('clients', 'edit');
  const kpis = !!openItem(items, 'dashboard') && !!can('dashboard', 'view');
  return {
    kpis,
    lowStock: inventory && kpis,
    collect,
    notify: {
      inventory: inventory && kpis,
      clients: clients && kpis,
      collect,
      expiry: !!openItem(items, 'reports') && !!can('inventory', 'view'),
    },
    search: {
      product: inventory,
      client: clients,
      supplier: !!openItem(items, 'suppliers'),
      sale: !!openItem(items, 'sales'),
      invoice: !!openItem(items, 'invoices'),
    },
    sell: !!openItem(items, 'sales'),
    // The Dashboard's quick actions (top bar). Each needs its page open AND
    // the right to add there; "Collect payment" is `collect` above.
    quick: {
      expense: !!openItem(items, 'expenses') && !!can('expenses', 'edit'),
      purchase: !!openItem(items, 'purchases') && !!can('purchases', 'edit'),
    },
  };
}

/**
 * The count beside Inventory: the Dashboard's figure, or null for "do not
 * show". Unknown (no answer yet, or the read failed with no earlier answer)
 * and zero both hide it, so the menu never shows a 0 nobody checked.
 */
export const lowStockBadge = (kpi) => {
  const n = Number(kpi?.low_stock_items);
  if (kpi?.low_stock_items == null || !Number.isFinite(n) || n <= 0) return null;
  return n > 999 ? '999+' : String(Math.round(n));
};
