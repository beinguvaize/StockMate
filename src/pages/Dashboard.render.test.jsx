import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the Dashboard renders its two states (running shop, new shop)
 * and its failure states, with every data hook stubbed. This is what catches
 * a misspelt variable in the page before a shopkeeper does; the figures
 * themselves are tested in lib/dashboardFigures, topSelling and supplierOwed.
 */

const state = {};
const ok = (extra = {}) => ({ loading: false, error: null, refetch: () => {}, ...extra });

vi.mock('../lib/supabase', () => ({ supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {} } }));
vi.mock('../lib/realtime', () => ({ realtimeEnabled: () => false }));
vi.mock('../lib/offline/hookAdapter', () => ({ isElectron: () => false }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: state.profile }) }));
vi.mock('../hooks/useRefetchOnFocus', () => ({ default: () => {} }));
vi.mock('../hooks/useDashboardKpis', () => ({ useDashboardKpis: () => state.kpis }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => state.inventory }));
vi.mock('../hooks/useSales', () => ({ useSales: () => state.sales }));
vi.mock('../hooks/usePurchases', () => ({ usePurchases: () => state.purchases }));
vi.mock('../hooks/useFinance', () => ({ useFinance: () => state.finance }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => state.people }));
vi.mock('../hooks/useStaffDues', () => ({ useStaffDues: () => state.staff }));
vi.mock('../hooks/useOperations', () => ({ useOperations: () => ok({ routes: [], movementLog: [] }) }));
vi.mock('../hooks/useAccounts', () => ({ useAccounts: () => ok({ accounts: [], balances: {} }) }));
vi.mock('../hooks/useTopSellingItems', () => ({ useTopSellingItems: () => state.top }));
vi.mock('../components/reports/usePLRanged', () => ({ default: (from) => (from ? state.pl : { pl: null, loading: true, error: null, refetch: () => {} }) }));
vi.mock('../components/AppLayout', () => ({ DashboardQuickActions: () => null }));
vi.mock('../components/BannerCarousel', () => ({ default: () => null }));
vi.mock('../components/ExpiryAlertCard', () => ({ default: () => null }));
vi.mock('../components/DailyRevenueTrendChart', () => ({ default: () => null }));

// The unit-test runner uses the classic JSX transform; the app's build does not
// need React in scope, so some components do not import it.
globalThis.React = React;
const { default: Dashboard } = await import('./Dashboard.jsx');
const { todayISOInAppTZ } = await import('../lib/utils');

const render = () => renderToStaticMarkup(<MemoryRouter><Dashboard /></MemoryRouter>);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const running = () => {
  const today = todayISOInAppTZ();
  Object.assign(state, {
    profile: { currencySymbol: '₹', gst_no: 'X' },
    kpis: { data: { today_sales: 1200, today_expenses: 90, today_purchases: 500, outstanding_collections: 700, total_products: 3, low_stock_items: 0 }, error: null, refetch: () => {} },
    inventory: ok({ products: [{ id: 'p1', name: 'Item A', stock: 5 }], inventoryBalances: [] }),
    sales: ok({ sales: [{ id: 's1', date: today, totalAmount: 1200 }, { id: 's0', date: '2025-01-01', totalAmount: 1000 }] }),
    purchases: ok({ purchases: [{ supplier_id: 'v1', total_amount: 500, paid_amount: 0, date: today }], suppliers: [{ id: 'v1', name: 'Supplier One' }] }),
    finance: ok({ expenses: [{ id: 'e1', date: today, amount: 90, category: 'Transport' }], dayBook: [] }),
    people: ok({ clients: [{ id: 'c1', name: 'Client One', outstanding_balance: 700 }], employees: [], users: [{ id: 'u1' }, { id: 'u2' }] }),
    staff: { rows: [], total: 0, ready: true, error: null, refetch: () => {} },
    top: ok({ rows: [{ key: 'p1', name: 'Item A', qty: 2, value: 1200, rank: 1, share: 100 }], itemCount: 1 }),
    pl: { pl: { gross_profit: 300 }, loading: false, error: null, refetch: () => {} },
  });
};

describe('Dashboard renders', () => {
  beforeEach(running);

  it('a running shop: two rows of four figures, the lists, no setup guide', () => {
    const t = text(render());
    for (const label of ['For the period', 'Right now', 'Sales today', 'Profit today', 'Expenses today', 'Purchases today',
      'Cash balance', 'Owed to you', 'You owe', 'Salary pending', 'Top-selling items', 'You owe most', 'Owed to you most']) {
      expect(t).toContain(label);
    }
    expect(t).toContain('Today, compared with yesterday at this time');
    // get_pl_ranged is whole days: profit's pill waits for the end of the day.
    expect(t).toContain('compares at end of day');
    expect(t).toContain('₹300');          // profit, straight from get_pl_ranged
    expect(t).toContain('to 1 supplier');
    expect(t).toContain('Supplier One');
    expect(t).not.toContain('Set up your shop');
  });

  it('a new shop shows the setup guide with steps ticked from its data', () => {
    state.sales = ok({ sales: [] });
    state.profile = { currencySymbol: '₹', gst_no: '' };
    state.people = ok({ clients: [], employees: [], users: [{ id: 'u1' }] });
    state.top = ok({ rows: [], itemCount: 0 });
    const t = text(render());
    expect(t).toContain('Set up your shop');
    expect(t).toContain('2 of 5 done');
    expect(t).toContain('nothing to compare yet');
    expect(t).toContain('No items sold yet');
    expect(t).toContain('your first sale shows here');
  });

  it('a failed read says so instead of showing zeros', () => {
    state.purchases = ok({ purchases: [], suppliers: [], error: 'boom' });
    state.pl = { pl: null, loading: false, error: 'boom', refetch: () => {} };
    state.top = ok({ rows: [], itemCount: 0, error: 'boom' });
    const t = text(render());
    expect(t).toContain('Supplier bills could not be loaded');
    expect(t).toContain('Top-selling items could not be loaded');
    expect(t).toContain('Could not load');
  });
});
