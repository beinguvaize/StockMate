import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/** Smoke tests for the Settings panels (approved settings-01 to 19). */
let perms = true;
let owner = true;
let plan = 'PRO';

vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: {} }) } }, uploadProductImage: async () => ({}) }));
vi.mock('../../lib/askClient', () => ({ callAsk: async () => ({}), setAskEnabled: async () => ({}) }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { name: 'Test Owner', email: 'owner@example.test', roles: ['OWNER'] },
    logout: () => {}, isOwner: owner, hasPermission: () => perms,
  }),
}));
vi.mock('../../context/TenantContext', () => ({
  useTenant: () => ({
    currentTenantId: 'T1',
    currentTenant: { id: 'T1', name: 'Test Shop', plan, status: 'ACTIVE', api_key: plan === 'ENTERPRISE' ? 'demo_key_abcdef0123456789abcdef0123456789' : '' },
    businessProfile: { name: 'Test Shop', pan_no: 'ABCDE1234F', account_no: '123456784821', tax_mode: 'INCLUSIVE', country: 'India', currency: 'INR' },
    updateBusinessProfile: async () => ({ success: true }),
    updateTenant: async () => ({ success: true }),
    businessType: 'RETAIL', tenantModules: {}, isModuleAllowed: () => true,
  }),
}));
vi.mock('../../hooks/useFinance', () => ({
  useFinance: () => ({ expenseCategories: ['Rent', 'Other'], customCategories: [], expenses: [], addExpenseCategory: async () => ({}), deleteExpenseCategory: async () => ({}) }),
}));
vi.mock('../../hooks/useInventory', () => ({
  useInventory: () => ({
    products: [{ category: 'Snacks' }, { category: 'Snacks' }, { category: 'Frozen' }],
    productCategories: [{ id: 'c1', name: 'Snacks' }],
    inventoryLocations: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Main store' }, { id: 'l2', name: 'Godown', address: 'Plot 7' }],
  }),
}));
vi.mock('../../hooks/usePlanLimits', () => ({ usePlanLimits: () => ({ userCount: 4, maxUsers: 5, loading: false }) }));
vi.mock('../Users', () => ({ default: () => <div>Users page</div> }));
vi.mock('../../components/invoice/POSReceipt', () => ({ default: () => <div>Receipt preview</div> }));

globalThis.React = React;
const { default: AccountPanel } = await import('./AccountPanel.jsx');
const { default: BusinessPanel } = await import('./BusinessPanel.jsx');
const { default: ModulesPanel } = await import('./ModulesPanel.jsx');
const { default: CategoriesPanel } = await import('./CategoriesPanel.jsx');
const { default: LocationsPanel } = await import('./LocationsPanel.jsx');
const { default: PrintPanel } = await import('./PrintPanel.jsx');
const { default: PlanPanel } = await import('./PlanPanel.jsx');
const { default: DataPanel } = await import('./DataPanel.jsx');
const { default: ApiPanel } = await import('./ApiPanel.jsx');
const { SupportPanel } = await import('./SupportPanel.jsx');
const { default: SettingsHub } = await import('./SettingsHub.jsx');

const html = (el) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const has = (el, list) => { const t = text(html(el)); for (const s of list) expect(t).toContain(s); return t; };

describe('Settings panels render', () => {
  it('hub: the rail, with Backup & restore as a link', () => {
    perms = true;
    const h = html(<SettingsHub />);
    for (const s of ['Account', 'Business', 'Business type &amp; modules', 'Categories', 'Locations', 'Printing', 'Payment reminders',
      'Users &amp; roles', 'Plan &amp; billing', 'Data tools', 'Backup &amp; restore', 'API', 'Help &amp; support']) expect(h).toContain(s);
    expect(h).toContain('href="/backup"');
  });
  it('account', () => has(<AccountPanel />, ['Profile', 'Test Owner', 'Password', 'Update password', 'WhatsApp sign-in', 'Not set, password sign-in only', 'Log out']));
  it('business: PAN and account number masked', () => {
    const h = html(<BusinessPanel />);
    expect(h).toContain('••••••234F');
    expect(h).toContain('•••• •••• 4821');
    expect(h).not.toContain('ABCDE1234F');
    expect(h).not.toContain('123456784821');
    has(<BusinessPanel />, ['Business details', 'Tax and compliance', 'Tax inclusive', 'E-invoice (IRN)', 'Stock control', 'Banking and payments', 'Country and currency', 'Save settings']);
  });
  it('modules', () => has(<ModulesPanel />, ['Business type', 'Modules', 'Reset to defaults', 'Save changes']));
  it('categories: counts and the unmanaged note', () => has(<CategoriesPanel />, ['Expense categories', 'Rent', 'Product categories', 'Snacks', '2 products', 'in use but not managed', 'Frozen', 'Import all']));
  it('locations on Pro: main pinned, others editable', () => has(<LocationsPanel />, ['Branches and locations', 'Main store', 'Main', 'Godown', 'Plot 7', 'Add']));
  it('locations below Pro: locked with Upgrade', () => {
    plan = 'GROWTH';
    has(<LocationsPanel />, ['Multi-branch stock needs the Pro plan or higher', 'Upgrade']);
    plan = 'PRO';
  });
  it('printing', () => has(<PrintPanel />, ['Receipt printer', 'Copies per receipt', 'Auto-print', 'A4 invoice', 'Customise invoice', 'Thermal receipt design', 'Receipt preview', 'Field labels', 'Save design and text', 'Open labels']));
  it('plan: logins used and the plan cards', () => has(<PlanPanel />, ['Current plan', 'Logins used', '4 of 5', 'Free', 'Growth', 'Pro', 'Enterprise', 'Current', 'Contact us']));
  it('data tools', () => has(<DataPanel />, ['Export data', 'Bulk import from Excel', 'Export to Tally', 'Open data tools', 'Backup and restore']));
  it('api on Enterprise: masked key, Show, Regenerate', () => {
    plan = 'ENTERPRISE';
    const h = html(<ApiPanel />);
    expect(h).not.toContain('abcdef0123456789');
    has(<ApiPanel />, ['API access', 'Show', 'Regenerate key']);
    plan = 'PRO';
  });
  it('api below Enterprise', () => has(<ApiPanel />, ['API access needs the Enterprise plan', 'Upgrade']));
  it('help', () => has(<SupportPanel />, ['Send email', 'Open chat', 'Report a bug', 'Sync diagnostics']));
});
