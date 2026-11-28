import { describe, it, expect } from 'vitest';
import {
  maskTail, stableStringify, fieldsMatch, countByCategory, expensesInCategory,
  reminderLink, rupees0, businessFormFrom, withCountry, trialDaysLeft,
} from './settingsLib';
import { planLines } from '../PlanPanel';
import { tabFromSearch } from '../SettingsHub';

describe('maskTail', () => {
  it('keeps the last four only', () => {
    expect(maskTail('ABCDE1234F')).toBe('••••••234F');
    expect(maskTail('123456784821', 4, { group: true })).toBe('•••• •••• 4821');
  });
  it('never shows a short value and leaves empty empty', () => {
    expect(maskTail('')).toBe('');
    expect(maskTail(null)).toBe('');
    expect(maskTail('123')).toBe('•••');
  });
});

describe('fieldsMatch', () => {
  it('ignores key order, as a jsonb round trip reorders keys', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(fieldsMatch({ print_settings: { copies: 2, paper: '80' } }, { print_settings: { paper: '80', copies: 2 }, other: 1 })).toBe(true);
  });
  it('is false when a field differs or the row is missing', () => {
    expect(fieldsMatch({ name: 'A' }, { name: 'B' })).toBe(false);
    expect(fieldsMatch({ name: 'A' }, null)).toBe(false);
  });
  it('treats undefined as null', () => {
    expect(fieldsMatch({ api_key: undefined }, { api_key: null })).toBe(true);
  });
});

describe('category counts', () => {
  it('counts products per category, ignoring case and blanks', () => {
    const m = countByCategory([{ category: 'Snacks' }, { category: 'snacks ' }, { category: '' }, {}, { category: 'Dairy' }]);
    expect(m.get('snacks')).toBe(2);
    expect(m.get('dairy')).toBe(1);
    expect(m.size).toBe(2);
  });
  it('counts expenses under a name, skipping deleted ones', () => {
    expect(expensesInCategory([{ category: 'Rent' }, { category: 'Rent', deleted_at: 'x' }, { category: 'Salary' }], 'Rent')).toBe(1);
  });
});

describe('reminderLink', () => {
  it('adds 91 to a ten-digit number and fills in name and amount', () => {
    const url = reminderLink({ name: 'Test Client', phone: '98765 43210', outstanding_balance: 1200 }, 'Test Shop');
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Dear Test Client');
    expect(text).toContain('Test Shop');
    expect(text).toContain('₹1200.00');
  });
  it('leaves a number that already has a country code alone', () => {
    expect(reminderLink({ name: 'X', phone: '+91 98765 43210', outstanding_balance: 1 }, 'S')).toContain('wa.me/919876543210');
  });
});

describe('business form', () => {
  it('seeds with the same defaults as before', () => {
    const f = businessFormFrom(null);
    expect(f.currency).toBe('USD');
    expect(f.currencySymbol).toBe('$');
    expect(f.lowStockThreshold).toBe(20);
    expect(f.tax_mode).toBe('EXCLUSIVE');
    expect(f.auto_irn_enabled).toBe(false);
    expect(f.block_negative_stock).toBe(false);
  });
  it('keeps saved values, including false switches', () => {
    const f = businessFormFrom({ name: 'Shop', block_negative_stock: true, auto_irn_enabled: false, lowStockThreshold: 5 });
    expect(f.name).toBe('Shop');
    expect(f.block_negative_stock).toBe(true);
    expect(f.lowStockThreshold).toBe(5);
  });
  it('picking India sets rupees; another country keeps the currency', () => {
    expect(withCountry({ currency: 'USD', currencySymbol: '$' }, 'India')).toMatchObject({ country: 'India', currency: 'INR', currencySymbol: '₹' });
    expect(withCountry({ currency: 'INR', currencySymbol: '₹' }, 'Canada')).toMatchObject({ country: 'Canada', currency: 'INR' });
  });
});

describe('plan helpers', () => {
  it('trial days never go negative', () => {
    const now = Date.parse('2026-11-28T00:00:00Z');
    expect(trialDaysLeft('2026-12-21T00:00:00Z', now)).toBe(23);
    expect(trialDaysLeft('2026-11-01T00:00:00Z', now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBe(null);
  });
  it('plan lines read as words', () => {
    expect(planLines({ modules: [1, 2, 3], maxUsers: 1, maxInvoices: 100, features: [] })).toEqual(['3 modules', '1 user', '100 invoices a month']);
    expect(planLines({ modules: [], maxUsers: -1, maxInvoices: -1, features: ['api_access', 'gstr_export'] })).toEqual(['0 modules', 'Unlimited users', 'API access', 'GSTR export']);
  });
  it('rupees with Indian grouping', () => {
    expect(rupees0(47465)).toBe('₹47,465');
    expect(rupees0(1234567)).toBe('₹12,34,567');
  });
});

describe('tabFromSearch', () => {
  it('opens a known panel and falls back to Account', () => {
    expect(tabFromSearch('?tab=print')).toBe('print');
    expect(tabFromSearch('?tab=backup')).toBe('account');   // a link, not a panel
    expect(tabFromSearch('?tab=nope')).toBe('account');
    expect(tabFromSearch('')).toBe('account');
  });
});
