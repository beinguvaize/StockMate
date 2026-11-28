import { describe, it, expect } from 'vitest';
import {
  groupOf, replacedGroups, restoreSteps, splitLead, fmtSize, pickedLine, pctOf,
} from './backupView';
import { inspectBackup } from './backupFile';

describe('groupOf', () => {
  it('puts each table under the group a person would look for', () => {
    expect(groupOf('sales')).toBe('sales');
    expect(groupOf('sale_items')).toBe('sales');
    expect(groupOf('sale_batch_consumption')).toBe('sales');
    expect(groupOf('client_payments')).toBe('payments');
    expect(groupOf('supplier_payments')).toBe('payments');
    expect(groupOf('invoices')).toBe('invoices');
    expect(groupOf('invoice_counters')).toBe('invoices');
    expect(groupOf('purchase_returns')).toBe('purchases');
    expect(groupOf('recurring_expense_templates')).toBe('expenses');
    expect(groupOf('payroll_runs')).toBe('payroll');
    expect(groupOf('gl_lines')).toBe('ledger');
    expect(groupOf('accounts')).toBe('ledger');
    expect(groupOf('product_batches')).toBe('stock');
    expect(groupOf('vehicle_stock_movements')).toBe('stock');
    expect(groupOf('clients')).toBe('parties');
    expect(groupOf('suppliers')).toBe('parties');
    expect(groupOf('appointments')).toBeNull();
  });
});

describe('replacedGroups', () => {
  const parsed = {
    tables: {
      sales: [{ id: 1 }, { id: 2 }], sale_items: [{ id: 3 }], clients: [{ id: 4 }],
      appointments: [], banners: [{ id: 5 }], e_invoice_irn: [{ id: 6 }],
    },
    counts: { sales: 2, sale_items: 1, clients: 1, appointments: 0, banners: 1, e_invoice_irn: 1 },
    manifest: [{ table: 'e_invoice_irn', mode: 'PRESERVE' }, { table: 'sales', mode: 'RESTORE' }],
  };

  it('sums rows per group in display order, others last', () => {
    const r = replacedGroups(parsed);
    expect(r.groups).toEqual([
      { key: 'sales', label: 'Sales and sale lines', rows: 3 },
      { key: 'parties', label: 'Clients and suppliers', rows: 1 },
      { key: 'other', label: '2 other tables', rows: 1 },
    ]);
  });

  it('leaves out tables the server keeps as they are', () => {
    const r = replacedGroups(parsed);
    expect(r.totalTables).toBe(5);
    expect(r.totalRows).toBe(5);
    expect(r.groups.some((g) => g.key === 'invoices')).toBe(false);
  });

  it('falls back to the table length when counts are absent', () => {
    expect(replacedGroups({ tables: { sales: [{}, {}, {}] } }).totalRows).toBe(3);
  });

  it('singular for one other table', () => {
    expect(replacedGroups({ tables: { banners: [] } }).groups[0].label).toBe('1 other table');
  });
});

describe('restoreSteps', () => {
  it('marks the upload step current while uploading', () => {
    const s = restoreSteps('upload', 38);
    expect(s.map((x) => x.state)).toEqual(['done', 'now', 'todo', 'todo']);
    expect(s[1].label).toBe('Uploading the file to the server, in 38 parts');
  });
  it('marks the restore step current while applying', () => {
    expect(restoreSteps('apply', 1).map((x) => x.state)).toEqual(['done', 'done', 'now', 'todo']);
    expect(restoreSteps('apply', 1)[1].label).toContain('in 1 part');
  });
});

describe('splitLead', () => {
  it('bolds the lead of every message inspectBackup gives', () => {
    expect(splitLead('This backup belongs to a different shop (Other). A backup can only be restored into the shop it came from.'))
      .toEqual({ lead: 'This backup belongs to a different shop', rest: ' (Other). A backup can only be restored into the shop it came from.' });
    expect(splitLead('The file is missing 3 tables (a, b, c).').lead).toBe('The file is missing 3 tables');
    expect(splitLead('The file is damaged or was edited after it was made.')).toEqual({ lead: 'The file is damaged or was edited after it was made.', rest: '' });
    const old = inspectBackup({ format: 1 }).errors[0];
    expect(splitLead(old).lead).toMatch(/cannot be restored safely\.$/);
    expect(splitLead(old).lead + splitLead(old).rest).toBe(old);
  });
});

describe('formatting', () => {
  it('sizes', () => {
    expect(fmtSize(4.1 * 1048576)).toBe('4.1 MB');
    expect(fmtSize(300)).toBe('1 KB');
  });
  it('picked file line', () => {
    expect(pickedLine({ size: 2048, source: 'file', parsed: { format: 2 } })).toBe('2 KB · picked from this computer');
    expect(pickedLine({ source: 'drive', parsed: { format: 2 } })).toBe('from Google Drive');
    expect(pickedLine({ size: 2048, parsed: { format: 1, takenAt: '2026-08-02T04:45:00Z' } })).toBe('2 KB · format 1, made 2 Aug 2026');
  });
  it('percent is clamped', () => {
    expect(pctOf(0.394)).toBe(39);
    expect(pctOf(2)).toBe(100);
    expect(pctOf(NaN)).toBe(0);
  });
});
