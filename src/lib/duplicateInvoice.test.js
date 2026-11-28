import { describe, it, expect } from 'vitest';
import { duplicateInvoiceDraft, duplicateLines } from './duplicateInvoice';

const source = {
  id: 'inv-1', invoice_number: 'INV-0139', invoice_date: '2026-11-24', client_id: 'c1', client_name: 'Test Client',
  sale_id: 'SAL-1', notes: 'Deliver to the back door',
  paid_amount: 8000, payment_status: 'PARTIAL', eway_no: '341055218790', vehicle_no: 'KA01AB4521',
  irn: 'abc', irn_status: 'SUCCESS', ack_no: '1122', due_date: '2026-12-09',
  items: [
    { id: 'p1', name: 'Item one', hsn_code: '1101', quantity: 20, rate: 250, taxRate: 5 },
    { productId: 'p2', name: 'Item two', hsn: '15-12', qty: 24, price: 145, discountPercent: 2, taxRate: 5 },
  ],
};
const clients = [{ id: 'c1', name: 'Test Client', gstin: '29AAAAA0000A1Z5', state: 'Karnataka' }];

describe('duplicate invoice', () => {
  it('copies the client, items, prices, discounts, HSN, tax rates and notes', () => {
    const d = duplicateInvoiceDraft(source, clients);
    expect(d.party).toBe(clients[0]);
    expect(d.notes).toBe('Deliver to the back door');
    expect(d.lines.map(({ uid, ...l }) => l)).toEqual([
      { productId: 'p1', name: 'Item one', hsn: '1101', qty: 20, rate: 250, disc: 0, taxRate: 5 },
      { productId: 'p2', name: 'Item two', hsn: '1512', qty: 24, rate: 145, disc: 2, taxRate: 5 },
    ]);
  });

  it('never copies payments, e-Way bill, IRN, number or date', () => {
    const d = duplicateInvoiceDraft(source, clients);
    const all = JSON.stringify({ party: d.party, lines: d.lines, notes: d.notes });
    for (const v of ['8000', 'PARTIAL', '341055218790', 'KA01AB4521', 'abc', '1122', 'INV-0139', '2026-11-24', '2026-12-09', 'SAL-1']) {
      expect(all).not.toContain(v);
    }
    // The source is named only in the banner, never in what is saved.
    expect(d.source).toEqual({ id: 'inv-1', number: 'INV-0139', date: '2026-11-24', clientName: 'Test Client' });
  });

  it('a walk-in invoice leaves the client to be chosen', () => {
    const d = duplicateInvoiceDraft({ ...source, client_id: null, client_name: 'Walk-in' }, clients);
    expect(d.party).toBeNull();
    expect(d.source.clientName).toBe('Walk-in');
  });

  it('each line gets its own key and survives missing fields', () => {
    const lines = duplicateLines([{ name: 'Bare' }, { name: 'Bare' }]);
    expect(lines[0].uid).not.toBe(lines[1].uid);
    expect(lines[0]).toMatchObject({ qty: 1, rate: 0, disc: 0, taxRate: 0, hsn: '' });
    expect(duplicateLines(null)).toEqual([]);
  });
});
