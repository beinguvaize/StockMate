import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the Reports hub draws its trail, group chips and picker, and
 * keeps the permission filter. Figures belong to each report.
 */
const state = { perms: null };
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: [] }), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel() {} } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: (p) => !state.perms || state.perms.includes(p), currentUser: { id: 'u1' } }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', businessProfile: { currencySymbol: '₹', name: 'Sample Shop' }, currentTenant: {} }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));

globalThis.React = React;
const { default: Reports } = await import('./Reports.jsx');
const html = (url = '/reports') => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><Reports /></MemoryRouter>);

describe('Reports hub', () => {
  beforeEach(() => { state.perms = null; });

  it('opens on the Business Report with the trail, chips and picker', () => {
    const out = html();
    expect(out).toContain('Breadcrumb');
    expect(out).toContain('Business Report');
    expect(out).toContain('Operations');
    expect(out).toContain('Accounting');
    expect(out).toContain('GST');
    expect(out).toContain('All reports');
    expect(out).toMatch(/Operations<b[^>]*>22<\/b>/);
  });

  it('drops groups the person cannot see', () => {
    state.perms = ['sales'];
    const out = html();
    expect(out).toContain('Operations');
    expect(out).not.toContain('Accounting');
    expect(out).toMatch(/Operations<b[^>]*>6<\/b>/);
  });
});
