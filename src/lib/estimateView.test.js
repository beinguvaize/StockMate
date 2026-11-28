import { describe, it, expect } from 'vitest';
import {
  docTypeOf, docTypeLabel, statusOf, estimateActions, estimateFigures, typeCounts, statusCounts, filterEstimates,
  estimateDay, shortDay, longDay, validity, maskPhone, waDigits, whatsappText, estimateHandoff, lineAmount,
} from './estimateView';

const est = (id, more = {}) => ({ id, estimate_number: `EST-2026-${id}`, client_name: `Client ${id}`, grand_total: 1000, status: 'DRAFT', ...more });

describe('types and statuses', () => {
  it('a row with no doc_type is a quotation', () => {
    expect(docTypeOf({})).toBe('QUOTATION');
    expect(docTypeOf({ doc_type: 'PROFORMA' })).toBe('PROFORMA');
    expect(docTypeOf({ doc_type: 'SOMETHING' })).toBe('QUOTATION');
    expect(docTypeLabel({ doc_type: 'MANUAL_INVOICE' })).toBe('Manual bill');
    expect(docTypeLabel({ doc_type: 'DELIVERY_CHALLAN' })).toBe('Delivery challan');
  });
  it('CONVERTED reads Billed; unknown reads Draft', () => {
    expect(statusOf({ status: 'CONVERTED' }).label).toBe('Billed');
    expect(statusOf({ status: 'WHATEVER' }).key).toBe('DRAFT');
    expect(statusOf({}).key).toBe('DRAFT');
  });
});

describe('estimateActions: today\'s rules', () => {
  it('a draft can be sent, accepted, rejected, edited, converted', () => {
    expect(estimateActions({ status: 'DRAFT' })).toMatchObject({ convert: true, markSent: true, markAccepted: true, markRejected: true, edit: true, remove: true });
  });
  it('a sent one cannot be marked sent again', () => {
    expect(estimateActions({ status: 'SENT' })).toMatchObject({ markSent: false, markAccepted: true });
  });
  it('accepted: no accept again, can still be rejected', () => {
    expect(estimateActions({ status: 'ACCEPTED' })).toMatchObject({ markAccepted: false, markRejected: true, convert: true });
  });
  it('billed: no convert, edit or status change; delete and share stay', () => {
    expect(estimateActions({ status: 'CONVERTED' })).toMatchObject({ convert: false, edit: false, setStatus: false, share: true, remove: true, markRejected: false });
  });
});

describe('figures, counts and filters', () => {
  const rows = [
    est('1', { status: 'SENT', grand_total: 28038 }),
    est('2', { status: 'DRAFT', grand_total: 12284 }),
    est('3', { grand_total: 6840, doc_type: 'DELIVERY_CHALLAN', status: undefined }),
    est('4', { status: 'ACCEPTED', grand_total: 41200, doc_type: 'PROFORMA' }),
    est('5', { status: 'ACCEPTED', grand_total: 2950, doc_type: 'MANUAL_INVOICE', estimate_number: 'MB-X1' }),
    est('6', { status: 'CONVERTED', grand_total: 9615 }),
    est('7', { status: 'REJECTED', grand_total: 15900 }),
  ];
  it('sums stored totals by status; counts manual bills among the accepted', () => {
    const f = estimateFigures(rows);
    expect(f.sent).toEqual({ amt: 28038, n: 1 });
    expect(f.draft).toEqual({ amt: 19124, n: 2 });
    expect(f.accepted).toEqual({ amt: 44150, n: 2, manual: 1 });
    expect(f.billed).toEqual({ amt: 9615, n: 1 });
  });
  it('type and status counts', () => {
    expect(typeCounts(rows)).toEqual({ ALL: 7, QUOTATION: 4, PROFORMA: 1, DELIVERY_CHALLAN: 1, MANUAL_INVOICE: 1 });
    const s = statusCounts(rows);
    expect(s).toMatchObject({ ALL: 7, DRAFT: 2, SENT: 1, ACCEPTED: 2, CONVERTED: 1, REJECTED: 1, EXPIRED: 0 });
  });
  it('filters by type, status and search (number or client), keeping order', () => {
    expect(filterEstimates(rows, { type: 'QUOTATION' }).map((e) => e.id)).toEqual(['1', '2', '6', '7']);
    expect(filterEstimates(rows, { type: 'QUOTATION', status: 'DRAFT' }).map((e) => e.id)).toEqual(['2']);
    expect(filterEstimates(rows, { query: 'mb-x' }).map((e) => e.id)).toEqual(['5']);
    expect(filterEstimates(rows, { query: 'client 4' }).map((e) => e.id)).toEqual(['4']);
    expect(filterEstimates(rows, { status: 'DRAFT' }).map((e) => e.id)).toEqual(['2', '3']);
  });
});

