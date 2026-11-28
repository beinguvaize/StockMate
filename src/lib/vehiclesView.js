/**
 * Vehicles page view rules (web redesign, approved boards vehicles-01 to 22).
 *
 * Pure functions over what useOperations / useInventory / usePeople already
 * load. Nothing here writes, and nothing here works out money the page did
 * not already show: the sums are the same grand_total / actual_cash /
 * qty x selling-price figures the old page added up. The payloads handed to
 * dispatchRoute and reconcileRoute are built exactly as the old page built
 * them (moved here so they can be tested, not changed).
 */
import { isTransportFailure } from './writeOutcome';

// ── Labels ───────────────────────────────────────────────────────────────────
export const VEHICLE_TYPES = ['VAN', 'TRUCK', 'BIKE', 'CAR', 'OTHER'];
export const FUEL_TYPES = ['PETROL', 'DIESEL', 'ELECTRIC', 'CNG', 'HYBRID'];
export const VEHICLE_STATUSES = ['ACTIVE', 'IN_SERVICE', 'MAINTENANCE', 'BREAKDOWN'];

export const TYPE_LABEL = { VAN: 'Van', TRUCK: 'Truck', BIKE: 'Bike', CAR: 'Car', OTHER: 'Other' };
export const FUEL_LABEL = { PETROL: 'Petrol', DIESEL: 'Diesel', ELECTRIC: 'Electric', CNG: 'CNG', HYBRID: 'Hybrid' };
/** tone: badge tone; few: the words in a "3 active · 1 in maintenance" summary. */
export const STATUS = {
  ACTIVE:      { label: 'Active',      tone: 'good', few: 'active' },
  IN_SERVICE:  { label: 'In service',  tone: 'info', few: 'in service' },
  MAINTENANCE: { label: 'Maintenance', tone: 'warn', few: 'in maintenance' },
  BREAKDOWN:   { label: 'Breakdown',   tone: 'bad',  few: 'broken down' },
};
export const statusOf = (s) => STATUS[s] || STATUS.ACTIVE;
export const typeLabel = (t) => TYPE_LABEL[t] || t || '';
export const fuelLabel = (f) => FUEL_LABEL[f] || f || '';

export const FAILED_REASONS = [
  'Customer unavailable', 'Wrong address', 'Customer refused delivery', 'Payment issue', 'Damaged goods', 'Other',
];

export const EMPTY_VEHICLE_FORM = {
  name: '', plate: '', type: 'VAN', status: 'ACTIVE',
  capacity: '', fuelType: 'PETROL', color: '', year: '',
  lastServiceDate: '', nextServiceDate: '', driverName: '',
};

/** The form for an existing vehicle (same fields the old page filled). */
export const vehicleFormOf = (v) => ({
  name: v.name || '', plate: v.plate || '', type: v.type || 'VAN',
  status: v.status || 'ACTIVE', capacity: v.capacity || '',
  fuelType: v.fuelType || 'PETROL', color: v.color || '',
  year: v.year || '', lastServiceDate: v.lastServiceDate || '',
  nextServiceDate: v.nextServiceDate || '', driverName: v.driverName || '',
});

/** What addVehicle / updateVehicle are sent: unchanged from the old page. */
export const vehiclePayload = (form) => ({
  ...form,
  capacity: form.capacity ? Number(form.capacity) : null,
  year: form.year ? Number(form.year) : null,
});

