import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/** Smoke test: the Audit log page renders its first paint and its gate. */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, isSupabaseConfigured: false }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: state.me }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', currentTenant: {}, businessProfile: { name: 'Test Shop' } }) }));

globalThis.React = React;
const { default: AuditLog } = await import('./AuditLog.jsx');
const html = () => renderToStaticMarkup(<AuditLog />);

describe('Audit log page', () => {
  beforeEach(() => { state.me = { id: 'u1', roles: ['OWNER'] }; });

  it('opens with the strip, the tools and loading rows for an owner', () => {
    const out = html();
    expect(out).toContain('Owners only.');
    expect(out).toContain('Filters');
    expect(out).toContain('Refresh');
    expect(out).toContain('Money changes');
    expect(out).toContain('What happened');
  });

  it('turns away anyone who is not the owner', () => {
    state.me = { id: 'u2', roles: ['SALES'] };
    const out = html();
    expect(out).toContain('The audit log is for the owner');
    expect(out).not.toContain('Refresh');
  });
});
