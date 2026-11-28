import { describe, it, expect } from 'vitest';
import {
  REPORT_CATALOGUE, REPORT_GROUPS, visibleReports, groupReports, groupChips, groupLabel,
  matchReports, searchCatalogue, findReport, loadError, kpiDisplay, formatCompact,
  filterRows, sortRows, nextSort, pageRows, pageCount, recordsLine,
} from './reportsView';

const fc = (v) => `₹${v}`;

describe('report catalogue', () => {
  it('keeps every report the hub had: 22 operations, 9 accounting, 4 GST', () => {
    const g = groupReports(REPORT_CATALOGUE);
    expect(REPORT_CATALOGUE).toHaveLength(35);
    expect(g.OPERATIONAL).toHaveLength(22);
    expect(g.ACCOUNTING).toHaveLength(9);
    expect(g.COMPLIANCE).toHaveLength(4);
  });

  it('has unique ids, a group, a permission and a card line on each', () => {
    const ids = new Set(REPORT_CATALOGUE.map((r) => r.id));
    expect(ids.size).toBe(REPORT_CATALOGUE.length);
    const groups = REPORT_GROUPS.map((g) => g.key);
    REPORT_CATALOGUE.forEach((r) => {
      expect(groups).toContain(r.group);
      expect(r.permission).toBeTruthy();
      expect(r.blurb).toBeTruthy();
    });
  });

  it('keeps the permission each report needed before', () => {
    const p = Object.fromEntries(REPORT_CATALOGUE.map((r) => [r.id, r.permission]));
    expect(p.BUSINESS).toBe('sales');
    expect(p.EXPENSES).toBe('expenses');
    expect(p.AR_AGING).toBe('clients');
    expect(p.AP_AGING).toBe('inventory');
    expect(p.PURCHASES).toBe('purchases');
    expect(p.GSTR3B).toBe('reports');
  });
});

describe('permissions and groups', () => {
  const only = (...perms) => (perm, action) => action === 'view' && perms.includes(perm);

  it('shows only the reports the person may view', () => {
    const v = visibleReports(only('sales'));
    expect(v.every((r) => r.permission === 'sales')).toBe(true);
    expect(v.map((r) => r.id)).toContain('BUSINESS');
  });

  it('drops a group chip that has no report, and counts the rest', () => {
    const chips = groupChips(groupReports(visibleReports(only('sales'))));
    expect(chips.map((c) => c.key)).toEqual(['OPERATIONAL']);
    expect(chips[0].count).toBe(6);
    expect(chips[0].label).toBe('Operations');
  });

  it('names the groups as the chips do', () => {
    expect(groupLabel('COMPLIANCE')).toBe('GST');
    expect(groupLabel('NOPE')).toBe('');
  });

  it('resolves a ?tab= link only to an allowed report', () => {
    const v = visibleReports(only('sales'));
    expect(findReport(v, 'DAILY_SALES')?.label).toBe('Daily Sales');
    expect(findReport(v, 'BALANCE_SHEET')).toBeNull();
    expect(findReport(v, null)).toBeNull();
  });
});

describe('report search', () => {
  it('the picker matches the label in any case, as before', () => {
    const ops = groupReports(REPORT_CATALOGUE).OPERATIONAL;
    expect(matchReports(ops, 'PROFIT').map((r) => r.id)).toEqual(['BILL_PROFIT', 'PARTY_PROFIT', 'CATEGORY_PROFIT']);
    expect(matchReports(ops, 'gstr 9')).toEqual([]);
    expect(matchReports(ops, '')).toHaveLength(22);
  });

  it('the home search also matches the card line', () => {
    expect(searchCatalogue(REPORT_CATALOGUE, 'reorder').map((r) => r.id)).toEqual(['LOW_STOCK']);
    expect(searchCatalogue(REPORT_CATALOGUE, '  ')).toHaveLength(35);
  });
});

describe('loadError', () => {
  it('is null when nothing failed', () => {
    expect(loadError(null, undefined, '')).toBeNull();
    expect(loadError()).toBeNull();
  });
  it('returns the first message from strings, errors or arrays of them', () => {
    expect(loadError(null, 'timed out', 'later')).toBe('timed out');
    expect(loadError(new Error('boom'))).toBe('boom');
    expect(loadError([null, { message: 'permission denied' }])).toBe('permission denied');
    expect(loadError({})).toBe('Could not load this report');
  });
});

describe('KPI figures (unchanged from the old card)', () => {
  it('compacts money labels into lakh and crore', () => {
    expect(kpiDisplay('Total Revenue', 396860, fc)).toBe('₹3.97L');
    expect(kpiDisplay('Stock Value', 25000000, fc)).toBe('₹2.50Cr');
    expect(kpiDisplay('Outstanding', 19420, fc)).toBe('₹19420');
    // A label the money pattern misses is shown as a plain count, as before.
    expect(kpiDisplay('Total Tax Liability', 19420, fc)).toBe('19,420');
  });
  it('groups counts the Indian way and leaves strings alone', () => {
    expect(kpiDisplay('Invoices', 1946, fc)).toBe('1,946');
    expect(kpiDisplay('Blended Margin', '14.0%', fc)).toBe('14.0%');
    expect(formatCompact(99999, fc)).toBe('₹99999');
  });
});

describe('table helpers (moved from ReportTable)', () => {
  const rows = [
    { name: 'Tea 500 g', qty: 3 },
    { name: 'Salt 1 kg', qty: 10 },
    { name: 'Sugar 1 kg', qty: 1 },
  ];

  it('searches every cell, any case', () => {
    expect(filterRows(rows, 'KG').map((r) => r.name)).toEqual(['Salt 1 kg', 'Sugar 1 kg']);
    expect(filterRows(rows, '')).toBe(rows);
  });

  it('sorts without touching the input', () => {
    expect(sortRows(rows, 'qty', 'asc').map((r) => r.qty)).toEqual([1, 3, 10]);
    expect(sortRows(rows, 'qty', 'desc').map((r) => r.qty)).toEqual([10, 3, 1]);
    expect(sortRows(rows, '', null)).toBe(rows);
    expect(rows[0].qty).toBe(3);
  });

  it('cycles a head asc, desc, off; a new head starts asc', () => {
    expect(nextSort({ key: '', dir: 'asc' }, 'qty')).toEqual({ key: 'qty', dir: 'asc' });
    expect(nextSort({ key: 'qty', dir: 'asc' }, 'qty')).toEqual({ key: 'qty', dir: 'desc' });
    expect(nextSort({ key: 'qty', dir: 'desc' }, 'qty')).toEqual({ key: '', dir: null });
    expect(nextSort({ key: 'qty', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });

  it('pages and counts pages', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ i }));
    expect(pageRows(many, 1, 25)).toHaveLength(25);
    expect(pageRows(many, 3, 25)).toHaveLength(10);
    expect(pageCount(60, 25)).toBe(3);
    expect(pageCount(0, 25)).toBe(0);
  });

  it('writes the footer line', () => {
    expect(recordsLine(25, 1946)).toBe('25 of 1,946 records');
    expect(recordsLine(8, 214, 'transactions')).toBe('8 of 214 transactions');
  });
});