// ── Dates (shop's local day) ─────────────────────────────────────────────────
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** The shop-local YYYY-MM-DD of a timestamp; a bare date passes through. */
export const ymdOf = (value, timeZone = 'Asia/Kolkata') => {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
  if (Number.isNaN(d.getTime())) return YMD.test(s) ? s.slice(0, 10) : '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
/** "28 Nov" */
export const dayMon = (ymd) => { const m = YMD.exec(String(ymd || '')); return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]}` : ''; };
/** "28 Nov 2026" */
export const dayMonYear = (ymd) => { const m = YMD.exec(String(ymd || '')); return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : ''; };

const dayNo = (ymd) => { const m = YMD.exec(String(ymd || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN; };

/**
 * 'overdue' | 'soon' | null for a next-service date against today (both
 * shop-local days). Soon = within the next 7 days, as before.
 */
export const serviceStatus = (nextServiceDate, today) => {
  if (!nextServiceDate) return null;
  const diff = dayNo(nextServiceDate) - dayNo(today);
  if (Number.isNaN(diff)) return null;
  if (diff < 0) return 'overdue';
  if (diff <= 7) return 'soon';
  return null;
};

/** The service line on a card or panel, or null when no date is set. */
export const serviceLine = (v, today) => {
  if (!v?.nextServiceDate) return null;
  const st = serviceStatus(v.nextServiceDate, today);
  const when = dayMonYear(v.nextServiceDate) || v.nextServiceDate;
  if (st === 'overdue') return { tone: 'bad', text: `Service overdue · ${when}` };
  if (st === 'soon') return { tone: 'warn', text: `Service due soon · ${when}` };
  return { tone: 'neutral', text: `Next service ${when}` };
};

/** "Service due: Van 2 on 30 Nov · Scooter was due 20 Nov", or null. */
export const serviceBanner = (vehicles, today) => {
  const due = (vehicles || []).filter((v) => serviceStatus(v.nextServiceDate, today));
  if (!due.length) return null;
  return due.map((v) => ({
    name: v.name,
    words: serviceStatus(v.nextServiceDate, today) === 'overdue'
      ? `was due ${dayMon(v.nextServiceDate)}` : `on ${dayMon(v.nextServiceDate)}`,
  }));
};

// ── Routes, deliveries ───────────────────────────────────────────────────────
export const vehicleIdOf = (r) => r?.vehicleId ?? r?.['vehicleId'];
export const driverIdOf = (r) => r?.driverId ?? r?.['driverId'];

export const activeRoutesOf = (routes) => (routes || []).filter((r) => r.status === 'ACTIVE' || r.status === 'IN_TRANSIT');

/** Finished trips, newest first, up to 30 (as before). */
export const pastRoutesOf = (routes) => (routes || [])
  .filter((r) => r.status === 'RECONCILED' || r.status === 'COMPLETED')
  .sort((a, b) => new Date(b.reconciled_at || 0) - new Date(a.reconciled_at || 0))
  .slice(0, 30);

export const pendingOf = (deliveryInvoices) => (deliveryInvoices || []).filter((i) => i.delivery_status === 'PENDING');

export const zoneOf = (inv) => inv.delivery_zone || 'Unzoned';

/** Zone filter pills: All first, then zones A-Z. Shown only with 2+ zones. */
export const zonePills = (pending) => {
  const counts = {};
  pending.forEach((i) => { const z = zoneOf(i); counts[z] = (counts[z] || 0) + 1; });
  const zones = Object.keys(counts).sort();
  return [{ key: 'ALL', label: 'All', count: pending.length }, ...zones.map((z) => ({ key: z, label: z, count: counts[z] }))];
};

export const filterByZone = (pending, zone) => (zone === 'ALL' ? pending : pending.filter((i) => zoneOf(i) === zone));

export const invoiceNo = (inv) => String(inv?.invoice_number || inv?.id || '').replace(/^#+/, '');

/** Sum of grand totals of the given invoice ids (the dispatch target, as before). */
export const selectedTotal = (ids, deliveryInvoices) => ids.reduce((s, id) => {
  const inv = (deliveryInvoices || []).find((i) => i.id === id);
  return s + (inv?.grand_total || 0);
}, 0);

export const sumGrand = (invoices) => (invoices || []).reduce((s, i) => s + (Number(i.grand_total) || 0), 0);

/** One invoice's item lines for the expanded row (same field fallbacks as before). */
export const itemLines = (inv) => (Array.isArray(inv?.items) ? inv.items : []).map((item, idx) => {
  const qty = item.quantity ?? item.qty ?? 1;
  const rate = Number(item.rate ?? item.price ?? item.unit_price ?? 0);
  const total = Number(item.total ?? (rate * qty));
  return { key: item.id || idx, name: item.name || item.product_name || item.productName || '—', qty, rate, total };
});

export const stopsOf = (routeStops, routeId) => (routeStops || []).filter((s) => s.route_id === routeId);

/** Delivered / no sale / pending counts and the delivered share. */
export const tripCounts = (stops) => {
  const delivered = stops.filter((s) => s.status === 'DELIVERED').length;
  const noSale = stops.filter((s) => s.status === 'NO_SALE').length;
  const pending = stops.filter((s) => s.status === 'PENDING').length;
  const total = stops.length;
  return { delivered, noSale, pending, total, progress: total > 0 ? Math.round((delivered / total) * 100) : 0 };
};

// ── Stock on vehicles ────────────────────────────────────────────────────────
export const vehicleLocOf = (locations, vehicleId) =>
  (locations || []).find((l) => l.type === 'VEHICLE' && l.reference_id === vehicleId) || null;

/** The Fleet card's "Stock on board": every balance at the vehicle's location (as before). */
export const stockOnBoard = (vehicleId, locations, balances) => {
  const loc = (locations || []).find((l) => l.reference_id === vehicleId);
  return loc ? (balances || []).filter((b) => b.location_id === loc.id).reduce((s, i) => s + (i.quantity || 0), 0) : 0;
};

const priceOf = (p) => p?.sellingPrice ?? p?.selling_price ?? 0;
const costOf = (p) => p?.costPrice ?? p?.cost_price ?? 0;

/** What is on a van now, A-Z: the dispatch screen's read-only list (as before). */
export const vanCurrentStock = (vehicleId, locations, balances, products) => {
  if (!vehicleId) return [];
  const loc = vehicleLocOf(locations, vehicleId);
  if (!loc) return [];
  return (balances || [])
    .filter((b) => b.location_id === loc.id && Number(b.quantity) > 0)
    .map((b) => {
      const p = (products || []).find((pr) => pr.id === b.product_id);
      return { productId: b.product_id, productName: p?.name || b.product_id, qty: Number(b.quantity), sellingPrice: priceOf(p), costPrice: costOf(p) };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
};

export const LOW_UNITS = 5;

/** The Stock tab, per vehicle (same rows, low rule and value as before). */
export const vanStockData = (vehicles, locations, balances, products, activeRoutes) => (vehicles || []).map((v) => {
  const loc = vehicleLocOf(locations, v.id);
  const rows = loc
    ? (balances || [])
      .filter((b) => b.location_id === loc.id && b.quantity > 0)
      .map((b) => {
        const prod = (products || []).find((p) => p.id === b.product_id);
        return {
          productId: b.product_id, productName: prod?.name || b.product_id, category: prod?.category || '',
          qty: b.quantity, sellingPrice: prod?.sellingPrice || 0, value: b.quantity * (prod?.sellingPrice || 0), isLow: b.quantity < LOW_UNITS,
        };
      })
      .sort((a, b) => b.qty - a.qty)
    : [];
  const maxQty = Math.max(...rows.map((x) => x.qty), 1);
  return {
    vehicle: v,
    rows: rows.map((r) => ({ ...r, pct: Math.min(100, (r.qty / maxQty) * 100) })),
    totalUnits: rows.reduce((s, b) => s + b.qty, 0),
    totalValue: rows.reduce((s, b) => s + b.value, 0),
    lowItems: rows.filter((b) => b.isLow).length,
    inTrip: (activeRoutes || []).some((r) => vehicleIdOf(r) === v.id),
  };
});

export const fleetStockFigures = (data) => ({
  units: data.reduce((s, d) => s + d.totalUnits, 0),
  value: data.reduce((s, d) => s + d.totalValue, 0),
  withStock: data.filter((d) => d.totalUnits > 0).length,
  vehicles: data.length,
  low: data.reduce((s, d) => s + d.lowItems, 0),
});

/** Products with warehouse stock, A-Z: the load list (as before). */
export const warehouseItems = (products, locations, balances) => {
  const wh = (locations || []).find((l) => l.type === 'WAREHOUSE');
  if (!wh) return [];
  return (products || [])
    .map((p) => {
      const bal = (balances || []).find((b) => b.product_id === p.id && b.location_id === wh.id);
      return { productId: p.id, productName: p.name, available: Number(bal?.quantity || 0) };
    })
    .filter((p) => p.available > 0)
    .sort((a, b) => a.productName.localeCompare(b.productName));
};

/** Products on a van, A-Z: the unload list (as before). */
export const vanUnloadItems = (vehicleId, locations, balances, products) => {
  const loc = vehicleLocOf(locations, vehicleId);
  if (!loc) return [];
  return (balances || [])
    .filter((b) => b.location_id === loc.id && Number(b.quantity) > 0)
    .map((b) => {
      const p = (products || []).find((pr) => pr.id === b.product_id);
      return { productId: b.product_id, productName: p?.name || b.product_id, available: Number(b.quantity) };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
};

/** units on the van now, by product id (for End trip and the results screen). */
export const vanQtyMap = (vehicleId, locations, balances) => {
  const loc = vehicleLocOf(locations, vehicleId);
  const m = {};
  if (loc) (balances || []).filter((b) => b.location_id === loc.id).forEach((b) => { m[b.product_id] = Number(b.quantity) || 0; });
  return m;
};

/** units in the (first) warehouse by product id. */
export const warehouseQtyMap = (locations, balances) => {
  const wh = (locations || []).find((l) => l.type === 'WAREHOUSE');
  const m = {};
  if (wh) (balances || []).filter((b) => b.location_id === wh.id).forEach((b) => { m[b.product_id] = Number(b.quantity) || 0; });
  return m;
};

// ── Figures ──────────────────────────────────────────────────────────────────
/** "3 active · 1 in maintenance" */
export const statusSummary = (vehicles) => {
  const counts = {};
  (vehicles || []).forEach((v) => { const k = STATUS[v.status] ? v.status : 'ACTIVE'; counts[k] = (counts[k] || 0) + 1; });
  return VEHICLE_STATUSES.filter((k) => counts[k]).map((k) => `${counts[k]} ${STATUS[k].few}`).join(' · ');
};

/** "1 overdue, 1 this week" */
export const serviceSummary = (vehicles, today) => {
  let overdue = 0; let soon = 0;
  (vehicles || []).forEach((v) => { const s = serviceStatus(v.nextServiceDate, today); if (s === 'overdue') overdue++; else if (s === 'soon') soon++; });
  if (!overdue && !soon) return 'nothing due';
  return [overdue && `${overdue} overdue`, soon && `${soon} this week`].filter(Boolean).join(', ');
};

/** "Van 1 · Ravi Kumar", "+ 1 more" when more trips are out. */
export const onRoadSummary = (activeRoutes, vehicles, driverName) => {
  if (!activeRoutes.length) return 'no trips out';
  const r = activeRoutes[0];
  const v = (vehicles || []).find((x) => x.id === vehicleIdOf(r));
  const first = `${v?.name || 'Vehicle'} · ${driverName(driverIdOf(r))}`;
  return activeRoutes.length > 1 ? `${first} + ${activeRoutes.length - 1} more` : first;
};

/** A vehicle can be deleted when it is not on a trip and has nothing on board. */
export const deleteBlock = (vehicle, activeRoutes, unitsOnBoard) => {
  if ((activeRoutes || []).some((r) => vehicleIdOf(r) === vehicle?.id)) return 'It is on a trip. End the trip first.';
  if (Number(unitsOnBoard) > 0) return 'It still has stock on board. Unload it first.';
  return null;
};

export const recentTripsFor = (vehicleId, pastRoutes, n = 5) => (pastRoutes || []).filter((r) => vehicleIdOf(r) === vehicleId).slice(0, n);

// ── Dispatch ─────────────────────────────────────────────────────────────────
/** The first reason dispatch must not go, or null (same checks and words as before). */
export const dispatchProblem = (form, selectedIds, vanStock) => {
  if (!form.vehicleId) return { field: 'vehicle', message: 'Select a vehicle.' };
  if (!form.driverId) return { field: 'driver', message: 'Select a driver.' };
  if (selectedIds.length === 0 && vanStock.length === 0) return { field: null, message: 'Select at least 1 delivery, or load the van first.' };
  return null;
};

/** What dispatchRoute is sent: unchanged from the old page. */
export const dispatchPayload = (form, selectedIds, deliveryInvoices, vanStock) => ({
  vehicleId: form.vehicleId,
  driverId: form.driverId,
  location: form.location || 'Route',
  initialOdometer: 0,
  targetAmount: selectedTotal(selectedIds, deliveryInvoices),
  assignedOrders: selectedIds,
  loadedStock: vanStock.map((i) => ({ productId: i.productId, quantity: i.qty, sellingPrice: i.sellingPrice, costPrice: i.costPrice })),
});

// ── End trip ─────────────────────────────────────────────────────────────────
export const loadedOf = (route) => route?.loadedStock || route?.loaded_stock || [];

/** Returned stock sent to reconcileRoute: capped to what was loaded, zeros dropped (as before). */
export const returnedStockOf = (loaded, returnedMap) => loaded
  .map((item) => ({
    productId: item.productId,
    quantity: Math.max(0, Math.min(item.quantity, parseInt(returnedMap[item.productId] || 0, 10) || 0)),
  }))
  .filter((item) => item.quantity > 0);

// ── Load / unload results ────────────────────────────────────────────────────
/**
 * Per-line outcome of loadVan / unloadVan, which return
 * { success, errors: ['Deduct error (<productId>): <reason>', ...] }.
 *
 * A line named in an error did not move. An error that names no product
 * (no warehouse, no van location) stopped every line. A dropped connection
 * proves nothing either way, so such a line is 'unconfirmed', never 'failed'.
 *
 *   status: 'moved' | 'failed' | 'unconfirmed'
 */
export const transferOutcome = (items, result) => {
  const errors = (result?.errors || []).map(String);
  const general = [];
  const byProduct = {};
  errors.forEach((e) => {
    const m = /^(?:Deduct|Add) error \(([^)]+)\):\s*(.*)$/s.exec(e);
    if (m) (byProduct[m[1]] = byProduct[m[1]] || []).push(m[2]);
    else general.push(e);
  });
  const stopped = result?.success === false && general.length > 0 && Object.keys(byProduct).length === 0;
  const lines = items.map((it) => {
    const reasons = byProduct[it.productId] || (stopped ? general : null);
    if (!reasons) return { ...it, status: 'moved', reason: '' };
    const reason = reasons.join(' · ');
    return { ...it, status: reasons.some((r) => isTransportFailure(r)) ? 'unconfirmed' : 'failed', reason };
  });
  const moved = lines.filter((l) => l.status === 'moved');
  return {
    lines,
    general: stopped ? [] : general,
    movedCount: moved.length,
    movedUnits: moved.reduce((s, l) => s + (Number(l.quantity) || 0), 0),
    failed: lines.filter((l) => l.status === 'failed'),
    unconfirmed: lines.filter((l) => l.status === 'unconfirmed'),
  };
};

/** A failed load line tried again with what is there now (never more than asked). */
export const retryItems = (failed, availableNow) => failed
  .map((l) => ({ productId: l.productId, name: l.name, quantity: Math.min(Number(l.quantity) || 0, Number(availableNow[l.productId]) || 0), asked: l.quantity }))
  .filter((l) => l.quantity > 0);

// ── Little words ─────────────────────────────────────────────────────────────
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const initials2 = (name) => String(name || '?').trim().slice(0, 2);
export const PAY_LABEL = { CASH: 'Cash', UPI: 'UPI', CREDIT: 'Client credit', CARD: 'Card' };
