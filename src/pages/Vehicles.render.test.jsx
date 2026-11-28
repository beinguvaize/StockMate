import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the Vehicles page and its parts render with every data hook
 * stubbed. The rules are tested in lib/vehiclesView.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}), rpc: async () => ({}) }, restRpc: async () => ({}) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { id: 'u1' }, hasPermission: () => true, hasRole: () => true }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: { currencySymbol: '₹' } }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));
vi.mock('../hooks/useOperations', () => ({ useOperations: () => state.ops }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => state.inv }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => ({ employees: [{ id: 'd1', name: 'Driver A', position: 'Driver' }], clients: [{ id: 'c1', name: 'Client A' }] }) }));

globalThis.React = React;
const { default: Vehicles } = await import('./Vehicles.jsx');
const { default: VanSalePage } = await import('./VanSalePage.jsx');
const { default: DeliveriesTab } = await import('../components/vehicles/DeliveriesTab.jsx');
const { default: FleetTab } = await import('../components/vehicles/FleetTab.jsx');
const { default: StockTab } = await import('../components/vehicles/StockTab.jsx');
const { default: DispatchScreen } = await import('../components/vehicles/DispatchScreen.jsx');
const { default: VanLoadBuilder } = await import('../components/VanLoadBuilder.jsx');
const { default: VanSaleBuilder } = await import('../components/VanSaleBuilder.jsx');
const { vanStockData, vanCurrentStock } = await import('../lib/vehiclesView');

const noop = async () => ({ success: true, error: null });
const vehicles = [
  { id: 'v1', name: 'Van 1', plate: 'XX 01 AB 0001', type: 'VAN', status: 'ACTIVE', fuelType: 'DIESEL', capacity: 800, driverName: 'Driver A', nextServiceDate: '2099-12-12' },
  { id: 'v2', name: 'Van 2', plate: 'XX 01 CD 0002', type: 'VAN', status: 'MAINTENANCE', nextServiceDate: '2020-01-20' },
];
const locations = [{ id: 'W', type: 'WAREHOUSE' }, { id: 'L1', type: 'VEHICLE', reference_id: 'v1' }];
const products = [{ id: 'p1', name: 'Item One', sellingPrice: 48 }, { id: 'p2', name: 'Item Two', sellingPrice: 120 }];
const balances = [{ location_id: 'L1', product_id: 'p1', quantity: 50 }, { location_id: 'L1', product_id: 'p2', quantity: 4 }, { location_id: 'W', product_id: 'p1', quantity: 118 }];
const invoices = [
  { id: 'i1', invoice_number: 'INV-0418', client_name: 'Client A', grand_total: 4820, payment_status: 'UNPAID', delivery_status: 'PENDING', delivery_zone: 'North', delivery_date: '2026-11-28', items: [{ name: 'Item One', qty: 10, rate: 142 }] },
  { id: 'i2', invoice_number: 'INV-0419', client_name: 'Client B', grand_total: 7350, payment_status: 'PAID', delivery_status: 'PENDING', delivery_zone: 'South', failed_delivery_reason: 'Customer unavailable' },
  { id: 'i3', invoice_number: 'INV-0412', client_name: 'Client C', grand_total: 2000, delivery_status: 'IN_TRANSIT' },
];
const routes = [
  { id: 'r1', status: 'ACTIVE', vehicleId: 'v1', driverId: 'd1', location: 'North Zone' },
  { id: 'r0', status: 'RECONCILED', vehicleId: 'v1', driverId: 'd1', location: 'North Zone', actual_cash: 8460, reconciled_at: '2026-11-26T10:00:00Z' },
];
const stops = [
  { id: 's1', route_id: 'r1', status: 'DELIVERED', client_name: 'Client C', invoice_id: 'i3', cash_collected: 2000 },
  { id: 's2', route_id: 'r1', status: 'PENDING', client_name: 'Client D' },
];

const render = (node, path = '/vehicles') => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);

beforeEach(() => {
  state.ops = {
    vehicles, routes, routeStops: stops, deliveryInvoices: invoices, loading: false, refetch() {},
    addVehicle: noop, updateVehicle: noop, deleteVehicle: noop, dispatchRoute: noop, reconcileRoute: noop,
    updateStopStatus: noop, markFailedDelivery: noop, loadVan: noop, unloadVan: noop,
  };
  state.inv = { products, inventoryLocations: locations, inventoryBalances: balances, refetch() {} };
});

describe('Vehicles page', () => {
  it('opens on deliveries waiting, with the strip, service banner and dispatch', () => {
    const out = render(<Vehicles />);
    expect(out).toContain('Waiting to go out');
    expect(out).toContain('₹12,170');
    expect(out).toContain('Van 1 · Driver A');
    expect(out).toContain('1 active · 1 in maintenance');
    expect(out).toContain('Service due: ');
    expect(out).toContain('INV-0418');
    expect(out).toContain('Collect on delivery');
    expect(out).toContain('Back in the queue · last try failed: Customer unavailable');
    expect(out).toContain('Dispatch 2 deliveries');
  });
});

