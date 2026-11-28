import { describe, it, expect } from 'vitest';
import {
  serviceStatus, serviceLine, serviceBanner, serviceSummary, statusSummary, onRoadSummary, ymdOf, dayMon,
  activeRoutesOf, pastRoutesOf, pendingOf, zonePills, filterByZone, invoiceNo, selectedTotal, itemLines,
  tripCounts, stockOnBoard, vanCurrentStock, vanStockData, fleetStockFigures, warehouseItems, vanUnloadItems,
  deleteBlock, dispatchProblem, dispatchPayload, returnedStockOf, transferOutcome, retryItems, vehiclePayload,
  vehicleFormOf, recentTripsFor,
} from './vehiclesView';

const TODAY = '2026-11-28';

describe('service dates', () => {
  it('overdue before today, soon within 7 days, otherwise nothing', () => {
    expect(serviceStatus('2026-11-20', TODAY)).toBe('overdue');
    expect(serviceStatus('2026-11-28', TODAY)).toBe('soon');
    expect(serviceStatus('2026-12-05', TODAY)).toBe('soon');
    expect(serviceStatus('2026-12-06', TODAY)).toBe(null);
    expect(serviceStatus('', TODAY)).toBe(null);
  });
  it('words for cards, banner and strip', () => {
    expect(serviceLine({ nextServiceDate: '2026-11-20' }, TODAY)).toEqual({ tone: 'bad', text: 'Service overdue · 20 Nov 2026' });
    expect(serviceLine({ nextServiceDate: '2026-11-30' }, TODAY).tone).toBe('warn');
    expect(serviceLine({ nextServiceDate: '2026-12-12' }, TODAY).text).toBe('Next service 12 Dec 2026');
    expect(serviceLine({}, TODAY)).toBe(null);
    const vs = [{ name: 'Van 2', nextServiceDate: '2026-11-30' }, { name: 'Scooter', nextServiceDate: '2026-11-20' }, { name: 'Van 1', nextServiceDate: '2027-01-01' }];
    expect(serviceBanner(vs, TODAY)).toEqual([{ name: 'Van 2', words: 'on 30 Nov' }, { name: 'Scooter', words: 'was due 20 Nov' }]);
    expect(serviceSummary(vs, TODAY)).toBe('1 overdue, 1 this week');
    expect(serviceBanner([{ name: 'A' }], TODAY)).toBe(null);
  });
});

describe('dates are the shop day', () => {
  it('a timestamp after 18:30 UTC is the next day in India', () => {
    expect(ymdOf('2026-11-25T19:00:00Z')).toBe('2026-11-26');
    expect(ymdOf('2026-11-25 10:00:00+00')).toBe('2026-11-25');
    expect(ymdOf('2026-11-25')).toBe('2026-11-25');
    expect(dayMon('2026-11-05')).toBe('5 Nov');
  });
});

describe('summaries', () => {
  it('status and on-the-road words', () => {
    expect(statusSummary([{ status: 'ACTIVE' }, { status: 'ACTIVE' }, { status: 'MAINTENANCE' }, {}])).toBe('3 active · 1 in maintenance');
    const vehicles = [{ id: 'v1', name: 'Van 1' }];
    const name = (id) => (id === 'd1' ? 'Driver A' : 'Unknown Driver');
    expect(onRoadSummary([], vehicles, name)).toBe('no trips out');
    expect(onRoadSummary([{ vehicleId: 'v1', driverId: 'd1' }, { vehicleId: 'v9' }], vehicles, name)).toBe('Van 1 · Driver A + 1 more');
  });
});

