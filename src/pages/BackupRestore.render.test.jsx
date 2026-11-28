import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the Backup and restore page renders for an owner and refuses
 * everyone else. No call reaches a database: supabase is a stub that throws
 * if anything is called during render.
 */
const state = {};
const nope = () => { throw new Error('no server calls in this test'); };
vi.mock('../lib/supabase', () => ({ supabase: { rpc: nope, functions: { invoke: nope }, from: nope } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isOwner: state.owner }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', currentTenant: { name: 'Sample Shop' } }) }));
vi.mock('../context/NotificationContext', () => ({ useNotifications: () => ({ addNotification() {} }) }));

globalThis.React = React;
const { default: BackupRestore } = await import('./BackupRestore.jsx');

const html = () => renderToStaticMarkup(<MemoryRouter initialEntries={['/backup']}><BackupRestore /></MemoryRouter>);

describe('Backup and restore page', () => {
  beforeEach(() => { state.owner = true; });

  it('shows the three cards to the owner', () => {
    const out = html();
    expect(out).toContain('Backup &amp; restore');
    expect(out).toContain('Take a backup');
    expect(out).toContain('Download backup');
    expect(out).toContain('Google Drive');
    expect(out).toContain('Check or restore a backup');
    expect(out).toContain('Choose backup file');
    expect(out).toContain('data-testid="backup-file"');
    // Nothing to restore yet, so no confirm field and no restore button.
    expect(out).not.toContain('restore-confirm');
    expect(out).not.toContain('Restore this backup');
  });

  it('refuses anyone but the owner', () => {
    state.owner = false;
    const out = html();
    expect(out).toContain('Only the owner can take or restore a backup');
    expect(out).toContain('Go back');
    expect(out).not.toContain('Download backup');
    expect(out).not.toContain('backup-file');
  });
});