describe('dates', () => {
  it('estimate_date first, else the shop day it was made (IST, not UTC)', () => {
    expect(estimateDay({ estimate_date: '2026-11-25', created_at: '2026-11-20T10:00:00Z' })).toBe('2026-11-25');
    // 20:00 UTC on the 25th is 01:30 on the 26th in India.
    expect(estimateDay({ created_at: '2026-11-25T20:00:00Z' })).toBe('2026-11-26');
    expect(estimateDay({})).toBe('');
  });
  it('short and long days', () => {
    expect(shortDay('2026-11-03')).toBe('3 Nov');
    expect(longDay('2026-12-05')).toBe('5 Dec 2026');
    expect(longDay('')).toBe('');
  });
  it('validity: days left, last day, late only while open', () => {
    const today = '2026-11-26';
    expect(validity({ valid_until: '2026-12-05', status: 'SENT' }, today)).toEqual({ date: '5 Dec 2026', days: 9, late: false, left: '9 days left' });
    expect(validity({ valid_until: '2026-11-27' }, today).left).toBe('1 day left');
    expect(validity({ valid_until: '2026-11-26' }, today).left).toBe('last day');
    expect(validity({ valid_until: '2026-11-10', status: 'DRAFT' }, today)).toMatchObject({ late: true, left: 'passed' });
    expect(validity({ valid_until: '2026-11-10', status: 'CONVERTED' }, today)).toMatchObject({ late: false, left: '' });
    expect(validity({ valid_until: null }, today)).toBeNull();
  });
});

describe('phone and WhatsApp', () => {
  it('masks the middle of a number', () => {
    expect(maskPhone('9845012214')).toBe('98450 ••• 214');
    expect(maskPhone('+91 98450 12214')).toBe('98450 ••• 214');
    expect(maskPhone('')).toBe('');
    expect(maskPhone('12345')).toBe('••• 345');
  });
  it('wa.me digits: 91 before a bare 10-digit number (today\'s rule)', () => {
    expect(waDigits('98450-12214')).toBe('919845012214');
    expect(waDigits('919845012214')).toBe('919845012214');
  });
  it('message: shop, label and number, validity, lines, GST when taxed, total', () => {
    const e = est('9', {
      doc_type: 'PROFORMA', valid_until: '2026-12-05', tax_total: 1238, grand_total: 28038,
      items: [{ name: 'Rice 25 kg', qty: 4, rate: 2150 }, { name: 'Sugar 1 kg', qty: 40, rate: 46 }],
    });
    const t = whatsappText(e, 'Demo Store');
    expect(t).toContain('*Demo Store*');
    expect(t).toContain('*Proforma: EST-2026-9*');
    expect(t).toContain('Valid until: 5 Dec 2026');
    expect(t).toContain('• Rice 25 kg × 4 = ₹8,600');
    expect(t).toContain('• Sugar 1 kg × 40 = ₹1,840');
    expect(t).toContain('GST: ₹1,238');
    expect(t).toContain('*Total: ₹28,038*');
    expect(whatsappText({ ...e, tax_total: 0 }, '')).not.toContain('GST:');
  });
});

describe('handoff and lines', () => {
  it('hands over id, client and items; never a status', () => {
    const h = estimateHandoff(est('1', { client_id: 'C1', items: [{ id: 'P1', qty: 2, rate: 10 }] }));
    expect(h).toEqual({ estimateId: '1', clientId: 'C1', items: [{ id: 'P1', qty: 2, rate: 10 }] });
    expect(h).not.toHaveProperty('status');
    expect(estimateHandoff({ id: 'x' })).toEqual({ estimateId: 'x', clientId: null, items: [] });
  });
  it('line amount is qty × rate', () => {
    expect(lineAmount({ qty: 4, rate: 2150 })).toBe(8600);
    expect(lineAmount({})).toBe(0);
  });
});