describe('routes and deliveries', () => {
  const routes = [
    { id: 'a', status: 'ACTIVE' }, { id: 'b', status: 'IN_TRANSIT' },
    { id: 'c', status: 'RECONCILED', reconciled_at: '2026-11-20T10:00:00Z' },
    { id: 'd', status: 'COMPLETED', reconciled_at: '2026-11-25T10:00:00Z' },
    { id: 'e', status: 'CANCELLED' },
  ];
  it('active and past, newest first', () => {
    expect(activeRoutesOf(routes).map((r) => r.id)).toEqual(['a', 'b']);
    expect(pastRoutesOf(routes).map((r) => r.id)).toEqual(['d', 'c']);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: String(i), status: 'RECONCILED' }));
    expect(pastRoutesOf(many)).toHaveLength(30);
  });
  it('pending, zones and the selected total', () => {
    const inv = [
      { id: '1', delivery_status: 'PENDING', delivery_zone: 'North', grand_total: 100 },
      { id: '2', delivery_status: 'PENDING', grand_total: 50 },
      { id: '3', delivery_status: 'IN_TRANSIT', grand_total: 70 },
      { id: '4', delivery_status: 'PENDING', delivery_zone: 'North', grand_total: 25 },
    ];
    const p = pendingOf(inv);
    expect(p.map((i) => i.id)).toEqual(['1', '2', '4']);
    expect(zonePills(p)).toEqual([{ key: 'ALL', label: 'All', count: 3 }, { key: 'North', label: 'North', count: 2 }, { key: 'Unzoned', label: 'Unzoned', count: 1 }]);
    expect(filterByZone(p, 'Unzoned').map((i) => i.id)).toEqual(['2']);
    expect(filterByZone(p, 'ALL')).toHaveLength(3);
    expect(selectedTotal(['1', '3', 'x'], inv)).toBe(170);
    expect(invoiceNo({ invoice_number: '##INV-1' })).toBe('INV-1');
  });
  it('item lines keep the old field fallbacks', () => {
    expect(itemLines({ items: [{ product_name: 'A', qty: 2, price: 5 }, { name: 'B', rate: 3, total: 9 }] }))
      .toEqual([{ key: 0, name: 'A', qty: 2, rate: 5, total: 10 }, { key: 1, name: 'B', qty: 1, rate: 3, total: 9 }]);
    expect(itemLines({})).toEqual([]);
  });
  it('trip counts', () => {
    expect(tripCounts([{ status: 'DELIVERED' }, { status: 'NO_SALE' }, { status: 'PENDING' }]))
      .toEqual({ delivered: 1, noSale: 1, pending: 1, total: 3, progress: 33 });
    expect(tripCounts([]).progress).toBe(0);
  });
  it('recent trips for one vehicle', () => {
    expect(recentTripsFor('v1', [{ id: 1, vehicleId: 'v1' }, { id: 2, vehicleId: 'v2' }, { id: 3, vehicleId: 'v1' }]).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe('stock on vehicles', () => {
  const locations = [{ id: 'W', type: 'WAREHOUSE' }, { id: 'L1', type: 'VEHICLE', reference_id: 'v1' }];
  const products = [{ id: 'p1', name: 'Sugar', sellingPrice: 48, category: 'Staples' }, { id: 'p2', name: 'Dal', sellingPrice: 142 }, { id: 'p3', name: 'Oil' }];
  const balances = [
    { location_id: 'L1', product_id: 'p1', quantity: 50 },
    { location_id: 'L1', product_id: 'p2', quantity: 4 },
    { location_id: 'L1', product_id: 'p3', quantity: 0 },
    { location_id: 'W', product_id: 'p1', quantity: 118 },
    { location_id: 'W', product_id: 'p2', quantity: 0 },
  ];
  it('stock on board, current stock, unload and warehouse lists', () => {
    expect(stockOnBoard('v1', locations, balances)).toBe(54);
    expect(stockOnBoard('v9', locations, balances)).toBe(0);
    expect(vanCurrentStock('v1', locations, balances, products).map((i) => [i.productName, i.qty, i.sellingPrice]))
      .toEqual([['Dal', 4, 142], ['Sugar', 50, 48]]);
    expect(vanCurrentStock('', locations, balances, products)).toEqual([]);
    expect(vanUnloadItems('v1', locations, balances, products).map((i) => i.available)).toEqual([4, 50]);
    expect(warehouseItems(products, locations, balances)).toEqual([{ productId: 'p1', productName: 'Sugar', available: 118 }]);
  });
  it('the stock tab: value at selling price, low under 5, bar share of the biggest line', () => {
    const data = vanStockData([{ id: 'v1' }, { id: 'v2' }], locations, balances, products, [{ vehicleId: 'v1', status: 'ACTIVE' }]);
    expect(data[0]).toMatchObject({ totalUnits: 54, totalValue: 50 * 48 + 4 * 142, lowItems: 1, inTrip: true });
    expect(data[0].rows.map((r) => r.pct)).toEqual([100, 8]);
    expect(data[1]).toMatchObject({ totalUnits: 0, rows: [], inTrip: false });
    expect(fleetStockFigures(data)).toEqual({ units: 54, value: 2968, withStock: 1, vehicles: 2, low: 1 });
  });
});

describe('delete guard', () => {
  it('refuses a vehicle on a trip or with stock', () => {
    expect(deleteBlock({ id: 'v1' }, [{ vehicleId: 'v1' }], 0)).toMatch(/on a trip/);
    expect(deleteBlock({ id: 'v1' }, [], 3)).toMatch(/stock on board/);
    expect(deleteBlock({ id: 'v1' }, [{ vehicleId: 'v2' }], 0)).toBe(null);
  });
});

describe('payloads are unchanged', () => {
  it('vehicle form', () => {
    expect(vehiclePayload({ name: 'A', capacity: '800', year: '' })).toEqual({ name: 'A', capacity: 800, year: null });
    expect(vehicleFormOf({ name: 'A' })).toMatchObject({ name: 'A', type: 'VAN', status: 'ACTIVE', fuelType: 'PETROL' });
  });
  it('dispatch checks and payload', () => {
    expect(dispatchProblem({ vehicleId: '' }, [], [])).toEqual({ field: 'vehicle', message: 'Select a vehicle.' });
    expect(dispatchProblem({ vehicleId: 'v' }, [], [])).toEqual({ field: 'driver', message: 'Select a driver.' });
    expect(dispatchProblem({ vehicleId: 'v', driverId: 'd' }, [], []).message).toBe('Select at least 1 delivery, or load the van first.');
    expect(dispatchProblem({ vehicleId: 'v', driverId: 'd' }, [], [{}])).toBe(null);
    const p = dispatchPayload({ vehicleId: 'v', driverId: 'd', location: '' }, ['1'], [{ id: '1', grand_total: 100 }],
      [{ productId: 'p', qty: 3, sellingPrice: 10, costPrice: 6, productName: 'X' }]);
    expect(p).toEqual({
      vehicleId: 'v', driverId: 'd', location: 'Route', initialOdometer: 0, targetAmount: 100, assignedOrders: ['1'],
      loadedStock: [{ productId: 'p', quantity: 3, sellingPrice: 10, costPrice: 6 }],
    });
  });
  it('returned stock is capped at what was loaded and zeros are dropped', () => {
    const loaded = [{ productId: 'a', quantity: 4 }, { productId: 'b', quantity: 10 }, { productId: 'c', quantity: 2 }];
    expect(returnedStockOf(loaded, { a: '9', b: '0', c: 'x' })).toEqual([{ productId: 'a', quantity: 4 }]);
  });
});

describe('load / unload outcome', () => {
  const items = [{ productId: 'p1', name: 'Sugar', quantity: 20 }, { productId: 'p2', name: 'Oil', quantity: 12 }];
  it('all moved', () => {
    const o = transferOutcome(items, { success: true, errors: [] });
    expect(o.movedCount).toBe(2);
    expect(o.movedUnits).toBe(32);
    expect(o.failed).toEqual([]);
  });
  it('a line named in an error did not move, with the server reason', () => {
    const o = transferOutcome(items, { success: false, errors: ['Deduct error (p2): Insufficient stock: 9 available'] });
    expect(o.lines.map((l) => l.status)).toEqual(['moved', 'failed']);
    expect(o.lines[1].reason).toBe('Insufficient stock: 9 available');
    expect(o.movedUnits).toBe(20);
  });
  it('a dropped connection is unconfirmed, not failed', () => {
    const o = transferOutcome(items, { success: false, errors: ['Add error (p1): TypeError: Failed to fetch'] });
    expect(o.lines[0].status).toBe('unconfirmed');
    expect(o.unconfirmed).toHaveLength(1);
  });
  it('an error with no product stops every line', () => {
    const o = transferOutcome(items, { success: false, errors: ['No warehouse location found'] });
    expect(o.lines.every((l) => l.status === 'failed' && l.reason === 'No warehouse location found')).toBe(true);
    expect(o.movedCount).toBe(0);
  });
  it('a retry never asks for more than first asked or than is there', () => {
    const failed = [{ productId: 'p2', name: 'Oil', quantity: 12 }, { productId: 'p3', name: 'Tea', quantity: 5 }];
    expect(retryItems(failed, { p2: 9, p3: 0 })).toEqual([{ productId: 'p2', name: 'Oil', quantity: 9, asked: 12 }]);
    expect(retryItems(failed, { p2: 40 })[0].quantity).toBe(12);
  });
});
