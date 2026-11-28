import { describe, it, expect } from 'vitest';
import { paymentsSummary, buildTimeline, creditTermsDays, collectedShare, NOT_STORED_EVENTS } from './invoiceDetail';

const money = (n) => `Rs ${Number(n).toFixed(2)}`;
const invoice = {
  id: 'INV-T1', invoice_number: 'INV-T1', sale_id: 'SAL-T1', grand_total: 2000, paid_amount: 1500,
  invoice_date: '2026-11-24', due_date: '2026-12-09', created_at: '2026-11-24T04:42:00Z',
  items: [{ name: 'A' }, { name: 'B' }],
};
const receipts = [
  { id: 'ATX-1', direction: 'IN', amount: 600, mode: 'CASH', date: '2026-11-24', created_at: '2026-11-24T06:10:00Z', note: 'Sale' },
  { id: 'ATX-2', direction: 'IN', amount: 400, mode: 'UPI', date: '2026-11-26', created_at: '2026-11-26T10:42:00Z', note: 'Collection on sale' },
];

describe('payments', () => {
  it('lists receipts newest first and counts them', () => {
    const p = paymentsSummary(receipts, invoice);
    expect(p.list.map((r) => r.id)).toEqual(['ATX-2', 'ATX-1']);
    expect(p.count).toBe(2);
    expect(p.received).toBe(1000);
    expect(p.last.id).toBe('ATX-2');
    expect(p.list[0].mode).toBe('UPI');
  });
  it('says how much of the paid amount has no receipt entry', () => {
    expect(paymentsSummary(receipts, invoice).recordedOnly).toBe(500);
    expect(paymentsSummary(receipts, { ...invoice, paid_amount: 1000 }).recordedOnly).toBe(0);
    expect(paymentsSummary([], { paid_amount: 0 }).recordedOnly).toBe(0);
  });
  it('a paid-back row counts against the received total', () => {
    const p = paymentsSummary([...receipts, { id: 'ATX-3', direction: 'OUT', amount: 100, mode: 'CASH', created_at: '2026-11-27T00:00:00Z' }], invoice);
    expect(p.received).toBe(900);
    expect(p.count).toBe(2);
  });
});

describe('activity', () => {
  it('only stored events, newest first', () => {
    const t = buildTimeline({
      invoice: { ...invoice, irn_status: 'SUCCESS', ack_no: '1122', ack_date: '2026-11-25T05:00:00Z' },
      payments: receipts,
      returns: [{ id: 'RET-1', total_amount: 250, reason: 'Credit note', created_at: '2026-11-27T05:00:00Z' }],
      money,
    });
    expect(t.map((e) => e.kind)).toEqual(['return', 'payment', 'irn', 'payment', 'created']);
    expect(t[t.length - 1]).toMatchObject({ title: 'Invoice created', detail: '2 items · Rs 2000.00' });
    expect(t[1]).toMatchObject({ title: 'Payment received · UPI', tone: 'g' });
  });
  it('no IRN event unless it succeeded', () => {
    const t = buildTimeline({ invoice: { ...invoice, irn_status: 'PENDING', ack_no: null }, payments: [], money });
    expect(t.map((e) => e.kind)).toEqual(['created']);
  });
  it('names what is not stored and so not shown', () => {
    expect(NOT_STORED_EVENTS).toContain('payment reminder sent');
    expect(NOT_STORED_EVENTS).toContain('shared on WhatsApp');
  });
});

describe('details', () => {
  it('credit terms are the days from invoice date to due date', () => {
    expect(creditTermsDays(invoice)).toBe(15);
    expect(creditTermsDays({ invoice_date: '2026-11-24' })).toBeNull();
  });
  it('collected share is paid over total, between 0 and 100', () => {
    expect(collectedShare(invoice)).toBe(75);
    expect(collectedShare({ grand_total: 0, paid_amount: 10 })).toBe(0);
    expect(collectedShare({ grand_total: 100, paid_amount: 150 })).toBe(100);
  });
});
