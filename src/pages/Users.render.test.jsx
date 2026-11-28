import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Smoke test: the Users page renders its states with the data hooks stubbed.
 * The rules are tested in lib/usersView.
 */
const state = {};
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: state.me, hasPermission: (p) => state.perms.includes(p) }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', currentTenant: { plan: 'PRO' }, businessProfile: { name: 'Test Shop' } }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => state.people }));

globalThis.React = React;
const { default: Users } = await import('./Users.jsx');

const people = (users) => ({ users, loading: false, addUser() {}, updateUser() {}, deleteUser() {}, refetch() {} });
const html = () => renderToStaticMarkup(<Users />);

describe('Users page', () => {
  beforeEach(() => {
    state.me = { id: 'u1', roles: ['OWNER'] };
    state.perms = ['MANAGE_USERS'];
    state.people = people([
      { id: 'u1', name: 'Owner Person', email: 'o@x.test', roles: ['OWNER'], status: 'ACTIVE' },
      { id: 'u2', name: 'Counter Person', email: 'c@x.test', roles: ['SALES'], status: 'ACTIVE' },
      { id: 'u3', name: 'Away Person', email: 'a@x.test', roles: ['CUSTOM'], status: 'INACTIVE', permissions: { expenses: { view: true, edit: true } } },
      { id: 'g1', name: 'Platform', email: 'p@x.test', roles: ['GLOBAL_ADMIN'], status: 'ACTIVE' },
    ]);
  });

  it('lists logins with role, what they open, status and actions', () => {
    const out = html();
    expect(out).toContain('Users &amp; roles');
    expect(out).toContain('Add login');
    expect(out).toContain('Counter Person');
    expect(out).toContain('Sales, Clients, Day Book');
    expect(out).toContain('Deactivate');
    expect(out).toContain('Activate');
    expect(out).toContain('Remove Counter Person');
    expect(out).not.toContain('Remove Owner Person');
    expect(out).not.toContain('Platform');               // hidden from a shop login
    expect(out).toContain('2 active logins of 5 on Pro');
  });

  it('shows the empty state when only you are here', () => {
    state.people = people([{ id: 'u1', name: 'Owner Person', email: 'o@x.test', roles: ['OWNER'], status: 'ACTIVE' }]);
    expect(html()).toContain('No other logins yet');
  });

  it('turns away a login without the permission, with no add button', () => {
    state.perms = [];
    const out = html();
    expect(out).toContain('Only the owner and admins manage logins');
    expect(out).not.toContain('Add login');
    expect(out).not.toContain('Counter Person');
  });
});
