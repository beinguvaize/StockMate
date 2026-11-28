import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the Appointments and Kitchen pages render their states with
 * every data hook stubbed. The rules are tested in lib/appointmentView and
 * lib/kitchenView; this catches a broken page before a shopkeeper does.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, restRpc: async () => ({}) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { id: 'u1' }, hasPermission: () => true }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1' }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ products: [] }) }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => ({ clients: [], employees: [{ id: 's1', name: 'Staff One' }], addClient: async () => ({}) }) }));
vi.mock('../hooks/useAppointments', () => ({ useAppointments: () => state.appts }));
vi.mock('../hooks/useKOT', async (orig) => ({ ...(await orig()), useKDS: () => state.kds }));

globalThis.React = React;
const { default: Appointments } = await import('./Appointments.jsx');
const { default: KDS } = await import('./KDS.jsx');
const { shopInstant, shopToday } = await import('../lib/appointmentView');

const noop = async () => ({ error: null });
const appts = (over = {}) => ({ appointments: [], loading: false, error: null, refresh() {}, book: noop, update: noop, complete: noop, setStatus: noop, remove: noop, ...over });
const kds = (over = {}) => ({ tickets: [], loading: false, error: null, lastOkAt: Date.now(), refresh() {}, updateStatus: noop, ...over });
const render = (Page, path) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Page /></MemoryRouter>);

describe('Appointments page', () => {
  beforeEach(() => { state.appts = appts(); });

  it('shows today with its bookings, actions by status, and the legend', () => {
    const today = shopToday();
    state.appts = appts({ appointments: [
      { id: 'a', status: 'BOOKED', service_name: 'Service A', client_name: 'Client A', staff_id: 's1', start_at: shopInstant(today, '10:00').toISOString(), duration_min: 45, price: 350 },
      { id: 'b', status: 'COMPLETED', sale_id: 'APT-1', service_name: 'Service B', start_at: shopInstant(today, '11:30').toISOString(), duration_min: 30, price: 50 },
      { id: 'c', status: 'CANCELLED', service_name: 'Service C', start_at: shopInstant(today, '17:00').toISOString(), duration_min: 45, price: 350 },
    ] });
    const out = render(Appointments, '/s/appointments');
    expect(out).toContain('3 appointments in all');
    expect(out).toContain('3 bookings');
    expect(out).toContain('10:00');
    expect(out).toContain('Client A · Staff One');
    expect(out).toContain('Walk-in');
    expect(out).toContain('Billed');
    expect(out).toContain('Cancelled');
    expect(out.match(/Complete &amp; bill/g)).toHaveLength(1);
    expect(out.match(/aria-label="Delete"/g)).toHaveLength(3);
    expect(out).toContain('No-show');
    expect(out).toContain('Today');
  });

  it('an empty day invites a booking', () => {
    const out = render(Appointments, '/s/appointments');
    expect(out).toContain('0 appointments');
    expect(out).toContain('Nothing booked');
    expect(out).toContain('no bookings');
  });

  it('a failed read says so instead of pretending there are none', () => {
    state.appts = appts({ error: { message: 'permission denied for table appointments' } });
    const out = render(Appointments, '/s/appointments');
    expect(out).toContain("Couldn&#x27;t load appointments");
    expect(out).toContain('permission denied for table appointments');
  });
});

describe('Kitchen page', () => {
  beforeEach(() => { state.kds = kds(); });

  it('renders tickets oldest first with counts, stations and the bump button', () => {
    const old = new Date(Date.now() - 18 * 60000).toISOString();
    state.kds = kds({ tickets: [
      { id: 1, ticket_no: 36, table_label: '2', status: 'PREPARING', created_at: old, items: [{ name: 'Dish A', quantity: 2, food_type: 'VEG' }, { name: 'Drink B', quantity: 1, station: 'Beverages', notes: 'No sugar' }] },
      { id: 2, ticket_no: 37, status: 'NEW', created_at: new Date().toISOString(), items: [{ name: 'Dish C', quantity: 4 }] },
    ] });
    const out = render(KDS, '/s/kds');
    expect(out).toContain('2 active tickets');
    expect(out).toContain('New 1');
    expect(out).toContain('Preparing 1');
    expect(out).toContain('#36');
    expect(out).toContain('· T2');
    expect(out).toContain('18m');
    expect(out).toContain('Beverages');
    expect(out).toContain('↳ No sugar');
    expect(out).toContain('>Start<');
    expect(out).toContain('>Ready<');
    expect(out).toContain('Wall mode');
    expect(out).toContain('A ticket turns red after 15 minutes.');
  });

  it('empty board', () => {
    expect(render(KDS, '/s/kds')).toContain('No active tickets');
  });

  it('loading skeleton', () => {
    state.kds = kds({ loading: true, lastOkAt: null });
    expect(render(KDS, '/s/kds')).toContain('Loading kitchen…');
  });

  it('offline keeps the tickets, dims them and says they may be out of date', () => {
    state.kds = kds({ error: { message: 'TypeError: Failed to fetch' }, lastOkAt: Date.now() - 120000,
      tickets: [{ id: 1, ticket_no: 36, status: 'NEW', created_at: new Date().toISOString(), items: [] }] });
    const out = render(KDS, '/s/kds');
    expect(out).toContain('Not connected. These tickets may be out of date.');
    expect(out).toContain('Offline · last update 2 min ago');
    expect(out).toContain('opacity-60');
    expect(out).toContain('#36');
  });
});