const common = {
  pastRoutes: [routes[1]], routeStops: stops, deliveryInvoices: invoices, vehicles, driverName: () => 'Driver A',
  locations, balances, sym: '₹', canFail: true, canManageFleet: true, canVanSale: true, onSub() {},
};

describe('Vehicles parts', () => {
  it('active trips show progress and stop actions', () => {
    const out = render(<DeliveriesTab {...common} sub="ACTIVE" pending={[]} activeRoutes={[routes[0]]} />);
    expect(out).toContain('On the road');
    expect(out).toContain('</b> of 2 stops delivered');
    expect(out).toContain('54 units on board');
    expect(out).toContain('Van sale');
    expect(out).toContain('End trip');
  });
  it('history lists finished trips with the cash counted in', () => {
    const out = render(<DeliveriesTab {...common} sub="HISTORY" pending={[]} activeRoutes={[]} />);
    expect(out).toContain('26 Nov');
    expect(out).toContain('₹8,460');
    expect(out).toContain('1 trip · ₹8,460 cash counted in');
  });
  it('empty states', () => {
    expect(render(<DeliveriesTab {...common} sub="PENDING" pending={[]} activeRoutes={[]} />)).toContain('No deliveries waiting');
    expect(render(<DeliveriesTab {...common} sub="ACTIVE" pending={[]} activeRoutes={[]} />)).toContain('No trips on the road');
    expect(render(<FleetTab vehicles={[]} canManageFleet stockOf={() => 0} inTripOf={() => false} />)).toContain('No vehicles yet');
  });
  it('fleet cards', () => {
    const out = render(<FleetTab vehicles={vehicles} today="2026-11-28" stockOf={(id) => (id === 'v1' ? 54 : 0)} inTripOf={(id) => id === 'v1'} canManageFleet />);
    expect(out).toContain('Your vehicles');
    expect(out).toContain('On trip');
    expect(out).toContain('54 units');
    expect(out).toContain('Next service 12 Dec 2099');
    expect(out).toContain('Service overdue · 20 Jan 2020');
    expect(out).toContain('Load van stock');
  });
  it('stock tab', () => {
    const data = vanStockData(vehicles, locations, balances, products, [routes[0]]);
    const out = render(<StockTab data={data} sym="₹" onLoad={() => {}} onUnload={() => {}} />);
    expect(out).toContain('Stock on vehicles');
    expect(out).toContain('₹2,880');
    expect(out).toContain('1 low');
    expect(out).toContain('Nothing on this vehicle.');
  });
  it('dispatch screen', () => {
    const out = render(<DispatchScreen vehicles={vehicles} employees={[{ id: 'd1', name: 'Driver A' }]} pending={invoices.slice(0, 2)} deliveryInvoices={invoices}
      vanStockFor={(id) => vanCurrentStock(id, locations, balances, products)} today="2026-11-28" sym="₹" onDispatch={noop} onClose={() => {}} onDone={() => {}} />);
    expect(out).toContain('Send a van out');
    expect(out).toContain('2 of 2 deliveries');
    expect(out).toContain('₹12,170.00');
    expect(out).toContain('54 units on van');
    expect(out).toContain('Send Van 1 out');
  });
  it('load and unload pick screens', () => {
    const load = render(<VanLoadBuilder vehicle={vehicles[1]} warehouseItems={[{ productId: 'p1', productName: 'Item One', available: 118 }]} onSubmit={noop} onClose={() => {}} />);
    expect(load).toContain('Load Van 2');
    expect(load).toContain('118 in warehouse');
    expect(load).toContain('Load vehicle');
    expect(render(<VanLoadBuilder mode="unload" vehicle={vehicles[0]} warehouseItems={[]} onSubmit={noop} onClose={() => {}} />)).toContain('Nothing on this vehicle');
    expect(render(<VanLoadBuilder vehicle={vehicles[0]} warehouseItems={[]} onSubmit={noop} onClose={() => {}} />)).toContain('No warehouse stock to load');
  });
  it('van sale pick list, and the page opened without a trip', () => {
    const out = render(<VanSaleBuilder pageMode vehicle={vehicles[0]} route={routes[0]} driverName="Driver A"
      vanItems={[{ productId: 'p1', productName: 'Item One', sellingPrice: 48, maxQty: 50 }]} clients={[]} onSubmit={noop} onClose={() => {}} />);
    expect(out).toContain('Van sale · Van 1');
    expect(out).toContain('50 on van');
    expect(out).toContain('Checkout');
    expect(render(<VanSalePage />, '/vehicles/van-sale')).toContain('Start a van sale from a trip');
  });
});
