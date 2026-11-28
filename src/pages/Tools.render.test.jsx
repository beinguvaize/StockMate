import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke tests: Labels, Bulk add (every caller) and Data tools render in the
 * redesign look with their data stubbed. No network.
 */
const state = { owner: true };
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, restInsert: async () => ({ error: null }), restRpc: async () => ({ error: null }) }));
vi.mock('../context/TenantContext', () => ({ useTenant: () => ({ currentTenantId: 't1', currentTenant: { name: 'Sample Shop' }, businessProfile: { name: 'Sample Shop' } }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isOwner: state.owner }) }));
vi.mock('../hooks/useInventory', () => ({ useInventory: () => ({ products: [{ id: 'p1' }, { id: 'p2' }] }) }));
vi.mock('../hooks/usePeople', () => ({ usePeople: () => ({ clients: [{ id: 'c1', name: 'Client' }] }) }));
vi.mock('../hooks/useSales', () => ({ useSales: () => ({ sales: [] }) }));
vi.mock('../hooks/useFinance', () => ({ useFinance: () => ({ expenses: [] }) }));
vi.mock('../hooks/usePayroll', () => ({ usePayroll: () => ({ employees: [] }) }));
vi.mock('../hooks/usePurchases', () => ({ usePurchases: () => ({ purchases: [], suppliers: [] }) }));
vi.mock('../hooks/useNotifications', () => ({ useNotifications: () => ({ addNotification() {} }) }));

globalThis.React = React;
const { default: BulkAdd } = await import('./BulkAdd.jsx');
const { default: LabelPrinting } = await import('./LabelPrinting.jsx');
const { default: DataToolsPage } = await import('./DataToolsPage.jsx');

const at = (url, el) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{el}</MemoryRouter>);

describe('Bulk add', () => {
  it.each([
    ['products', 'Bulk add products', ['Product name', 'Selling price', 'Cost price', 'Opening stock', 'GST %', 'HSN', 'Barcode']],
    ['clients', 'Bulk add clients', ['Client name', 'Mobile number', 'GSTIN', 'Type (B2B/B2C)', 'Credit days']],
    ['suppliers', 'Bulk add suppliers', ['Supplier name', 'Contact person', 'GSTIN', 'Address']],
  ])('opens for %s with its own columns', (type, title, cols) => {
    const out = at(`/bulk-add?type=${type}`, <BulkAdd />);
    expect(out).toContain(title);
    for (const c of cols) expect(out).toContain(c);
    expect(out).toContain('+ 10 more rows');
    expect(out).toContain('20 empty rows to start');
    // Nothing typed yet: the add button is asleep.
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Add (products|clients|suppliers)<\/button>/);
  });

  it('falls back to clients for an unknown type, as before', () => {
    expect(at('/bulk-add?type=nope', <BulkAdd />)).toContain('Bulk add clients');
  });
});

describe('Labels', () => {
  it('renders the picker, template card and an empty preview', () => {
    const out = at('/labels', <LabelPrinting />);
    expect(out).toContain('Barcode and labels');
    expect(out).toContain('Search name, SKU or barcode');
    expect(out).toContain('38 × 25 mm · thermal roll, 2 across');
    expect(out).toContain('A4 sheet · 65 labels (38.1 × 21.2 mm)');
    expect(out).toContain('Shop name');
    expect(out).toContain('Saved on this computer only');
    expect(out).toContain('Pick products on the left to preview labels.');
    expect(out).toMatch(/disabled=""[^>]*>.*Print<\/button>/);
  });
});

describe('Data tools', () => {
  it('shows export with counts, and the owner tabs', () => {
    state.owner = true;
    const out = at('/data-tools', <DataToolsPage />);
    expect(out).toContain('Bring your data in, or take it out');
    expect(out).toContain('>Bulk import (Excel)</button>');
    expect(out).toContain('>Export to Tally</button>');
    expect(out).toContain('What to export');
    expect(out).toContain('Records ready');
    expect(out).toContain('Export 2 products');
    expect(out).not.toContain('show for the shop owner only');
  });

  it('hides import and Tally from a non-owner, and says so', () => {
    state.owner = false;
    const out = at('/data-tools', <DataToolsPage />);
    expect(out).not.toContain('>Bulk import (Excel)</button>');
    expect(out).not.toContain('>Export to Tally</button>');
    expect(out).toContain('show for the shop owner only');
    state.owner = true;
  });
});
